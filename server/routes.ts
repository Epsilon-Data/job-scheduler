import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertWorkspaceSchema, insertJobRequestSchema, approvalRequestSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { githubApi } from "./github";

export async function registerRoutes(app: Express): Promise<Server> {
  // GitHub OAuth routes
  app.get("/api/auth/github", async (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "GitHub OAuth not configured" });
    }
    
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/github/callback`;
    const scope = "user:email,read:user,repo";
    const state = Math.random().toString(36).substring(2, 15);
    
    // Store state in session for security
    req.session.oauthState = state;
    
    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
    res.redirect(githubUrl);
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state || state !== req.session.oauthState) {
        return res.status(400).json({ message: "Invalid OAuth callback" });
      }
      
      const { accessToken, user: githubUser } = await githubApi.exchangeCodeForToken(code as string, req);
      
      // Check if user exists
      let user = await storage.getUserByGithubId(githubUser.id.toString());
      
      if (!user) {
        // Create new user
        user = await storage.createUser({
          githubId: githubUser.id.toString(),
          username: githubUser.login,
          email: githubUser.email || '',
          fullName: githubUser.name || '',
          avatarUrl: githubUser.avatar_url || '',
          role: "user",
          approvalStatus: "pending",
        });
      }
      
      // Store user in session
      req.session.userId = user.id;
      req.session.accessToken = accessToken;
      
      // Redirect based on approval status
      if (user.approvalStatus === "pending") {
        res.redirect("/approval-request");
      } else if (user.approvalStatus === "approved") {
        res.redirect("/dashboard");
      } else {
        res.redirect("/auth?error=rejected");
      }
    } catch (error) {
      console.error("GitHub OAuth error:", error);
      res.redirect("/auth?error=oauth_failed");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Current user route
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json(user);
  });

  // Approval request
  app.post("/api/approval-request", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const validatedData = approvalRequestSchema.parse(req.body);
      
      const user = await storage.updateUser(req.session.userId, {
        researchPurpose: validatedData.researchPurpose,
        institution: validatedData.institution,
        expectedDuration: validatedData.expectedDuration,
      });
      
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: fromZodError(error).toString() });
      }
      throw error;
    }
  });

  // Staff routes
  app.get("/api/staff/users", async (req, res) => {
    const user = await storage.getUser(req.session.userId || "");
    if (!user || user.role !== "staff") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.get("/api/staff/users/pending", async (req, res) => {
    const user = await storage.getUser(req.session.userId || "");
    if (!user || user.role !== "staff") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const pendingUsers = await storage.getPendingUsers();
    res.json(pendingUsers);
  });

  app.post("/api/staff/users/:id/approve", async (req, res) => {
    const user = await storage.getUser(req.session.userId || "");
    if (!user || user.role !== "staff") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const approvedUser = await storage.approveUser(req.params.id, user.id);
    res.json(approvedUser);
  });

  app.post("/api/staff/users/:id/reject", async (req, res) => {
    const user = await storage.getUser(req.session.userId || "");
    if (!user || user.role !== "staff") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const rejectedUser = await storage.rejectUser(req.params.id);
    res.json(rejectedUser);
  });

  // Workspace routes
  app.get("/api/workspaces", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const workspaces = await storage.getWorkspacesByUserId(req.session.userId);
    res.json(workspaces);
  });

  app.get("/api/workspaces/:id", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    // Check if user owns workspace
    if (workspace.userId !== req.session.userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    res.json(workspace);
  });

  app.post("/api/workspaces", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const validatedData = insertWorkspaceSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      
      // Get latest commit info from GitHub
      const commitInfo = await githubApi.getLatestCommit(
        validatedData.githubRepo,
        validatedData.githubBranch,
        req.session.accessToken
      );
      
      const workspace = await storage.createWorkspace({
        ...validatedData,
        lastCommitSha: commitInfo.sha,
        lastCommitMessage: commitInfo.message,
        lastCommitAuthor: commitInfo.author,
        lastCommitDate: commitInfo.date,
      });
      
      res.json(workspace);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: fromZodError(error).toString() });
      }
      throw error;
    }
  });

  // Job Request routes
  app.get("/api/workspaces/:id/jobs", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace || workspace.userId !== req.session.userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const jobRequests = await storage.getJobRequestsByWorkspaceId(req.params.id);
    res.json(jobRequests);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const jobRequest = await storage.getJobRequest(req.params.id);
    if (!jobRequest) {
      return res.status(404).json({ message: "Job request not found" });
    }
    
    // Check if user owns job request
    if (jobRequest.userId !== req.session.userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    res.json(jobRequest);
  });

  app.post("/api/workspaces/:id/jobs", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace || workspace.userId !== req.session.userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    try {
      // Get latest commit info from GitHub
      const commitInfo = await githubApi.getLatestCommit(
        workspace.githubRepo,
        workspace.githubBranch,
        req.session.accessToken
      );
      
      const jobRequest = await storage.createJobRequest({
        workspaceId: workspace.id,
        userId: req.session.userId,
        commitSha: commitInfo.sha,
        commitMessage: commitInfo.message,
        commitAuthor: commitInfo.author,
        commitDate: commitInfo.date,
        status: "queued",
      });
      
      res.json(jobRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: fromZodError(error).toString() });
      }
      throw error;
    }
  });

  // GitHub API routes
  app.get("/api/github/repos", async (req, res) => {
    if (!req.session.userId || !req.session.accessToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const repos = await githubApi.getUserRepos(req.session.accessToken);
      res.json(repos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch repositories" });
    }
  });

  app.get("/api/github/repos/:owner/:repo/branches", async (req, res) => {
    if (!req.session.userId || !req.session.accessToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const branches = await githubApi.getRepoBranches(
        `${req.params.owner}/${req.params.repo}`,
        req.session.accessToken
      );
      res.json(branches);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branches" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
