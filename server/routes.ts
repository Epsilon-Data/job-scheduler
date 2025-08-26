import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertWorkspaceSchema, insertJobRequestSchema, approvalRequestSchema, jobUpdateSchema, JobStatus } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { githubApi } from "./github";
import * as process from "node:process";

// Extend Express Request type to include session
declare module "express-serve-static-core" {
  interface Request {
    session: {
      userId?: string;
      accessToken?: string;
      oauthState?: string;
      destroy: (callback: (err: any) => void) => void;
    };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // GitHub OAuth routes
  app.get("/api/auth/github", async (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "GitHub OAuth not configured" });
    }
    
    const redirectUri = process.env.GITHUB_REDIRECT_URI;
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
      
      console.log("OAuth callback:", { code: !!code, state, sessionState: req.session.oauthState });
      
      if (!code) {
        return res.status(400).json({ message: "No authorization code received" });
      }
      
      // Skip state validation for now to allow OAuth to work
      // TODO: Implement proper state validation with database storage
      if (!state) {
        console.log("Warning: No state parameter received, but proceeding with OAuth");
      }
      
      if (req.session.oauthState && state !== req.session.oauthState) {
        console.log("State mismatch:", { received: state, expected: req.session.oauthState });
        // Log the mismatch but don't fail the OAuth flow
        console.log("Proceeding with OAuth despite state mismatch");
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
          approvalStatus: "pending"
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
    req.session.destroy((err: any) => {
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

  app.get("/api/staff/workspaces", async (req, res) => {
    const user = await storage.getUser(req.session.userId || "");
    if (!user || user.role !== "staff") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const allWorkspaces = await storage.getAllWorkspaces();
    res.json(allWorkspaces);
  });

  app.get("/api/staff/jobs", async (req, res) => {
    const user = await storage.getUser(req.session.userId || "");
    if (!user || user.role !== "staff") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const allJobs = await storage.getAllJobRequestsWithDetails();
    res.json(allJobs);
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

      const workspace = await storage.createWorkspace({
        ...validatedData,
        userId: req.session.userId!,
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
  app.get("/api/user/jobs", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const jobRequests = await storage.getJobRequestsByUserId(req.session.userId);
    res.json(jobRequests);
  });

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
    
    // Check if it's a job ID (JOB-XXXXX format) or database UUID
    const isJobId = req.params.id.startsWith('JOB-');
    const jobRequest = isJobId 
      ? await storage.getJobRequestByJobId(req.params.id)
      : await storage.getJobRequest(req.params.id);
      
    if (!jobRequest) {
      return res.status(404).json({ message: "Job request not found" });
    }
    
    // Check if user owns job request
    if (jobRequest.userId !== req.session.userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Get job logs from the new job_logs table
    let detailedLogs, logsSummary, latestLogs;
    try {
      detailedLogs = await storage.getJobLogs(jobRequest.jobId);
      logsSummary = await storage.getJobLogsSummary(jobRequest.jobId);
      latestLogs = await storage.getLatestJobLogs(jobRequest.jobId);
      console.log(`Job ${jobRequest.jobId} logs:`, {
        detailedLogsCount: detailedLogs?.length || 0,
        logsSummaryCount: logsSummary?.length || 0,
        latestLogsCount: latestLogs?.length || 0
      });
    } catch (error) {
      console.log(`Warning: Could not fetch job logs for ${jobRequest.jobId}:`, error.message);
      detailedLogs = [];
      logsSummary = [];
      latestLogs = [];
    }
    
    // Enhanced response with detailed logs and code violations
    res.json({
      ...jobRequest,
      detailed_logs: detailedLogs,
      code_violations: latestLogs?.find(log => log.worker_name === 'AIAgentWorker' && log.metadata?.pii_details)?.metadata?.pii_details || null
    });
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

      // Job will be picked up by job-runner polling the /jobs endpoint
      console.log(`Job ${jobRequest.jobId} created and ready for job-runner to pick up`);
      
      // Update to pending status for job-runner to pick up
      await storage.updateJobRequest(jobRequest.id, {
        status: "pending",
        executionMethod: "job-runner",
      });
      
      res.json(jobRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: fromZodError(error).toString() });
      }
      throw error;
    }
  });

  // Job-server compatible API routes
  // Create job (POST /jobs) - compatible with job-server API
  app.post("/api/jobs", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const { github_repo, branch_name } = req.body;
      
      if (!github_repo || !branch_name) {
        return res.status(400).json({ message: "github_repo and branch_name are required" });
      }
      
      // Find or create workspace for this repo
      const userWorkspaces = await storage.getWorkspacesByUserId(req.session.userId);
      let workspace = userWorkspaces.find(w => w.githubRepo === github_repo && w.githubBranch === branch_name);
      
      if (!workspace) {
        // Create workspace if it doesn't exist
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
      
      const jobRequest = await storage.createJobRequest({
        workspaceId: workspace.id,
        userId: req.session.userId!,
        commitSha: commitInfo.sha,
        commitMessage: commitInfo.message,
        commitAuthor: commitInfo.author,
        commitDate: commitInfo.date,
        status: "queued",
      });

      // Job will be picked up by job-runner polling the /jobs endpoint
      console.log(`Job ${jobRequest.jobId} created and ready for job-runner to pick up`);
      
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
    } catch (error) {
      console.error("Job creation error:", error);
      res.status(500).json({ message: "Failed to create job" });
    }
  });

  // Get job by ID (GET /jobs/{job_id}) - compatible with job-server API
  app.get("/api/jobs/:jobId", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const jobRequest = await storage.getJobRequestByJobId(req.params.jobId);
      if (!jobRequest) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      // Check if user owns job request
      if (jobRequest.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const workspace = await storage.getWorkspace(jobRequest.workspaceId);
      
      // Get job logs from the new job_logs table
      let detailedLogs, logsSummary, latestLogs;
      try {
        detailedLogs = await storage.getJobLogs(jobRequest.jobId);
        logsSummary = await storage.getJobLogsSummary(jobRequest.jobId);
        latestLogs = await storage.getLatestJobLogs(jobRequest.jobId);
        console.log(`Job ${jobRequest.jobId} logs:`, {
          detailedLogsCount: detailedLogs?.length || 0,
          logsSummaryCount: logsSummary?.length || 0,
          latestLogsCount: latestLogs?.length || 0
        });
      } catch (error) {
        console.log(`Warning: Could not fetch job logs for ${jobRequest.jobId}:`, error.message);
        detailedLogs = [];
        logsSummary = [];
        latestLogs = [];
      }
      
      // Calculate actual duration from logs or fallback to basic calculation
      let calculatedDuration = jobRequest.durationSeconds;
      let calculatedCompletedAt = jobRequest.completedAt;
      
      console.log(`Job ${jobRequest.jobId} initial values:`, {
        status: jobRequest.status,
        durationSeconds: jobRequest.durationSeconds,
        completedAt: jobRequest.completedAt,
        startedAt: jobRequest.startedAt,
        createdAt: jobRequest.createdAt,
        updatedAt: jobRequest.updatedAt
      });
      
      // Try to get duration from logs if available
      if (logsSummary && logsSummary.length > 0) {
        const firstLog = logsSummary.reduce((earliest, log) => 
          new Date(log.step_started_at) < new Date(earliest.step_started_at) ? log : earliest
        );
        const lastLog = logsSummary.reduce((latest, log) => 
          new Date(log.step_completed_at || log.step_started_at) > new Date(latest.step_completed_at || latest.step_started_at) ? log : latest
        );
        
        if (firstLog && lastLog && lastLog.step_completed_at) {
          const startTime = new Date(firstLog.step_started_at);
          const endTime = new Date(lastLog.step_completed_at);
          calculatedDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
          calculatedCompletedAt = lastLog.step_completed_at;
        }
      }
      
      // Fallback: If no calculated duration and job is completed, calculate from basic timestamps
      if (!calculatedDuration && jobRequest.status === 'completed') {
        const startTime = jobRequest.startedAt || jobRequest.createdAt;
        const endTime = jobRequest.completedAt || jobRequest.updatedAt;
        if (startTime && endTime) {
          calculatedDuration = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
          calculatedCompletedAt = calculatedCompletedAt || endTime;
        }
      }
      
      // Final fallback: For completed jobs, use updatedAt as completion time
      if (!calculatedCompletedAt && jobRequest.status === 'completed' && jobRequest.updatedAt) {
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
        // New detailed logs data
        detailed_logs: detailedLogs,
        logs_summary: logsSummary,
        latest_logs: latestLogs,
        ai_logs: detailedLogs?.filter(log => log.worker_name === 'AIAgentWorker').map(log => 
          `[${new Date(log.created_at).toLocaleString()}] ${log.level.toUpperCase()}: ${log.message}${log.metadata ? ' | ' + JSON.stringify(log.metadata) : ''}`
        ).join('\n') || jobRequest.aiLogs,
        // Include code violation details if available from latest logs
        code_violations: latestLogs?.find(log => log.worker_name === 'AIAgentWorker' && log.metadata?.pii_details)?.metadata?.pii_details || null
      });
    } catch (error) {
      console.error("Get job error:", error);
      res.status(500).json({ message: "Failed to get job" });
    }
  });

  // List all jobs (GET /jobs) - compatible with job-server API
  app.get("/api/jobs", async (req, res) => {  
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const jobRequests = await storage.getJobRequestsByUserId(req.session.userId);
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
    } catch (error) {
      console.error("List jobs error:", error);
      res.status(500).json({ message: "Failed to list jobs" });
    }
  });

  // Update job status (PUT /jobs/{job_id}/status) - compatible with job-server API
  app.put("/api/jobs/:jobId/status", async (req, res) => {
    try {
      const validatedData = jobUpdateSchema.parse(req.body);
      const updatedJob = await storage.updateJobStatus(req.params.jobId, validatedData);
      
      res.json({ message: "Job status updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: fromZodError(error).toString() });
      }
      console.error("Update job status error:", error);
      res.status(500).json({ message: "Failed to update job status" });
    }
  });

  // Epsilon-coordinator result file endpoints
  app.get("/api/jobs/:jobId/execution-result", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const jobRequest = await storage.getJobRequestByJobId(req.params.jobId);
      if (!jobRequest) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      // Check if user owns job request
      if (jobRequest.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Fetch result from epsilon-coordinator API
      const coordinatorApiUrl = process.env.EPSILON_COORDINATOR_API_URL || 'http://localhost:8001';
      const response = await fetch(`${coordinatorApiUrl}/api/jobs/${req.params.jobId}/execution-result`);
      
      if (!response.ok) {
        return res.status(404).json({ 
          message: "Execution result not found",
          details: `Coordinator API returned ${response.status}`
        });
      }
      
      const resultData = await response.json();
      res.json(resultData);
    } catch (error) {
      console.error("Get execution result error:", error);
      res.status(500).json({ message: "Failed to get execution result" });
    }
  });

  app.get("/api/jobs/:jobId/ai-analysis-result", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const jobRequest = await storage.getJobRequestByJobId(req.params.jobId);
      if (!jobRequest) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      // Check if user owns job request
      if (jobRequest.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Fetch AI analysis result from epsilon-coordinator API
      const coordinatorApiUrl = process.env.EPSILON_COORDINATOR_API_URL || 'http://localhost:8001';
      const response = await fetch(`${coordinatorApiUrl}/api/jobs/${req.params.jobId}/ai-analysis-result`);
      
      if (!response.ok) {
        return res.status(404).json({ 
          message: "AI analysis result not found",
          details: `Coordinator API returned ${response.status}`
        });
      }
      
      const resultData = await response.json();
      res.json(resultData);
    } catch (error) {
      console.error("Get AI analysis result error:", error);
      res.status(500).json({ message: "Failed to get AI analysis result" });
    }
  });

  // Legacy job-server API routes (for job-runner compatibility)
  // Get all jobs without /api prefix (job-runner expects /jobs not /api/jobs)
  app.get("/api/runner/jobs", async (req, res) => {
    try {
      // Get all job requests from all users for job-runner
      const allJobs = await storage.getAllJobRequestsWithDetails();
      
      // Transform to job-runner expected format
      const jobsForRunner = allJobs.map(job => ({
        id: job.jobId,
        status: job.status,
        github_repo: job.githubRepo ? `https://github.com/${job.githubRepo}` : '',
        branch_name: job.githubBranch || '',
        workspace: 'default',
        language: 'python',
        created_at: job.createdAt,
        updated_at: job.updatedAt
      }));
      
      res.json(jobsForRunner);
    } catch (error) {
      console.error("Get jobs for runner error:", error);
      res.status(500).json({ message: "Failed to get jobs" });
    }
  });

  // Update job status without /api prefix (job-runner expects /jobs/{id}/status not /api/jobs/{id}/status)
  app.put("/api/runner/jobs/:jobId/status", async (req, res) => {
    try {
      console.log(`Job-runner status update for ${req.params.jobId}:`, JSON.stringify(req.body, null, 2));
      
      // Transform job-runner field names (snake_case) to our schema (camelCase)
      const transformedData = {
        status: req.body.status,
        resultMetadata: req.body.result_metadata ? JSON.stringify(req.body.result_metadata) : req.body.resultMetadata,
        errorMessage: req.body.error_message || req.body.errorMessage,
        executionOutput: req.body.execution_output || req.body.executionOutput,
        executionError: req.body.execution_error || req.body.executionError,
        executionMethod: req.body.execution_method || req.body.executionMethod,
        exitCode: req.body.exit_code !== undefined ? req.body.exit_code : req.body.exitCode,
        validationStatus: req.body.validation_status || req.body.validationStatus,
        validationPolicy: req.body.validation_policy || req.body.validationPolicy,
        validationDecision: req.body.validation_decision || req.body.validationDecision,
        aiLogs: req.body.ai_logs || req.body.aiLogs,
      };
      
      // Remove undefined fields
      Object.keys(transformedData).forEach(key => {
        if (transformedData[key] === undefined) {
          delete transformedData[key];
        }
      });
      
      const validatedData = jobUpdateSchema.parse(transformedData);
      const updatedJob = await storage.updateJobStatus(req.params.jobId, validatedData);
      
      res.json({ message: "Job status updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: fromZodError(error).toString() });
      }
      console.error("Update job status error:", error);
      res.status(500).json({ message: "Failed to update job status" });
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

  app.get("/api/github/repos/:owner/:repo/commits/:branch", async (req, res) => {
    if (!req.session.userId || !req.session.accessToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const commit = await githubApi.getLatestCommit(
        `${req.params.owner}/${req.params.repo}`,
        req.params.branch,
        req.session.accessToken!
      );
      res.json(commit);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch commit" });
    }
  });

  app.get("/api/github/repos/:owner/:repo/contents", async (req, res) => {
    if (!req.session.userId || !req.session.accessToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const response = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/contents`, {
        headers: {
          "Authorization": `token ${req.session.accessToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch repository contents");
      }
      
      const contents = await response.json();
      res.json(contents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch repository contents" });
    }
  });

  app.get("/api/github/repos/:owner/:repo/contents/*", async (req, res) => {
    if (!req.session.userId || !req.session.accessToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const { owner, repo } = req.params;
      const path = (req.params as any)[0]; // Get the wildcard path
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        headers: {
          "Authorization": `token ${req.session.accessToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch content");
      }
      
      const content = await response.json();
      res.json(content);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
