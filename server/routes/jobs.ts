import { Router } from "express";
import { storage } from "../storage";
import { type JobLogEntry } from "@shared/schema";
import { githubApi } from "../github";
import { requireAuth, asyncHandler, NotFoundError, ForbiddenError } from "../middleware";

const router = Router();

/**
 * Get all jobs for current user with pagination
 * GET /api/user/jobs
 * Query params:
 *   - page: number (default: 1)
 *   - limit: number (default: 10, max: 100)
 *   - status: string (optional, filter by job status)
 */
router.get("/user/jobs", requireAuth, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string | undefined;

    const result = await storage.getJobRequestsByUserIdPaginated(
        req.session.userId!,
        { page, limit, status }
    );

    res.json(result);
}));

/**
 * Get job by jobId (JOB-XXXXX format)
 * GET /api/jobs/:jobId
 */
router.get("/jobs/:jobId", requireAuth, asyncHandler(async (req, res) => {
    // Expects jobId format (JOB-XXXXX)
    const jobRequest = await storage.getJobRequestByJobId(req.params.jobId);

    if (!jobRequest) {
        throw new NotFoundError("Job request not found");
    }

    // Check if user owns job request
    if (jobRequest.userId !== req.session.userId) {
        throw new ForbiddenError("Access denied");
    }

    // Get job logs
    let detailedLogs: JobLogEntry[] = [];
    try {
        detailedLogs = await storage.getJobLogs(jobRequest.jobId);
    } catch (error) {
        console.warn(`Could not fetch job logs for ${jobRequest.jobId}:`, (error as Error).message);
    }

    const workspace = await storage.getWorkspace(jobRequest.workspaceId);

    // Calculate duration for completed jobs
    let calculatedDuration = jobRequest.durationSeconds;
    let calculatedCompletedAt = jobRequest.completedAt;

    if (!calculatedDuration && jobRequest.status === "success") {
        const startTime = jobRequest.startedAt || jobRequest.createdAt;
        const endTime = jobRequest.completedAt || jobRequest.updatedAt;
        if (startTime && endTime) {
            calculatedDuration = Math.round(
                (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
            );
            calculatedCompletedAt = calculatedCompletedAt || endTime;
        }
    }

    if (!calculatedCompletedAt && jobRequest.status === "success" && jobRequest.updatedAt) {
        calculatedCompletedAt = jobRequest.updatedAt;
    }

    res.json({
        id: jobRequest.jobId,
        github_repo: workspace?.githubRepo,
        branch_name: workspace?.githubBranch,
        status: jobRequest.status,
        created_at: jobRequest.createdAt,
        updated_at: jobRequest.updatedAt,
        started_at: jobRequest.startedAt,
        completed_at: calculatedCompletedAt,
        duration_seconds: calculatedDuration,
        exit_code: jobRequest.exitCode,
        result_metadata: jobRequest.resultMetadata,
        error_message: jobRequest.errorMessage,
        execution_output: jobRequest.executionOutput,
        execution_error: jobRequest.executionError,
        commit_hash: jobRequest.commitSha,
        commit_message: jobRequest.commitMessage,
        commit_time: jobRequest.commitDate,
        execution_method: jobRequest.executionMethod,
        validation_status: jobRequest.validationStatus,
        validation_policy: jobRequest.validationPolicy,
        validation_decision: jobRequest.validationDecision,
        attestation: jobRequest.attestation,
        ai_enabled: jobRequest.aiEnabled,
        zkp_enabled: jobRequest.zkpEnabled,
        detailed_logs: detailedLogs,
        ai_logs: detailedLogs
            ?.filter(log => log.worker_name === "AIAgentWorker")
            .map(log => {
                const timestamp = log.created_at || log.createdAt;
                return `[${timestamp ? new Date(timestamp).toLocaleString() : "Unknown"}] ${log.level.toUpperCase()}: ${log.message}${log.logMetadata ? " | " + JSON.stringify(log.logMetadata) : ""}`;
            })
            .join("\n") || jobRequest.aiLogs,
    });
}));

/**
 * List all jobs for current user (job-server compatible)
 * GET /api/jobs
 */
router.get("/jobs", requireAuth, asyncHandler(async (req, res) => {
    const jobRequests = await storage.getJobRequestsByUserId(req.session.userId!);

    const jobsWithWorkspace = await Promise.all(
        jobRequests.map(async (job) => {
            const workspace = await storage.getWorkspace(job.workspaceId);
            return {
                id: job.jobId,
                github_repo: workspace?.githubRepo,
                branch_name: workspace?.githubBranch,
                status: job.status,
                created_at: job.createdAt,
                updated_at: job.updatedAt,
                started_at: job.startedAt,
                completed_at: job.completedAt,
                duration_seconds: job.durationSeconds,
                exit_code: job.exitCode,
                result_metadata: job.resultMetadata,
                error_message: job.errorMessage,
                execution_output: job.executionOutput,
                execution_error: job.executionError,
                commit_hash: job.commitSha,
                commit_message: job.commitMessage,
                commit_time: job.commitDate,
                execution_method: job.executionMethod,
                validation_status: job.validationStatus,
                validation_policy: job.validationPolicy,
                validation_decision: job.validationDecision
            };
        })
    );

    res.json(jobsWithWorkspace);
}));

/**
 * Create a new job (job-server compatible)
 * POST /api/jobs
 */
router.post("/jobs", requireAuth, asyncHandler(async (req, res) => {
    const { github_repo, branch_name } = req.body;

    if (!github_repo || !branch_name) {
        res.status(400).json({ message: "github_repo and branch_name are required" });
        return;
    }

    // Find or create workspace for this repo
    const userWorkspaces = await storage.getWorkspacesByUserId(req.session.userId!);
    let workspace = userWorkspaces.find(
        w => w.githubRepo === github_repo && w.githubBranch === branch_name
    );

    if (!workspace) {
        workspace = await storage.createWorkspace({
            name: `${github_repo} (${branch_name})`,
            description: `Auto-created workspace for ${github_repo}`,
            userId: req.session.userId!,
            githubRepo: github_repo,
            githubBranch: branch_name,
            status: "active"
        });
    }

    // Get commit info
    const commitInfo = await githubApi.getLatestCommit(
        github_repo,
        branch_name,
        req.session.accessToken!
    );

    // Check feature flags from environment
    const aiEnabled = process.env.AI_ENABLED === 'true';
    const zkpEnabled = process.env.ZKP_ENABLED === 'true';

    const jobRequest = await storage.createJobRequest({
        workspaceId: workspace.id,
        userId: req.session.userId!,
        commitSha: commitInfo.sha,
        commitMessage: commitInfo.message,
        commitAuthor: commitInfo.author,
        commitDate: commitInfo.date,
        status: "queued",
        aiEnabled,
        zkpEnabled,
    });

    // Update to pending status for job-runner to pick up
    await storage.updateJobRequest(jobRequest.id, {
        status: "pending",
        executionMethod: "job-runner",
    });

    res.json({
        id: jobRequest.jobId,
        github_repo: workspace.githubRepo,
        branch_name: workspace.githubBranch,
        status: jobRequest.status,
        created_at: jobRequest.createdAt,
        updated_at: jobRequest.updatedAt
    });
}));

export default router;
