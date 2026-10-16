import express, { type Express } from "express";
import type pg from "pg";
import { createHash, randomUUID } from "crypto";
import { HELD_ERROR_MESSAGE } from "@shared/schema";
import { pool } from "../db";
import { registerRoutes } from "../routes";
import { errorHandler } from "../middleware";

export const TEST_USER_HEADER = "x-test-user";

/**
 * Builds the API the way server/index.ts does (no vite, no listening). Test-only stand-in for
 * express-session: the x-test-user header carries the logged-in user's id.
 */
export async function createTestApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.session = {
      userId: req.header(TEST_USER_HEADER) || undefined,
      destroy(callback) {
        callback(null);
      },
      save(callback) {
        callback(null);
      },
    };
    next();
  });
  await registerRoutes(app);
  app.use(errorHandler);
  return app;
}

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export const query = <R extends pg.QueryResultRow = any>(text: string, params?: unknown[]) =>
  pool.query<R>(text, params);

// Tests write straight to the database: refuse anything but a throwaway rg_rw_* database
export async function assertThrowawayDatabase() {
  const { rows } = await query<{ name: string }>("SELECT current_database() AS name");
  if (!rows[0].name.startsWith("rg_rw_")) {
    throw new Error(`Refusing to run tests against database "${rows[0].name}"`);
  }
}

export async function closeDatabase() {
  await pool.end();
}

async function inTransaction(work: (client: pg.PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await work(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createUser(
  role: "user" | "reviewer" | "staff" = "user",
  approvalStatus: "approved" | "pending" | "rejected" = "approved",
): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO users (id, external_id, username, email, full_name, role, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, `ext-${id}`, `${role}-${id.slice(0, 8)}`, `${id}@example.test`, `Test ${role}`, role, approvalStatus],
  );
  return id;
}

export async function createWorkspace(ownerId: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO workspaces (name, user_id, github_repo, github_branch)
     VALUES ($1, $2, $3, 'main') RETURNING id`,
    [`ws-${ownerId.slice(0, 8)}`, ownerId, `example/repo-${ownerId.slice(0, 8)}`],
  );
  return rows[0].id;
}

export interface JobSeed {
  userId: string;
  workspaceId: string;
  status?: string;
  releaseStatus?: "pending" | "not_required" | null;
  errorMessage?: string | null;
  executionOutput?: string | null;
  executionError?: string | null;
  outputFiles?: unknown;
  aiDecision?: string | null;
}

export async function createJob(seed: JobSeed): Promise<string> {
  const jobId = `JOB-TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
  const status = seed.status ?? "executing";
  await query(
    `INSERT INTO job_requests (job_id, workspace_id, user_id, commit_sha, status, completed_at, release_status,
                               error_message, execution_output, execution_error, output_files, ai_decision)
     VALUES ($1, $2, $3, 'abc1234', $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      jobId,
      seed.workspaceId,
      seed.userId,
      status,
      ["success", "failed", "rejected"].includes(status) ? new Date().toISOString() : null,
      seed.releaseStatus ?? null,
      seed.errorMessage ?? null,
      seed.executionOutput ?? null,
      seed.executionError ?? null,
      seed.outputFiles === undefined ? null : JSON.stringify(seed.outputFiles),
      seed.aiDecision ?? null,
    ],
  );
  return jobId;
}

/**
 * Finishes a job the way the coordinator's complete_job_with_held_output does:
 * the real-data text is held in job_outputs and the job waits for a reviewer.
 */
export async function completeWithHeldOutput(
  jobId: string,
  held: { kind: "result" | "error"; content: string; attestedOutputHash?: string },
): Promise<string> {
  const contentSha256 = sha256(held.content);
  await inTransaction(async (client) => {
    await client.query("SELECT 1 FROM job_requests WHERE job_id = $1 FOR UPDATE", [jobId]);
    await client.query(
      `INSERT INTO job_outputs (job_id, kind, content, content_sha256, attested_output_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobId, held.kind, held.content, contentSha256, held.attestedOutputHash ?? null],
    );
    await client.query(
      `UPDATE job_requests
          SET status = $2, release_status = 'pending',
              completed_at = timezone('utc', now()), updated_at = timezone('utc', now()),
              output_sha256 = COALESCE($3, output_sha256), error_message = COALESCE($4, error_message)
        WHERE job_id = $1`,
      [
        jobId,
        held.kind === "result" ? "success" : "failed",
        held.kind === "result" ? contentSha256 : null,
        held.kind === "error" ? HELD_ERROR_MESSAGE : null,
      ],
    );
  });
  return contentSha256;
}

/**
 * A job that finished before the gate existed. The migration backfilled these as released before it
 * created the guard triggers; replica mode skips the triggers the same way.
 */
export async function markLegacyReleased(jobId: string) {
  await inTransaction(async (client) => {
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query("UPDATE job_requests SET release_status = 'released' WHERE job_id = $1", [jobId]);
  });
}

export async function addJobLog(jobId: string, log: { message: string; errorDetails?: unknown }) {
  await query(
    `INSERT INTO job_logs (job_id, worker_name, step_name, step_type, level, message, error_details)
     VALUES ($1, 'ExecutorWorker', 'enclave', 'execution', $2, $3, $4)`,
    [
      jobId,
      log.errorDetails === undefined ? "info" : "error",
      log.message,
      log.errorDetails === undefined ? null : JSON.stringify(log.errorDetails),
    ],
  );
}
