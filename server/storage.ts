import {
  users,
  workspaces,
  jobRequests,
  jobLogs,
  type User,
  type InsertUser,
  type Workspace,
  type InsertWorkspace,
  type JobRequest,
  type InsertJobRequest,
  type PaginationParams,
  type PaginatedJobsResponse,
  type JobStats,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql, SQL } from "drizzle-orm";

// Extended workspace type with job statistics
export interface WorkspaceWithJobCounts extends Workspace {
  jobCounts: {
    total: number;
    completed: number;
    running: number;
    failed: number;
    pending: number;
  };
}

// Job request with workspace details
export interface JobRequestWithWorkspace extends JobRequest {
  workspace: {
    id: string;
    name: string;
    githubRepo: string;
    githubBranch: string;
  } | null;
}

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByExternalId(externalId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getPendingUsers(): Promise<User[]>;
  approveUser(userId: string, approverId: string): Promise<User>;
  rejectUser(userId: string): Promise<User>;

  // Workspace methods
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUserId(userId: string): Promise<Workspace[]>;
  getWorkspacesWithJobCountsByUserId(userId: string): Promise<WorkspaceWithJobCounts[]>;
  getAllWorkspaces(): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;

  // Job Request methods
  getJobRequestByJobId(jobId: string): Promise<JobRequest | undefined>;
  getJobRequestsByWorkspaceId(workspaceId: string): Promise<JobRequest[]>;
  getJobRequestsByUserId(userId: string): Promise<JobRequest[]>;
  getJobRequestsByUserIdPaginated(userId: string, params: PaginationParams): Promise<PaginatedJobsResponse<JobRequestWithWorkspace>>;
  getAllJobRequestsWithDetails(): Promise<any[]>;
  createJobRequest(jobRequest: InsertJobRequest): Promise<JobRequest>;
  updateJobRequest(id: string, updates: Partial<JobRequest>): Promise<JobRequest>;

  // Job logs methods
  getJobLogs(jobId: string): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByExternalId(externalId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.externalId, externalId));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getPendingUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.approvalStatus, "pending")).orderBy(desc(users.createdAt));
  }

  async approveUser(userId: string, approverId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: approverId,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async rejectUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        approvalStatus: "rejected",
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Workspace methods
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces).where(eq(workspaces.userId, userId)).orderBy(desc(workspaces.createdAt));
  }

  async getWorkspacesWithJobCountsByUserId(userId: string): Promise<WorkspaceWithJobCounts[]> {
    // Get all workspaces for user
    const userWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(desc(workspaces.createdAt));

    // Get job counts for each workspace in a single query
    const jobCountsResult = await db
      .select({
        workspaceId: jobRequests.workspaceId,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'success')`,
        running: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'running')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'failed')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} IN ('pending', 'queued'))`,
      })
      .from(jobRequests)
      .where(eq(jobRequests.userId, userId))
      .groupBy(jobRequests.workspaceId);

    // Create a map of workspace ID to job counts
    const jobCountsMap = new Map(
      jobCountsResult.map(row => [
        row.workspaceId,
        {
          total: Number(row.total),
          completed: Number(row.completed),
          running: Number(row.running),
          failed: Number(row.failed),
          pending: Number(row.pending),
        }
      ])
    );

    // Merge workspaces with their job counts
    return userWorkspaces.map(workspace => ({
      ...workspace,
      jobCounts: jobCountsMap.get(workspace.id) || {
        total: 0,
        completed: 0,
        running: 0,
        failed: 0,
        pending: 0,
      },
    }));
  }

  async getAllWorkspaces(): Promise<Workspace[]> {
    return await db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    const [workspace] = await db
      .insert(workspaces)
      .values(insertWorkspace)
      .returning();
    return workspace;
  }

  // Job Request methods
  async getJobRequestByJobId(jobId: string): Promise<JobRequest | undefined> {
    const [jobRequest] = await db.select().from(jobRequests).where(eq(jobRequests.jobId, jobId));
    return jobRequest;
  }

  async getJobRequestsByWorkspaceId(workspaceId: string): Promise<JobRequest[]> {
    return await db.select().from(jobRequests).where(eq(jobRequests.workspaceId, workspaceId)).orderBy(desc(jobRequests.createdAt));
  }

  async getJobRequestsByUserId(userId: string): Promise<JobRequest[]> {
    return await db.select().from(jobRequests).where(eq(jobRequests.userId, userId)).orderBy(desc(jobRequests.createdAt));
  }

  async getJobRequestsByUserIdPaginated(
    userId: string,
    params: PaginationParams
  ): Promise<PaginatedJobsResponse<JobRequestWithWorkspace>> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 10));
    const offset = (page - 1) * limit;

    // Build where conditions for filtered count (respects status filter)
    const conditions: SQL[] = [eq(jobRequests.userId, userId)];
    if (params.status) {
      conditions.push(eq(jobRequests.status, params.status));
    }

    // Get filtered count (for pagination)
    const [countResult] = await db
      .select({ count: count() })
      .from(jobRequests)
      .where(and(...conditions));
    const total = countResult?.count || 0;

    // Get overall stats for all user's jobs (ignores status filter)
    const [statsResult] = await db
      .select({
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'success')`,
        running: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'running')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'failed')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'pending')`,
        queued: sql<number>`COUNT(*) FILTER (WHERE ${jobRequests.status} = 'queued')`,
      })
      .from(jobRequests)
      .where(eq(jobRequests.userId, userId));

    const stats: JobStats = {
      total: Number(statsResult?.total || 0),
      completed: Number(statsResult?.completed || 0),
      running: Number(statsResult?.running || 0),
      failed: Number(statsResult?.failed || 0),
      pending: Number(statsResult?.pending || 0),
      queued: Number(statsResult?.queued || 0),
    };

    // Get paginated data with workspace details via left join
    const rows = await db
      .select({
        jobRequest: jobRequests,
        workspace: {
          id: workspaces.id,
          name: workspaces.name,
          githubRepo: workspaces.githubRepo,
          githubBranch: workspaces.githubBranch,
        },
      })
      .from(jobRequests)
      .leftJoin(workspaces, eq(jobRequests.workspaceId, workspaces.id))
      .where(and(...conditions))
      .orderBy(desc(jobRequests.createdAt))
      .limit(limit)
      .offset(offset);

    // Transform to JobRequestWithWorkspace format
    const data: JobRequestWithWorkspace[] = rows.map(row => ({
      ...row.jobRequest,
      workspace: row.workspace,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async getAllJobRequestsWithDetails(): Promise<any[]> {
    return await db
      .select({
        id: jobRequests.id,
        jobId: jobRequests.jobId,
        workspaceId: jobRequests.workspaceId,
        userId: jobRequests.userId,
        commitSha: jobRequests.commitSha,
        commitMessage: jobRequests.commitMessage,
        commitAuthor: jobRequests.commitAuthor,
        commitDate: jobRequests.commitDate,
        status: jobRequests.status,
        startedAt: jobRequests.startedAt,
        completedAt: jobRequests.completedAt,
        durationSeconds: jobRequests.durationSeconds,
        exitCode: jobRequests.exitCode,
        errorMessage: jobRequests.errorMessage,
        createdAt: jobRequests.createdAt,
        updatedAt: jobRequests.updatedAt,
        username: users.username,
        fullName: users.fullName,
        workspaceName: workspaces.name,
        githubRepo: workspaces.githubRepo,
        githubBranch: workspaces.githubBranch,
      })
      .from(jobRequests)
      .innerJoin(users, eq(jobRequests.userId, users.id))
      .innerJoin(workspaces, eq(jobRequests.workspaceId, workspaces.id))
      .orderBy(desc(jobRequests.createdAt));
  }

  async createJobRequest(insertJobRequest: InsertJobRequest): Promise<JobRequest> {
    const jobId = `JOB-${Date.now().toString(36).toUpperCase()}`;
    const [jobRequest] = await db
      .insert(jobRequests)
      .values({ ...insertJobRequest, jobId })
      .returning();
    return jobRequest;
  }

  async updateJobRequest(id: string, updates: Partial<JobRequest>): Promise<JobRequest> {
    const [jobRequest] = await db
      .update(jobRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobRequests.id, id))
      .returning();
    return jobRequest;
  }

  // Job logs methods
  async getJobLogs(jobId: string): Promise<any[]> {
    return db.select().from(jobLogs).where(eq(jobLogs.jobId, jobId)).orderBy(jobLogs.createdAt);
  }

}

export const storage = new DatabaseStorage();
