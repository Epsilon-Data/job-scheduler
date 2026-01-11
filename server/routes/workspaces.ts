import { Router } from "express";
import { storage } from "../storage";
import { insertWorkspaceSchema } from "@shared/schema";
import { githubApi } from "../github";
import { requireAuth, asyncHandler, NotFoundError, ForbiddenError } from "../middleware";

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * Get all workspaces for current user with job counts
 * GET /api/workspaces
 *
 * Response includes jobCounts: { total, completed, running, failed, pending }
 */
router.get("/", asyncHandler(async (req, res) => {
    const workspaces = await storage.getWorkspacesWithJobCountsByUserId(req.session.userId!);
    res.json(workspaces);
}));

/**
 * Get workspace by ID
 * GET /api/workspaces/:id
 */
router.get("/:id", asyncHandler(async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);

    if (!workspace) {
        throw new NotFoundError("Workspace not found");
    }

    // Check if user owns workspace
    if (workspace.userId !== req.session.userId) {
        throw new ForbiddenError("Access denied");
    }

    res.json(workspace);
}));

/**
 * Create a new workspace
 * POST /api/workspaces
 */
router.post("/", asyncHandler(async (req, res) => {
    const validatedData = insertWorkspaceSchema.parse({
        ...req.body,
        userId: req.session.userId,
    });

    const workspace = await storage.createWorkspace({
        ...validatedData,
        userId: req.session.userId!,
    });

    res.json(workspace);
}));

/**
 * Get jobs for a workspace
 * GET /api/workspaces/:id/jobs
 */
router.get("/:id/jobs", asyncHandler(async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);

    if (!workspace) {
        throw new NotFoundError("Workspace not found");
    }

    if (workspace.userId !== req.session.userId) {
        throw new ForbiddenError("Access denied");
    }

    const jobRequests = await storage.getJobRequestsByWorkspaceId(req.params.id);
    res.json(jobRequests);
}));

/**
 * Create a job for a workspace
 * POST /api/workspaces/:id/jobs
 */
router.post("/:id/jobs", asyncHandler(async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);

    if (!workspace) {
        throw new NotFoundError("Workspace not found");
    }

    if (workspace.userId !== req.session.userId) {
        throw new ForbiddenError("Access denied");
    }

    // Get latest commit info from GitHub
    const commitInfo = await githubApi.getLatestCommit(
        workspace.githubRepo,
        workspace.githubBranch,
        req.session.accessToken!
    );

    const jobRequest = await storage.createJobRequest({
        workspaceId: workspace.id,
        userId: req.session.userId!,
        commitSha: commitInfo.sha,
        commitMessage: commitInfo.message,
        commitAuthor: commitInfo.author,
        commitDate: commitInfo.date,
        status: "queued",
    });

    // Update to pending status for job-runner to pick up
    await storage.updateJobRequest(jobRequest.id, {
        status: "pending",
        executionMethod: "job-runner",
    });

    res.json(jobRequest);
}));

export default router;
