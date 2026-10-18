import express, { type Express, type RequestHandler } from "express";
import session from "express-session";
import type { Server } from "http";
import type pg from "pg";
import { createHash, randomUUID } from "crypto";
import { vi } from "vitest";
import { HELD_ERROR_MESSAGE } from "@shared/schema";
import { pool } from "../db";
import { registerRoutes } from "../routes";
import { errorHandler } from "../middleware";
import { setRecheckRetryDelayMs } from "../roleSync";
import { manifestSha256, sha256Hex, type OutputFileStore } from "../outputFiles";

export const TEST_USER_HEADER = "x-test-user";

// Jobs and reviewers made by these helpers belong to this project unless a test says otherwise
export const TEST_PROJECT_ID = randomUUID();

export const REVIEWER_ROLE = "output-reviewer";
export const KEYCLOAK_CLIENT_ID = "jobscheduler-oauth";
const KEYCLOAK_CLIENT_SECRET = "test-client-secret";
// .invalid never resolves: nothing can reach a real Keycloak even if the mock is bypassed
const KEYCLOAK_TOKEN_URL = "http://keycloak.invalid/realms/epsilon/protocol/openid-connect/token";
const KEYCLOAK_AUTH_URL = "http://keycloak.invalid/realms/epsilon/protocol/openid-connect/auth";

export interface KeycloakAccount {
  sub: string;
  email: string;
  emailVerified: boolean;
  roles: string[];
  groups: string[];
  username?: string;
  name?: string;
  sid?: string;
  azp?: string;
}

// A canned token-endpoint reply, used before the normal behaviour
export type KeycloakReply =
  | { status: number; body?: unknown }
  | { network: true };

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

export const makeJwt = (claims: Record<string, unknown>) =>
  `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url(claims)}.not-checked`;

export function accessTokenClaims(account: KeycloakAccount): Record<string, unknown> {
  return {
    sub: account.sub,
    azp: account.azp ?? KEYCLOAK_CLIENT_ID,
    email: account.email,
    email_verified: account.emailVerified,
    preferred_username: account.username ?? account.email,
    name: account.name ?? "Test Person",
    sid: account.sid,
    realm_access: { roles: ["default-roles-epsilon", ...account.roles] },
    epsilon_groups: account.groups,
  };
}

/**
 * Stand-in for Keycloak's token endpoint, the only fetch the server may make in tests. An account is found by
 * its key: login codes are `code:<key>` and refresh tokens `rt:<key>`. The stub session's refresh token is
 * `rt:<user id>`, so createUser registers each user's account under its id.
 */
export const keycloak = {
  accounts: new Map<string, KeycloakAccount>(),
  requests: [] as Record<string, string>[],
  replies: [] as KeycloakReply[],
  // While set, the token endpoint answers only once this settles
  hold: null as Promise<unknown> | null,

  refreshCalls(key?: string): number {
    return this.requests.filter(
      (form) => form.grant_type === "refresh_token" && (key === undefined || form.refresh_token === `rt:${key}`),
    ).length;
  },

  reset() {
    this.requests.length = 0;
    this.replies.length = 0;
    this.hold = null;
  },
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function keycloakFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== KEYCLOAK_TOKEN_URL) {
    throw new Error(`Unexpected fetch in tests: ${url}`);
  }
  const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
  keycloak.requests.push(form);
  if (keycloak.hold) await keycloak.hold;

  const reply = keycloak.replies.shift();
  if (reply && "network" in reply) throw new TypeError("fetch failed");
  if (reply) return jsonResponse(reply.status, reply.body ?? {});

  const [prefix, key] =
    form.grant_type === "authorization_code" ? ["code:", form.code] : ["rt:", form.refresh_token];
  const account = key?.startsWith(prefix) ? keycloak.accounts.get(key.slice(prefix.length)) : undefined;
  if (form.client_id !== KEYCLOAK_CLIENT_ID || form.client_secret !== KEYCLOAK_CLIENT_SECRET) {
    return jsonResponse(401, { error: "unauthorized_client" });
  }
  if (!account) {
    return jsonResponse(400, { error: "invalid_grant", error_description: "Token is not active" });
  }
  return jsonResponse(200, {
    access_token: makeJwt(accessTokenClaims(account)),
    refresh_token: `rt:${key.slice(prefix.length)}`,
    id_token: makeJwt({ sub: account.sub }),
    token_type: "Bearer",
    expires_in: 300,
  });
}

export function installKeycloakMock() {
  Object.assign(process.env, {
    KEYCLOAK_TOKEN_URL,
    KEYCLOAK_AUTH_URL,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_REDIRECT_URI: "http://127.0.0.1/api/auth/callback",
  });
  delete process.env.KEYCLOAK_REVIEWER_ROLE;
  delete process.env.REVIEWER_ROLE_RECHECK_SECONDS;
  setRecheckRetryDelayMs(0);
  vi.stubGlobal("fetch", keycloakFetch);
}

async function buildApp(sessionMiddleware: RequestHandler): Promise<Express> {
  installKeycloakMock();
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware);
  await registerRoutes(app);
  app.use(errorHandler);
  return app;
}

/**
 * Builds the API the way server/index.ts does (no vite, no listening). Test-only stand-in for
 * express-session: the x-test-user header carries the logged-in user's id, and every request starts
 * with a role check that is due, so reviewers are re-checked with the Keycloak mock each time.
 */
export function createTestApp(): Promise<Express> {
  return buildApp((req, _res, next) => {
    const userId = req.header(TEST_USER_HEADER) || undefined;
    req.sessionID = `test-session-${userId ?? "anonymous"}`;
    req.session = {
      userId,
      refreshToken: userId ? `rt:${userId}` : undefined,
      destroy(callback) {
        callback(null);
      },
      save(callback) {
        callback(null);
      },
      regenerate(callback) {
        callback(null);
      },
    };
    next();
  });
}

// The real express-session (in-memory store), for login and re-check tests driven by a supertest agent
export function createSessionApp(): Promise<Express> {
  return buildApp(session({
    secret: "test-session-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true, sameSite: "lax" },
  }));
}

// supertest's own app.listen(0) binds every interface but then requests 127.0.0.1:<port>, which can reach
// another local process holding that port on 127.0.0.1; one loopback-bound server avoids that
export function listen(app: Express): Promise<Server> {
  return new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
}

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export const query = <R extends pg.QueryResultRow = any>(text: string, params?: unknown[]) =>
  pool.query<R>(text, params);

// A connection of its own, for a test that holds a transaction open while the server works
export const connectClient = () => pool.connect();

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

export interface UserOptions {
  projects?: string[]; // a reviewer's projects (default: TEST_PROJECT_ID)
  externalId?: string;
  email?: string;
}

/**
 * A user row plus its Keycloak account. A reviewer holds the role and the groups of its projects, and its
 * reviewer_projects mirror is as fresh as right after a login.
 */
export async function createUser(
  role: "user" | "reviewer" | "staff" = "user",
  approvalStatus: "approved" | "pending" | "rejected" = "approved",
  options: UserOptions = {},
): Promise<string> {
  const id = randomUUID();
  const externalId = options.externalId ?? `ext-${id}`;
  const email = options.email ?? `${id}@example.test`;
  await query(
    `INSERT INTO users (id, external_id, username, email, full_name, role, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, externalId, `${role}-${id.slice(0, 8)}`, email, `Test ${role}`, role, approvalStatus],
  );

  const projects = role === "reviewer" ? options.projects ?? [TEST_PROJECT_ID] : [];
  for (const projectId of projects) {
    await query("INSERT INTO reviewer_projects (user_id, project_id) VALUES ($1, $2)", [id, projectId]);
  }
  keycloak.accounts.set(id, {
    sub: externalId,
    email,
    emailVerified: true,
    roles: role === "reviewer" ? [REVIEWER_ROLE] : [],
    groups: projects.map((projectId) => `/Reviewers of ${projectId}`),
  });
  return id;
}

export async function reviewerProjectRows(userId: string): Promise<{ project_id: string; synced_at: Date }[]> {
  const { rows } = await query(
    "SELECT project_id, synced_at FROM reviewer_projects WHERE user_id = $1 ORDER BY project_id",
    [userId],
  );
  return rows;
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
  projectId?: string | null; // default: TEST_PROJECT_ID
  archetypeId?: string | null;
}

export async function createJob(seed: JobSeed): Promise<string> {
  const jobId = `JOB-TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
  const status = seed.status ?? "executing";
  await query(
    `INSERT INTO job_requests (job_id, workspace_id, user_id, commit_sha, status, completed_at, release_status,
                               error_message, execution_output, execution_error, output_files, ai_decision,
                               project_id, archetype_id)
     VALUES ($1, $2, $3, 'abc1234', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
      seed.projectId === undefined ? TEST_PROJECT_ID : seed.projectId,
      seed.archetypeId === undefined ? "archetype-test" : seed.archetypeId,
    ],
  );
  return jobId;
}

export interface HeldFile {
  name: string;
  bytes: Buffer;
  type: string;
}

export const fileManifestSha256 = (files: HeldFile[]) =>
  manifestSha256(files.map((file) => ({
    name: file.name,
    size: file.bytes.length,
    sha256: sha256Hex(file.bytes),
    type: file.type,
  })));

/**
 * Finishes a job the way the coordinator's complete_job_with_held_output does:
 * the real-data text is held in job_outputs and the job waits for a reviewer.
 * A result is attested with its own hash unless attestedOutputHash says otherwise; error text is not attested.
 * With files (written to the store first, like the coordinator), the file rows and manifest hash are held too.
 */
export async function completeWithHeldOutput(
  jobId: string,
  held: {
    kind: "result" | "error";
    content: string;
    attestedOutputHash?: string | null;
    files?: HeldFile[];
    store?: OutputFileStore;
  },
): Promise<string> {
  const contentSha256 = sha256(held.content);
  const attestedOutputHash =
    held.attestedOutputHash !== undefined ? held.attestedOutputHash : held.kind === "result" ? contentSha256 : null;
  const files = held.files?.map((file) => ({ ...file, sha256: sha256Hex(file.bytes) }));
  for (const file of files ?? []) {
    await held.store?.put(`jobs/${jobId}/${file.sha256}`, file.bytes, file.type);
  }
  await inTransaction(async (client) => {
    await client.query("SELECT 1 FROM job_requests WHERE job_id = $1 FOR UPDATE", [jobId]);
    await client.query(
      `INSERT INTO job_outputs (job_id, kind, content, content_sha256, attested_output_hash, files_manifest_sha256)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobId, held.kind, held.content, contentSha256, attestedOutputHash, held.files ? fileManifestSha256(held.files) : null],
    );
    for (const file of files ?? []) {
      await client.query(
        `INSERT INTO job_output_files (job_id, name, size, content_type, sha256, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, file.name, file.bytes.length, file.type, file.sha256, `jobs/${jobId}/${file.sha256}`],
      );
    }
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
