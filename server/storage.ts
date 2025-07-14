import { users, workspaces, jobRequests, type User, type InsertUser, type Workspace, type InsertWorkspace, type JobRequest, type InsertJobRequest } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByGithubId(githubId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getPendingUsers(): Promise<User[]>;
  approveUser(userId: string, approverId: string): Promise<User>;
  rejectUser(userId: string): Promise<User>;

  // Workspace methods
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUserId(userId: string): Promise<Workspace[]>;
  getAllWorkspaces(): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;

  // Job Request methods
  getJobRequest(id: string): Promise<JobRequest | undefined>;
  getJobRequestsByWorkspaceId(workspaceId: string): Promise<JobRequest[]>;
  getJobRequestsByUserId(userId: string): Promise<JobRequest[]>;
  getAllJobRequests(): Promise<JobRequest[]>;
  getAllJobRequestsWithDetails(): Promise<any[]>;
  createJobRequest(jobRequest: InsertJobRequest): Promise<JobRequest>;
  updateJobRequest(id: string, updates: Partial<JobRequest>): Promise<JobRequest>;
  deleteJobRequest(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByGithubId(githubId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.githubId, githubId));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
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
    return workspace || undefined;
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces).where(eq(workspaces.userId, userId)).orderBy(desc(workspaces.createdAt));
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

  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  // Job Request methods
  async getJobRequest(id: string): Promise<JobRequest | undefined> {
    const [jobRequest] = await db.select().from(jobRequests).where(eq(jobRequests.id, id));
    return jobRequest || undefined;
  }

  async getJobRequestsByWorkspaceId(workspaceId: string): Promise<JobRequest[]> {
    return await db.select().from(jobRequests).where(eq(jobRequests.workspaceId, workspaceId)).orderBy(desc(jobRequests.createdAt));
  }

  async getJobRequestsByUserId(userId: string): Promise<JobRequest[]> {
    return await db.select().from(jobRequests).where(eq(jobRequests.userId, userId)).orderBy(desc(jobRequests.createdAt));
  }

  async getAllJobRequests(): Promise<JobRequest[]> {
    return await db.select().from(jobRequests).orderBy(desc(jobRequests.createdAt));
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

  async deleteJobRequest(id: string): Promise<void> {
    await db.delete(jobRequests).where(eq(jobRequests.id, id));
  }
}

export const storage = new DatabaseStorage();
