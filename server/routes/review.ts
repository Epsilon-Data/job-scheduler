import { Router, type Response } from "express";
import { z } from "zod";
import type { JobOutput, ReleaseDecision, User } from "@shared/schema";
import {
    storage,
    ReleaseDecisionError,
    type ReleaseDecisionFailure,
    type ReviewJobSummary,
} from "../storage";
import { requireAuth, requireReviewer, asyncHandler } from "../middleware";

const router = Router();

// Reviewer-only: these routes return held output, and only for jobs of the reviewer's projects
router.use(requireAuth, requireReviewer);

const REFUSALS: Record<ReleaseDecisionFailure, { status: number; message: string; code?: string }> = {
    not_found: { status: 404, message: "Job not found" },
    no_output: { status: 404, message: "This job has no output held for review" },
    own_job: { status: 403, message: "You cannot review a job you submitted or that belongs to your workspace" },
    not_reviewer: { status: 403, message: "Insufficient permissions" },
    not_pending: { status: 409, message: "This job is not awaiting a release decision" },
    stale_output: { status: 409, message: "The held output does not match output_sha256; reload the job and review it again" },
    no_project: { status: 409, message: "This job has no project, so it cannot be routed to a reviewer" },
    // A job outside the reviewer's projects is answered exactly like an unknown job
    not_assigned: { status: 404, message: "Job not found", code: "NOT_FOUND" },
    assignment_stale: {
        status: 409,
        message: "Your reviewer assignment could not be confirmed; reload the job and try again",
    },
    not_attested: {
        status: 409,
        message: "The held result does not match the output hash the enclave attested, so it cannot be approved",
    },
};

function refuse(res: Response, reason: ReleaseDecisionFailure): void {
    const { status, message, code } = REFUSALS[reason];
    res.status(status).json({ message, code: code ?? reason.toUpperCase() });
}

type AttestedHashes = Pick<JobOutput, "contentSha256" | "attestedOutputHash">;
type AttestationStatus = "matches" | "mismatch" | "not_attested";

function attestationStatusOf(output: AttestedHashes | null): AttestationStatus {
    if (!output?.attestedOutputHash) return "not_attested";
    return output.attestedOutputHash === output.contentSha256 ? "matches" : "mismatch";
}

// Mirrors the decision trigger (RG003, RG009): error text may be approved unattested
function approveBlockedReason(
    job: Pick<ReviewJobSummary["job"], "releaseStatus">,
    output: AttestedHashes & Pick<JobOutput, "kind">,
    allowUnattestedRelease: boolean,
): string | null {
    if (job.releaseStatus !== "pending") return REFUSALS.not_pending.message;
    if (output.kind !== "result" || allowUnattestedRelease) return null;
    switch (attestationStatusOf(output)) {
        case "not_attested":
            return "The enclave did not attest this result, so it cannot be approved";
        case "mismatch":
            return REFUSALS.not_attested.message;
        default:
            return null;
    }
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
        project_id: row.job.projectId,
        archetype_id: row.job.archetypeId,
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
 * The reviewer's projects as last synced from Keycloak, and when they were synced
 * GET /api/review/me (?refresh=1 re-checks with Keycloak first)
 */
router.get("/me", asyncHandler(async (req, res) => {
    const assignments = await storage.getReviewerProjects(req.user!.id);
    const syncTimes = assignments.map((assignment) => assignment.syncedAt.getTime());
    // With no projects there is no row to carry the time: the session's last check is the last sync
    if (req.session.rolesCheckedAt) syncTimes.push(req.session.rolesCheckedAt);

    res.json({
        projects: assignments.map((assignment) => assignment.projectId),
        synced_at: syncTimes.length > 0 ? new Date(Math.max(...syncTimes)).toISOString() : null,
    });
}));

/**
 * Jobs of the reviewer's projects awaiting (or past) a release decision; never includes held content
 * GET /api/review/jobs?status=pending|decided|all (default: pending)
 */
router.get("/jobs", asyncHandler(async (req, res) => {
    const { status } = listQuerySchema.parse(req.query);
    const rows = await storage.getReviewJobs(req.user!.id, status);

    res.json(rows.map((row) => {
        const own = isOwnJob(row, req.user!.id);
        // Like researchers, a reviewer gets nothing derived from their own unreleased output
        const hideOwnOutput = own && row.job.releaseStatus !== "released";
        return {
            ...summarize(row),
            output_kind: row.output?.kind ?? null,
            output_size: hideOwnOutput ? null : row.output?.sizeBytes ?? null,
            attestation_status: hideOwnOutput ? null : attestationStatusOf(row.output),
            own_job: own,
            ai_decision: aiDecisionOf(row.job),
            // ... and is not told who decided on their own job
            decision: row.decision ? toDecision(row.decision, own ? null : row.reviewer, !hideOwnOutput) : null,
        };
    }));
}));

/**
 * Held output of a job for review (404 outside the reviewer's projects, 403 for the reviewer's own job)
 * GET /api/review/jobs/:jobId
 */
router.get("/jobs/:jobId", asyncHandler(async (req, res) => {
    const row = await storage.getReviewJob(req.user!.id, req.params.jobId);
    if (!row) return refuse(res, "not_found");
    if (isOwnJob(row, req.user!.id)) return refuse(res, "own_job");
    if (!row.output) return refuse(res, "no_output");

    const { job, output } = row;
    const confidence = job.validationStatus ? Number(job.validationStatus) : NaN;

    res.json({
        ...summarize(row),
        commit_sha: job.commitSha,
        attestation_status: attestationStatusOf(output),
        // null when Approve is allowed
        approve_blocked_reason: approveBlockedReason(job, output, row.allowUnattestedRelease),
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
