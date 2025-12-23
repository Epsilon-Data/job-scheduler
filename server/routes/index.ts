import type { Express } from "express";
import { createServer, type Server } from "http";

import authRoutes from "./auth";
import staffRoutes from "./staff";
import workspaceRoutes from "./workspaces";
import jobRoutes from "./jobs";
import githubRoutes from "./github";

/**
 * Register all API routes
 */
export async function registerRoutes(app: Express): Promise<Server> {
    // Health check endpoint for Docker/Kubernetes
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Auth routes (login, logout, OAuth callbacks)
    app.use("/api/auth", authRoutes);

    // Also mount approval-request at root level for backwards compatibility
    app.post("/api/approval-request", authRoutes);

    // Staff admin routes
    app.use("/api/staff", staffRoutes);

    // Workspace routes
    app.use("/api/workspaces", workspaceRoutes);

    // Job routes (includes /api/jobs, /api/user/jobs)
    app.use("/api", jobRoutes);

    // GitHub API routes
    app.use("/api/github", githubRoutes);

    const httpServer = createServer(app);
    return httpServer;
}
