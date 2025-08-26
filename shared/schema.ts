import { pgTable, text, serial, timestamp, uuid, varchar, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Job status enum with AI agent workflow
export enum JobStatus {
  PENDING = "pending",
  AI_ANALYZING = "ai_analyzing",
  AI_APPROVED = "ai_approved", 
  AI_REJECTED = "ai_rejected",
  RUNNING = "running", 
  COMPLETED = "completed",
  FAILED = "failed",
  VALIDATING = "validating",
  VALIDATED = "validated",
  REJECTED = "rejected"
}

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: varchar("github_id", { length: 255 }).unique().notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }),
  avatarUrl: text("avatar_url"),
  role: varchar("role", { length: 50 }).notNull().default("user"),
  approvalStatus: varchar("approval_status", { length: 50 }).notNull().default("pending"),
  institution: varchar("institution", { length: 255 }),
  researchPurpose: text("research_purpose"),
  expectedDuration: varchar("expected_duration", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedBy: uuid("approved_by"),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  githubRepo: varchar("github_repo", { length: 255 }).notNull(),
  githubBranch: varchar("github_branch", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastCommitSha: varchar("last_commit_sha", { length: 255 }),
  lastCommitMessage: text("last_commit_message"),
  lastCommitAuthor: varchar("last_commit_author", { length: 255 }),
  lastCommitDate: timestamp("last_commit_date"),
});

export const jobRequests = pgTable("job_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id", { length: 255 }).unique().notNull(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  commitSha: varchar("commit_sha", { length: 255 }).notNull(),
  commitMessage: text("commit_message"),
  commitAuthor: varchar("commit_author", { length: 255 }),
  commitDate: timestamp("commit_date"),
  status: varchar("status", { length: 50 }).notNull().default("queued"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationSeconds: integer("duration_seconds"),
  exitCode: integer("exit_code"),
  errorMessage: text("error_message"),
  logs: text("logs"),
  outputFiles: jsonb("output_files"),
  // Additional fields from job-server
  resultMetadata: text("result_metadata"),
  executionOutput: text("execution_output"),
  executionError: text("execution_error"),  
  executionMethod: varchar("execution_method", { length: 100 }),
  validationStatus: varchar("validation_status", { length: 50 }),
  validationPolicy: text("validation_policy"),
  validationDecision: text("validation_decision"),
  aiLogs: text("ai_logs"), // Store AI analysis logs
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  workspaces: many(workspaces),
  jobRequests: many(jobRequests),
  approvedUsers: many(users, { relationName: "approved_by" }),
  approver: one(users, { 
    fields: [users.approvedBy], 
    references: [users.id], 
    relationName: "approved_by" 
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  user: one(users, { fields: [workspaces.userId], references: [users.id] }),
  jobRequests: many(jobRequests),
}));

export const jobRequestsRelations = relations(jobRequests, ({ one }) => ({
  workspace: one(workspaces, { fields: [jobRequests.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [jobRequests.userId], references: [users.id] }),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  approvedBy: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCommitSha: true,
  lastCommitMessage: true,
  lastCommitAuthor: true,
  lastCommitDate: true,
});

export const insertJobRequestSchema = createInsertSchema(jobRequests).omit({
  id: true,
  jobId: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  completedAt: true,
  durationSeconds: true,
  exitCode: true,
  errorMessage: true,
  logs: true,
  outputFiles: true,
  resultMetadata: true,
  executionOutput: true,
  executionError: true,
  executionMethod: true,
  validationStatus: true,
  validationPolicy: true,
  validationDecision: true,
});

export const jobUpdateSchema = z.object({
  status: z.nativeEnum(JobStatus),
  resultMetadata: z.string().optional(),
  errorMessage: z.string().optional(),
  executionOutput: z.string().optional(),
  executionError: z.string().optional(),
  executionMethod: z.string().optional(),
  exitCode: z.number().optional(),
  validationStatus: z.string().optional(),
  validationPolicy: z.string().optional(),
  validationDecision: z.string().optional(),
  aiLogs: z.string().optional(), // AI analysis logs
});

export const approvalRequestSchema = z.object({
  researchPurpose: z.string().min(10, "Research purpose must be at least 10 characters"),
  institution: z.string().min(1, "Institution is required"),
  expectedDuration: z.string().min(1, "Expected duration is required"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type JobRequest = typeof jobRequests.$inferSelect & {
  // Additional fields added by API responses
  detailed_logs?: Array<{
    id: string;
    job_id: string;
    worker_name: string;
    step_name: string;
    step_type: string;
    level: string;
    message: string;
    metadata?: any;
    progress?: number;
    duration_ms?: number;
    error_details?: any;
    parent_log_id?: string;
    created_at: string;
  }>;
  logs_summary?: Array<any>;
  latest_logs?: Array<any>;
  ai_logs?: string;
  code_violations?: Array<{
    file: string;
    line: number;
    field: string;
    code: string;
    type: string;
  }>;
  // Job-server compatible fields
  duration_seconds?: number;
  completed_at?: string;
  started_at?: string;
  github_repo?: string;
  branch_name?: string;
  commit_hash?: string;
  commit_time?: string;
  result_metadata?: any;
};
export type InsertJobRequest = z.infer<typeof insertJobRequestSchema>;
export type JobUpdate = z.infer<typeof jobUpdateSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
