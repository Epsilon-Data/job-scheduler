import { Router, type Response } from "express";
import { z } from "zod";
import type { ReleaseDecision, User } from "@shared/schema";
import {
    storage,
    ReleaseDecisionError,
    type ReleaseDecisionFailure,
    type ReviewJobSummary,
} from "../storage";
import { requireAuth, requireReviewer, asyncHandler } from "../middleware";

const router = Router();

// Reviewer-only: these routes return held output
router.use(requireAuth, requireReviewer);

const REFUSALS: Record<ReleaseDecisionFailure, { status: number; message: string }> = {
    not_found: { status: 404, message: "Job not found" },
    no_output: { status: 404, message: "This job has no output held for review" },
    own_job: { status: 403, message: "You cannot review a job you submitted or that belongs to your workspace" },
    not_reviewer: { status: 403, message: "Insufficient permissions" },
    not_pending: { status: 409, message: "This job is not awaiting a release decision" },
    stale_output: { status: 409, message: "The held output does not match output_sha256; reload the job and review it again" },
};

function refuse(res: Response, reason: ReleaseDecisionFailure): void {
    const { status, message } = REFUSALS[reason];
    res.status(status).json({ message, code: reason.toUpperCase() });
}

type Person = Pick<User, "id" | "username" | "fullName">;

const toPerson = (person: Person) => ({ id: person.id, username: person.username, full_name: person.fullName });

function toDecision(decision: ReleaseDecision, reviewer: Person | null, showOutputHash = true) {
    return {
        id: decision.id,
        decision: decision.decision,
        reason: decision.reason,
        output_sha256: showOutputHash ? decision.outputSha256 : null,
        decided_at: decision.decidedAt,
        reviewer: reviewer ? toPerson(reviewer) : null,
    };
}

function isOwnJob(row: Pick<ReviewJobSummary, "job" | "workspace">, userId: string): boolean {
    return row.job.userId === userId || row.workspace.userId === userId;
}

function parseJsonObject(text: string | null): Record<string, unknown> | null {
    if (!text) return null;
    try {
        const value = JSON.parse(text);
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
        return null;
    }
}

function aiDecisionOf(job: ReviewJobSummary["job"]): string | null {
    const fromMetrics = parseJsonObject(job.executionMetrics)?.ai_decision;
    return job.aiDecision ?? (typeof fromMetrics === "string" ? fromMetrics : null);
}

function summarize(row: Omit<ReviewJobSummary, "output">) {
    return {
        job_id: row.job.jobId,
        status: row.job.status,
        release_status: row.job.releaseStatus,
        completed_at: row.job.completedAt,
        submitted_by: toPerson(row.submitter),
        workspace: { id: row.workspace.id, name: row.workspace.name, github_repo: row.workspace.githubRepo },
    };
}

const listQuerySchema = z.object({
    status: z.enum(["pending", "decided", "all"]).default("pending"),
});

const decisionSchema = z
    .object({
        decision: z.enum(["approve", "reject"]),
        reason: z.string().nullish(),
        output_sha256: z.string().regex(/^[0-9a-f]{64}$/i, "output_sha256 must be a hex SHA-256 digest"),
    })
    .refine((body) => body.decision === "approve" || !!body.reason?.trim(), {
        message: "A reason is required to reject a release",
        path: ["reason"],
    });

/**
 * Jobs awaiting (or past) a release decision; never includes held content
 * GET /api/review/jobs?status=pending|decided|all (default: pending)
 */
router.get("/jobs", asyncHandler(async (req, res) => {
    const { status } = listQuerySchema.parse(req.query);
    const rows = await storage.getReviewJobs(status);

    res.json(rows.map((row) => {
        const own = isOwnJob(row, req.user!.id);
        // Like researchers, a reviewer gets nothing derived from their own unreleased output
        const hideOwnOutput = own && row.job.releaseStatus !== "released";
        return {
            ...summarize(row),
            output_kind: row.output?.kind ?? null,
            output_size: hideOwnOutput ? null : row.output?.sizeBytes ?? null,
            own_job: own,
            ai_decision: aiDecisionOf(row.job),
            // ... and is not told who decided on their own job
            decision: row.decision ? toDecision(row.decision, own ? null : row.reviewer, !hideOwnOutput) : null,
        };
    }));
}));

/**
 * Held output of a job for review (403 for the reviewer's own job)
 * GET /api/review/jobs/:jobId
 */
router.get("/jobs/:jobId", asyncHandler(async (req, res) => {
    const row = await storage.getReviewJob(req.params.jobId);
    if (!row) return refuse(res, "not_found");
    if (isOwnJob(row, req.user!.id)) return refuse(res, "own_job");
    if (!row.output) return refuse(res, "no_output");

    const { job, output } = row;
    const confidence = job.validationStatus ? Number(job.validationStatus) : NaN;

    res.json({
        ...summarize(row),
        commit_sha: job.commitSha,
        output: {
            kind: output.kind,
            content: output.content,
            content_sha256: output.contentSha256,
            attested_output_hash: output.attestedOutputHash,
            hash_matches_attestation: output.attestedOutputHash
                ? output.attestedOutputHash === output.contentSha256
                : null,
            size_bytes: Buffer.byteLength(output.content, "utf8"),
        },
        verification_receipt: parseJsonObject(job.verificationReceipt),
        // Advisory only: from the AI review of a dummy-data run, never gates release
        ai: {
            decision: aiDecisionOf(job),
            confidence: Number.isFinite(confidence) ? confidence : null,
            reasoning: job.validationDecision,
        },
        decision: row.decision ? toDecision(row.decision, row.reviewer) : null,
    });
}));

/**
 * Approve or reject the release of a job's held output
 * POST /api/review/jobs/:jobId/decision
 * Body: { decision: "approve" | "reject", reason?: string, output_sha256: string }
 */
router.post("/jobs/:jobId/decision", asyncHandler(async (req, res) => {
    const body = decisionSchema.parse(req.body);

    try {
        const { decision, releaseStatus } = await storage.recordReleaseDecision({
            jobId: req.params.jobId,
            reviewerId: req.user!.id,
            decision: body.decision,
            reason: body.reason?.trim() || null,
            outputSha256: body.output_sha256.toLowerCase(),
        });
        res.status(201).json({ decision: toDecision(decision, req.user!), release_status: releaseStatus });
    } catch (error) {
        if (error instanceof ReleaseDecisionError) return refuse(res, error.reason);
        throw error;
    }
}));

export default router;
