import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import type { Server } from "http";

type Helpers = typeof import("./helpers");
type Researcher = { userId: string; workspaceId: string };
type Listed = Record<string, any>;

const databaseUrl = inject("databaseUrl");

describe.skipIf(!databaseUrl)("project reviewers: routing and attestation (database tests, need TEST_DATABASE_URL)", () => {
  let h: Helpers;
  let server: Server;
  let reviewer: string;
  let staff: string;

  beforeAll(async () => {
    // Imported here so server/db.ts only ever sees the throwaway database set up by globalSetup
    h = await import("./helpers");
    await h.assertThrowawayDatabase();
    server = await h.listen(await h.createTestApp());
    reviewer = await h.createUser("reviewer");
    staff = await h.createUser("staff");
  });

  afterAll(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await h?.closeDatabase();
  });

  const marker = (label: string) => `MARKER-${label}-${randomUUID()}`;

  function get(path: string, userId?: string) {
    const req = request(server).get(path);
    return userId ? req.set(h.TEST_USER_HEADER, userId) : req;
  }

  function post(path: string, body: object, userId?: string) {
    const req = request(server).post(path).send(body);
    return userId ? req.set(h.TEST_USER_HEADER, userId) : req;
  }

  const decide = (jobId: string, body: object, userId: string) =>
    post(`/api/review/jobs/${jobId}/decision`, body, userId);

  async function newResearcher(): Promise<Researcher> {
    const userId = await h.createUser("user");
    return { userId, workspaceId: await h.createWorkspace(userId) };
  }

  async function heldJob(
    researcher: Researcher,
    held: { kind?: "result" | "error"; content?: string; attestedOutputHash?: string | null; projectId?: string | null } = {},
  ) {
    const jobId = await h.createJob({ ...researcher, projectId: held.projectId });
    const content = held.content ?? marker("held");
    const sha = await h.completeWithHeldOutput(jobId, {
      kind: held.kind ?? "result",
      content,
      attestedOutputHash: held.attestedOutputHash,
    });
    return { jobId, sha, content };
  }

  async function decisionRows(jobId: string) {
    const { rows } = await h.query(
      "SELECT decision, reviewer_id, project_id FROM release_decisions WHERE job_id = $1",
      [jobId],
    );
    return rows;
  }

  async function releaseStatusOf(jobId: string) {
    const { rows } = await h.query("SELECT release_status FROM job_requests WHERE job_id = $1", [jobId]);
    return rows[0].release_status;
  }

  const ids = (response: request.Response) => (response.body as Listed[]).map((item) => item.job_id);

  it("queue, detail and decision answer 404 for jobs outside the reviewer's projects, as for unknown jobs", async () => {
    const researcher = await newResearcher();
    const otherProject = randomUUID();
    const inside = await heldJob(researcher);
    const outside = await heldJob(researcher, { projectId: otherProject });
    const unrouted = await heldJob(researcher, { projectId: null });

    const unknown = await get("/api/review/jobs/JOB-DOES-NOT-EXIST", reviewer);
    expect(unknown.status).toBe(404);
    for (const job of [outside, unrouted]) {
      const detail = await get(`/api/review/jobs/${job.jobId}`, reviewer);
      expect(detail.status).toBe(404);
      expect(detail.body).toEqual(unknown.body);

      const approve = await decide(job.jobId, { decision: "approve", output_sha256: job.sha }, reviewer);
      expect(approve.status).toBe(404);
      expect(approve.body).toEqual(unknown.body);
      expect(await decisionRows(job.jobId)).toEqual([]);
      expect(await releaseStatusOf(job.jobId)).toBe("pending");
    }

    for (const status of ["pending", "all"]) {
      const queue = await get(`/api/review/jobs?status=${status}`, reviewer);
      expect(queue.status).toBe(200);
      expect(ids(queue)).toContain(inside.jobId);
      expect(ids(queue)).not.toContain(outside.jobId);
      expect(ids(queue)).not.toContain(unrouted.jobId);
      expect(JSON.stringify(queue.body)).not.toContain(outside.content);
    }

    // The other project's reviewer sees the other side
    const otherReviewer = await h.createUser("reviewer", "approved", { projects: [otherProject] });
    expect((await get(`/api/review/jobs/${outside.jobId}`, otherReviewer)).status).toBe(200);
    expect((await get(`/api/review/jobs/${inside.jobId}`, otherReviewer)).status).toBe(404);
    const otherQueue = await get("/api/review/jobs", otherReviewer);
    expect(ids(otherQueue)).toContain(outside.jobId);
    expect(ids(otherQueue)).not.toContain(inside.jobId);
    expect((await get(`/api/review/jobs/${unrouted.jobId}`, otherReviewer)).status).toBe(404);
  });

  it("queue and detail show the project, the archetype and the attestation status", async () => {
    const researcher = await newResearcher();
    const matching = await heldJob(researcher);
    const unattested = await heldJob(researcher, { attestedOutputHash: null });
    const mismatched = await heldJob(researcher, { attestedOutputHash: h.sha256("another output") });
    const error = await heldJob(researcher, { kind: "error" });

    const queue = await get("/api/review/jobs", reviewer);
    const listed = (jobId: string) => (queue.body as Listed[]).find((item) => item.job_id === jobId);
    expect(listed(matching.jobId)).toMatchObject({
      project_id: h.TEST_PROJECT_ID,
      archetype_id: "archetype-test",
      attestation_status: "matches",
    });
    expect(listed(unattested.jobId)?.attestation_status).toBe("not_attested");
    expect(listed(mismatched.jobId)?.attestation_status).toBe("mismatch");
    expect(listed(error.jobId)?.attestation_status).toBe("not_attested");

    const cases: [string, string, boolean][] = [
      [matching.jobId, "matches", false],
      [unattested.jobId, "not_attested", true],
      [mismatched.jobId, "mismatch", true],
      // Failed runs are not attested; their error text may still be released
      [error.jobId, "not_attested", false],
    ];
    for (const [jobId, attestationStatus, blocked] of cases) {
      const detail = await get(`/api/review/jobs/${jobId}`, reviewer);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        project_id: h.TEST_PROJECT_ID,
        archetype_id: "archetype-test",
        attestation_status: attestationStatus,
      });
      if (blocked) {
        expect(detail.body.approve_blocked_reason).toEqual(expect.any(String));
      } else {
        expect(detail.body.approve_blocked_reason).toBeNull();
      }
    }
  });

  it("a result is approved only when it matches its attested hash (RG009); error text and rejections are not blocked", async () => {
    const researcher = await newResearcher();
    const unattested = await heldJob(researcher, { attestedOutputHash: null });
    const mismatched = await heldJob(researcher, { attestedOutputHash: h.sha256("another output") });

    for (const job of [unattested, mismatched]) {
      const approve = await decide(job.jobId, { decision: "approve", output_sha256: job.sha }, reviewer);
      expect(approve.status).toBe(409);
      expect(approve.body.code).toBe("NOT_ATTESTED");
      expect(await decisionRows(job.jobId)).toEqual([]);
      expect(await releaseStatusOf(job.jobId)).toBe("pending");
    }

    const reject = await decide(unattested.jobId, { decision: "reject", reason: "Not attested", output_sha256: unattested.sha }, reviewer);
    expect(reject.status).toBe(201);

    const error = await heldJob(researcher, { kind: "error" });
    expect((await decide(error.jobId, { decision: "approve", output_sha256: error.sha }, reviewer)).status).toBe(201);

    const matching = await heldJob(researcher);
    expect((await decide(matching.jobId, { decision: "approve", output_sha256: matching.sha }, reviewer)).status).toBe(201);
    const decided = await get(`/api/review/jobs/${matching.jobId}`, reviewer);
    expect(decided.body.approve_blocked_reason).toBe("This job is not awaiting a release decision");

    // Each decision records the project it was made for
    for (const jobId of [unattested.jobId, error.jobId, matching.jobId]) {
      expect(await decisionRows(jobId)).toEqual([
        expect.objectContaining({ reviewer_id: reviewer, project_id: h.TEST_PROJECT_ID }),
      ]);
    }
  });

  it("the database refuses what the app would not do: no project (RG006), another project (RG007), a stale mirror (RG008)", async () => {
    const { storage } = await import("../storage");
    const researcher = await newResearcher();
    const insertDecision = (jobId: string, sha: string, reviewerId: string) =>
      h.query(
        "INSERT INTO release_decisions (job_id, decision, output_sha256, reviewer_id) VALUES ($1, 'approve', $2, $3)",
        [jobId, sha, reviewerId],
      );

    const unrouted = await heldJob(researcher, { projectId: null });
    await expect(insertDecision(unrouted.jobId, unrouted.sha, reviewer)).rejects.toMatchObject({ code: "RG006" });
    const elsewhere = await heldJob(researcher, { projectId: randomUUID() });
    await expect(insertDecision(elsewhere.jobId, elsewhere.sha, reviewer)).rejects.toMatchObject({ code: "RG007" });

    // A mirror row last confirmed 6 minutes ago: called directly, the trigger refuses the decision
    const project = randomUUID();
    const staleReviewer = await h.createUser("reviewer", "approved", { projects: [project] });
    await h.query("UPDATE reviewer_projects SET synced_at = now() - interval '6 minutes' WHERE user_id = $1", [staleReviewer]);
    const job = await heldJob(researcher, { projectId: project });
    const attempt = storage.recordReleaseDecision({
      jobId: job.jobId, reviewerId: staleReviewer, decision: "approve", reason: null, outputSha256: job.sha,
    });
    await expect(attempt).rejects.toMatchObject({ reason: "assignment_stale" });
    expect(await decisionRows(job.jobId)).toEqual([]);

    // Through the API the forced re-check confirms the assignment with Keycloak first
    const approve = await decide(job.jobId, { decision: "approve", output_sha256: job.sha }, staleReviewer);
    expect(approve.status).toBe(201);
    expect(await decisionRows(job.jobId)).toEqual([
      { decision: "approve", reviewer_id: staleReviewer, project_id: project },
    ]);
  });

  it("decision trigger SQLSTATEs map to the API's refusals", async () => {
    const { db } = await import("../db");
    const researcher = await newResearcher();
    const cases: [string, number, string][] = [
      ["RG006", 409, "NO_PROJECT"],
      ["RG007", 404, "NOT_FOUND"],
      ["RG008", 409, "ASSIGNMENT_STALE"],
      ["RG009", 409, "NOT_ATTESTED"],
    ];
    for (const [sqlstate, status, code] of cases) {
      const job = await heldJob(researcher);
      const transaction = db.transaction.bind(db);
      // The first transaction is the forced re-check's mirror sync, the second the decision itself
      const spy = vi
        .spyOn(db, "transaction")
        .mockImplementationOnce(transaction)
        .mockRejectedValueOnce(Object.assign(new Error(`trigger raised ${sqlstate}`), { code: sqlstate }));
      try {
        const response = await decide(job.jobId, { decision: "approve", output_sha256: job.sha }, reviewer);
        expect(response.status).toBe(status);
        expect(response.body.code).toBe(code);
      } finally {
        spy.mockRestore();
      }
      expect(await releaseStatusOf(job.jobId)).toBe("pending");
    }
  });

  it("staff see pending reviews per project, reviewer counts and unrouted held jobs, without content", async () => {
    const routing = () => get("/api/staff/review-routing", staff);
    const before = await routing();
    expect(before.status).toBe(200);

    const covered = randomUUID();
    const quiet = randomUUID();
    const uncovered = randomUUID();
    await h.createUser("reviewer", "approved", { projects: [covered] });
    await h.createUser("reviewer", "approved", { projects: [covered, quiet] });
    // Not counted: an unapproved reviewer
    await h.createUser("reviewer", "pending", { projects: [covered] });

    const researcher = await newResearcher();
    const content = marker("routing");
    const older = await heldJob(researcher, { projectId: covered, content });
    await h.query("UPDATE job_requests SET completed_at = '2026-01-02 03:04:05.678' WHERE job_id = $1", [older.jobId]);
    await heldJob(researcher, { projectId: covered, content });
    const decided = await heldJob(researcher, { projectId: covered, kind: "error", content });
    const coveredReviewer = await h.createUser("reviewer", "approved", { projects: [covered] });
    expect((await decide(decided.jobId, { decision: "reject", reason: "no", output_sha256: decided.sha }, coveredReviewer)).status).toBe(201);
    await heldJob(researcher, { projectId: uncovered, content });
    await heldJob(researcher, { projectId: null, content });

    const after = await routing();
    expect(after.status).toBe(200);
    expect(JSON.stringify(after.body)).not.toContain(content);
    const project = (projectId: string) =>
      (after.body.projects as Listed[]).find((entry) => entry.project_id === projectId);
    expect(project(covered)).toEqual({
      project_id: covered,
      pending_count: 2,
      oldest_pending_completed_at: "2026-01-02T03:04:05.678Z",
      reviewer_count: 3,
    });
    expect(project(quiet)).toEqual({ project_id: quiet, pending_count: 0, oldest_pending_completed_at: null, reviewer_count: 1 });
    expect(project(uncovered)).toMatchObject({ pending_count: 1, reviewer_count: 0 });
    expect(after.body.pending_without_project).toBe(before.body.pending_without_project + 1);
    // Longest-waiting first
    const order = (after.body.projects as Listed[]).map((entry) => entry.project_id);
    expect(order.indexOf(covered)).toBeLessThan(order.indexOf(uncovered));
    expect(order.indexOf(uncovered)).toBeLessThan(order.indexOf(quiet));

    for (const userId of [reviewer, researcher.userId]) {
      expect((await get("/api/staff/review-routing", userId)).status).toBe(403);
    }
  });
});
