import { Router } from "express";
import { storage } from "../storage";
import { requireStaff, asyncHandler } from "../middleware";

const router = Router();

// Apply staff middleware to all routes in this router
router.use(requireStaff);

/**
 * Get all users
 * GET /api/staff/users
 */
router.get("/users", asyncHandler(async (req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
}));

/**
 * Get pending users awaiting approval
 * GET /api/staff/users/pending
 */
router.get("/users/pending", asyncHandler(async (req, res) => {
    const pendingUsers = await storage.getPendingUsers();
    res.json(pendingUsers);
}));

/**
 * Approve a user
 * POST /api/staff/users/:id/approve
 */
router.post("/users/:id/approve", asyncHandler(async (req, res) => {
    const approvedUser = await storage.approveUser(req.params.id, req.user!.id);
    res.json(approvedUser);
}));

/**
 * Reject a user
 * POST /api/staff/users/:id/reject
 */
router.post("/users/:id/reject", asyncHandler(async (req, res) => {
    const rejectedUser = await storage.rejectUser(req.params.id);
    res.json(rejectedUser);
}));

/**
 * Get all workspaces (admin view)
 * GET /api/staff/workspaces
 */
router.get("/workspaces", asyncHandler(async (req, res) => {
    const allWorkspaces = await storage.getAllWorkspaces();
    res.json(allWorkspaces);
}));

/**
 * Get all jobs (admin view)
 * GET /api/staff/jobs
 */
router.get("/jobs", asyncHandler(async (req, res) => {
    const allJobs = await storage.getAllJobRequestsWithDetails();
    res.json(allJobs);
}));

export default router;
