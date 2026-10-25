import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import type { Server } from "http";
import { HELD_ERROR_MESSAGE } from "@shared/schema";
import * as h from "./helpers";
import { githubApi } from "../github";
import { storage, ReleaseDecisionError } from "../storage";

type Researcher = { userId: string; workspaceId: string };
type Listed = Record<string, any>;

const databaseUrl = inject("databaseUrl");

describe.skipIf(!databaseUrl)("output-release gate API (database tests, need TEST_DATABASE_URL)", () => {
  let server: Server;
  let reviewer: string;
  let otherReviewer: string;
  let staff: string;

  beforeAll(async () => {
    await h.assertThrowawayDatabase();
    const app = await h.createTestApp();
    // supertest's own app.listen(0) binds every interface but then requests 127.0.0.1:<port>, which can reach
    // another local process holding that port on 127.0.0.1; one loopback-bound server avoids that
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    reviewer = await h.createUser("reviewer");
    otherReviewer = await h.createUser("reviewer");
    staff = await h.createUser("staff");
  });

  afterAll(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await h.closeDatabase();
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

  // The four researcher-facing job endpoints, as the job's owner
  async function researcherViews({ userId, workspaceId }: Researcher, jobId: string) {
    const responses = await Promise.all([
      get(`/api/jobs/${jobId}`, userId),
      get("/api/jobs", userId),
      get("/api/user/jobs?limit=100", userId),
      get(`/api/workspaces/${workspaceId}/jobs`, userId),
    ]);
    for (const response of responses) expect(response.status).toBe(200);
    const [detail, list, paged, inWorkspace] = responses.map((response) => response.body);

    const views = {
      detail: detail as Listed,
      listed: (list as Listed[]).find((job) => job.id === jobId),
      paged: (paged.data as Listed[]).find((job) => job.jobId === jobId),
      inWorkspace: (inWorkspace as Listed[]).find((job) => job.jobId === jobId),
      bodies: [detail, list, paged, inWorkspace],
    };
    expect(views.listed).toBeDefined();
    expect(views.paged).toBeDefined();
    expect(views.inWorkspace).toBeDefined();
    return views as typeof views & { listed: Listed; paged: Listed; inWorkspace: Listed };
  }

  function expectAbsent(bodies: unknown[], ...markers: string[]) {
    for (const body of bodies) {
      const text = JSON.stringify(body);
      for (const m of markers) expect(text).not.toContain(m);
    }
  }

  async function decisionRows(jobId: string) {
    const { rows } = await h.query(
      `SELECT d.decision, d.reviewer_id, d.output_sha256, d.reason, j.release_status
         FROM release_decisions d JOIN job_requests j USING (job_id)
        WHERE d.job_id = $1`,
      [jobId],
    );
    return rows;
  }

  async function releaseStatusOf(jobId: string) {
    const { rows } = await h.query("SELECT release_status FROM job_requests WHERE job_id = $1", [jobId]);
    return rows[0].release_status;
  }

  it("O1a: a pending successful job's output is absent from all researcher job endpoints", async () => {
    const researcher = await newResearcher();
    const held = marker("O1a-held");
    // Even if an old writer had filled the legacy output columns, they stay hidden
    const legacyColumns = marker("O1a-columns");
    const jobId = await h.createJob({
      ...researcher,
      executionOutput: legacyColumns,
      executionError: legacyColumns,
      outputFiles: [{ name: legacyColumns }],
    });
    await h.completeWithHeldOutput(jobId, { kind: "result", content: `count=7\n${held}\n` });

    const views = await researcherViews(researcher, jobId);
    expectAbsent(views.bodies, held, legacyColumns);
    expect(views.detail).toMatchObject({
      status: "success",
      release_status: "pending",
      release: { status: "pending", decision: null },
      execution_output: null,
      execution_error: null,
      error_message: null,
    });
    expect(views.listed).toMatchObject({ release_status: "pending", execution_output: null, execution_error: null });
    expect(views.paged).toMatchObject({ releaseStatus: "pending", executionOutput: null, outputFiles: null });
    expect(views.inWorkspace).toMatchObject({ release: { status: "pending", decision: null }, executionOutput: null });
  });

  it("O1b: a pending failed job shows only the held error message", async () => {
    const researcher = await newResearcher();
    const held = marker("O1b-held");
    const legacyError = marker("O1b-legacy-error");
    const failed = await h.createJob(researcher);
    await h.completeWithHeldOutput(failed, { kind: "error", content: `Traceback (most recent call last):\n  ${held}\n` });
    // Pre-gate code wrote raw enclave errors into error_message; a job left like that is held too
    const legacy = await h.createJob({
      ...researcher,
      status: "failed",
      errorMessage: `Bundle execution failed:\nSTDOUT: ${legacyError}\nSTDERR: x`,
    });

    for (const jobId of [failed, legacy]) {
      const views = await researcherViews(researcher, jobId);
      expectAbsent(views.bodies, held, legacyError);
      expect(views.detail.error_message).toBe(HELD_ERROR_MESSAGE);
      expect(views.detail.execution_output).toBeNull();
      expect(views.listed.error_message).toBe(HELD_ERROR_MESSAGE);
      expect(views.paged.errorMessage).toBe(HELD_ERROR_MESSAGE);
      expect(views.inWorkspace.errorMessage).toBe(HELD_ERROR_MESSAGE);
    }
  });

  it("O1c: job log error details never reach researchers", async () => {
    const researcher = await newResearcher();
    const pendingMarker = marker("O1c-pending");
    const pending = await h.createJob(researcher);
    await h.addJobLog(pending, {
      message: "Enclave returned failure",
      errorDetails: { error: pendingMarker, traceback: `File "main.py", line 3\n${pendingMarker}` },
    });
    await h.completeWithHeldOutput(pending, { kind: "error", content: "boom" });

    // Stripped for released jobs as well
    const releasedMarker = marker("O1c-released");
    const released = await h.createJob({ ...researcher, status: "failed", errorMessage: "Bundle execution failed" });
    await h.markLegacyReleased(released);
    await h.addJobLog(released, { message: "Enclave returned failure", errorDetails: { error: releasedMarker } });

    for (const [jobId, logMarker] of [[pending, pendingMarker], [released, releasedMarker]]) {
      const views = await researcherViews(researcher, jobId);
      expectAbsent(views.bodies, logMarker);
      expect(views.detail.detailed_logs).toHaveLength(1);
      expect(views.detail.detailed_logs[0].message).toBe("Enclave returned failure");
      expect(views.detail.detailed_logs[0]).not.toHaveProperty("errorDetails");
      expect(views.detail.detailed_logs[0]).not.toHaveProperty("error_details");
    }
  });

  it("O1d: the AI pre-execution review never reaches researchers, released or not", async () => {
    const researcher = await newResearcher();
    const reasoning = marker("O1d-reasoning");
    const policy = marker("O1d-policy");
    for (const released of [false, true]) {
      const jobId = await h.createJob({ ...researcher, aiDecision: "ai_rejected" });
      await h.query(
        `UPDATE job_requests
            SET validation_status = '0.987654321', validation_policy = $2, validation_decision = $3, ai_logs = $3,
                execution_metrics = $4
          WHERE job_id = $1`,
        [jobId, policy, reasoning, JSON.stringify({ total_ms: 1234, ai_decision: "ai_rejected" })],
      );
      await h.addJobLog(jobId, {
        workerName: "AIAgentWorker",
        message: `Repository rejected (confidence: 0.987654321) ${reasoning}`,
        metadata: { confidence_score: 0.987654321, reasoning, risks_identified: ["Prints row-level identifiers"] },
      });
      await h.addJobLog(jobId, { message: "Enclave execution complete" });
      await h.completeWithHeldOutput(jobId, { kind: "result", content: "42\n" });
      // The reviewer still sees the AI verdict
      const review = await get(`/api/review/jobs/${jobId}`, reviewer);
      expect(JSON.stringify(review.body)).toContain("ai_rejected");
      if (released) {
        expect((await decide(jobId, { decision: "approve", output_sha256: h.sha256("42\n") }, reviewer)).status).toBe(201);
      }

      const views = await researcherViews(researcher, jobId);
      expectAbsent(views.bodies, reasoning, policy, "ai_rejected", "AIAgentWorker", "Prints row-level identifiers", "0.987654321");
      // detail and /api/jobs use snake_case keys; /api/user/jobs and workspace jobs pass the camelCase row
      for (const view of [views.detail, views.listed, views.paged, views.inWorkspace]) {
        for (const field of [
          "validation_status", "validation_policy", "validation_decision", "ai_decision", "ai_logs",
          "validationStatus", "validationPolicy", "validationDecision", "aiDecision", "aiLogs",
        ]) {
          expect(view[field] ?? null).toBeNull();
        }
        expect(view.ai_enabled ?? view.aiEnabled ?? false).toBe(false);
      }
      expect(views.detail.detailed_logs.map((log: { message: string }) => log.message)).toEqual(["Enclave execution complete"]);
      expect(JSON.parse(views.detail.execution_metrics)).toEqual({ total_ms: 1234 });
    }
  });

  it("O2: after approval the researcher gets the exact held output and the decision record", async () => {
    const researcher = await newResearcher();
    const content = `mean_age=54.2\nn=1204\nnon-ASCII: café ✓ ${marker("O2")}\n`;
    const jobId = await h.createJob(researcher);
    const sha = h.sha256(content);
    await h.completeWithHeldOutput(jobId, { kind: "result", content, attestedOutputHash: sha });

    const review = await get(`/api/review/jobs/${jobId}`, reviewer);
    expect(review.status).toBe(200);
    expect(review.body.output).toEqual({
      kind: "result",
      content,
      content_sha256: sha,
      attested_output_hash: sha,
      hash_matches_attestation: true,
      size_bytes: Buffer.byteLength(content, "utf8"),
    });

    const decided = await decide(jobId, { decision: "approve", output_sha256: review.body.output.content_sha256 }, reviewer);
    expect(decided.status).toBe(201);
    expect(decided.body).toMatchObject({
      release_status: "released",
      decision: { decision: "approve", output_sha256: sha, reason: null, reviewer: { id: reviewer } },
    });

    const views = await researcherViews(researcher, jobId);
    expect(h.sha256(views.detail.execution_output)).toBe(sha);
    expect(views.detail.execution_output).toBe(content);
    expect(views.detail.release_status).toBe("released");
    expect(views.detail.release).toEqual({
      status: "released",
      decision: {
        id: decided.body.decision.id,
        decision: "approve",
        decided_at: expect.any(String),
        reason: null,
        output_sha256: sha,
      },
    });
    expect(JSON.stringify(views.bodies)).not.toContain(reviewer);
    expect(views.listed.execution_output).toBe(content);
    expect(views.paged.executionOutput).toBe(content);
    expect(views.inWorkspace.executionOutput).toBe(content);

    expect(await decisionRows(jobId)).toEqual([
      { decision: "approve", reviewer_id: reviewer, output_sha256: sha, reason: null, release_status: "released" },
    ]);
  });

  it("O3: after rejection everything stays withheld, the decision is recorded and the researcher sees the reason", async () => {
    const researcher = await newResearcher();
    const held = marker("O3");
    const jobId = await h.createJob(researcher);
    const sha = await h.completeWithHeldOutput(jobId, { kind: "error", content: `ValueError: row ${held}` });
    const reason = "The error message quotes row-level data";

    const decided = await decide(jobId, { decision: "reject", reason: `  ${reason}  `, output_sha256: sha }, reviewer);
    expect(decided.status).toBe(201);
    expect(decided.body).toMatchObject({ release_status: "withheld", decision: { decision: "reject", reason } });

    const views = await researcherViews(researcher, jobId);
    expectAbsent(views.bodies, held);
    expect(views.detail).toMatchObject({
      release_status: "withheld",
      error_message: HELD_ERROR_MESSAGE,
      execution_output: null,
      release: {
        status: "withheld",
        decision: { id: decided.body.decision.id, decision: "reject", reason, output_sha256: null },
      },
    });
    expect(views.paged.release.decision.reason).toBe(reason);
    expect(views.inWorkspace.release.decision.reason).toBe(reason);
    expectAbsent(views.bodies, sha);

    expect(await decisionRows(jobId)).toEqual([
      { decision: "reject", reviewer_id: reviewer, output_sha256: sha, reason, release_status: "withheld" },
    ]);
  });

  it("researchers get the output hash only once the output is released", async () => {
    const researcher = await newResearcher();
    const holdResult = async (label: string) => {
      const jobId = await h.createJob(researcher);
      return { jobId, sha: await h.completeWithHeldOutput(jobId, { kind: "result", content: marker(label) }) };
    };
    const pending = await holdResult("hash-pending");
    const withheld = await holdResult("hash-withheld");
    const released = await holdResult("hash-released");
    const reject = { decision: "reject", reason: "Small cell counts", output_sha256: withheld.sha };
    expect((await decide(withheld.jobId, reject, reviewer)).status).toBe(201);
    expect((await decide(released.jobId, { decision: "approve", output_sha256: released.sha }, reviewer)).status).toBe(201);

    expectAbsent((await researcherViews(researcher, pending.jobId)).bodies, pending.sha);

    const cases: [string, string | null][] = [[pending.jobId, null], [withheld.jobId, null], [released.jobId, released.sha]];
    for (const [jobId, expected] of cases) {
      const views = await researcherViews(researcher, jobId);
      expect(views.paged.outputSha256).toBe(expected);
      expect(views.inWorkspace.outputSha256).toBe(expected);
    }
  });

  it("researchers get the attestation and verification receipt only once the output is released", async () => {
    const researcher = await newResearcher();
    const holdAttested = async (label: string) => {
      const jobId = await h.createJob(researcher);
      const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: marker(label) });
      const material = {
        attestation: JSON.stringify({ attestation: { attestation_document: marker(`${label}-doc`) }, proof: { output_hash: sha } }),
        receipt: JSON.stringify({ output_hash: sha, note: marker(`${label}-receipt`) }),
        haReceipt: JSON.stringify({ receipt: marker(`${label}-ha`) }),
      };
      await h.query(
        "UPDATE job_requests SET attestation = $2, verification_receipt = $3, ha_receipt = $4 WHERE job_id = $1",
        [jobId, material.attestation, material.receipt, material.haReceipt],
      );
      return { jobId, sha, ...material };
    };
    const pending = await holdAttested("att-pending");
    const withheld = await holdAttested("att-withheld");
    const released = await holdAttested("att-released");
    const reject = { decision: "reject", reason: "Small cell counts", output_sha256: withheld.sha };
    expect((await decide(withheld.jobId, reject, reviewer)).status).toBe(201);
    expect((await decide(released.jobId, { decision: "approve", output_sha256: released.sha }, reviewer)).status).toBe(201);

    for (const job of [pending, withheld]) {
      const views = await researcherViews(researcher, job.jobId);
      expectAbsent(views.bodies, job.sha, job.attestation, job.receipt, job.haReceipt);
      expect(views.detail).toMatchObject({ attestation: null, verification_receipt: null });
      expect(views.paged).toMatchObject({ attestation: null, verificationReceipt: null });
      expect(views.inWorkspace).toMatchObject({ attestation: null, verificationReceipt: null });
    }

    const views = await researcherViews(researcher, released.jobId);
    expect(views.detail).toMatchObject({ attestation: released.attestation, verification_receipt: released.receipt });
    expect(views.paged).toMatchObject({ attestation: released.attestation, verificationReceipt: released.receipt });
    expect(views.inWorkspace.verificationReceipt).toBe(released.receipt);
    // The ATL receipt is not part of the researcher API at all
    expectAbsent(views.bodies, released.haReceipt);

    // Jobs from before the gate (backfilled as released) are unchanged
    const legacy = await h.createJob({ ...researcher, status: "success", executionOutput: "42\n" });
    await h.query("UPDATE job_requests SET attestation = $2, verification_receipt = $3 WHERE job_id = $1", [legacy, "{\"legacy\":1}", "{\"ok\":true}"]);
    await h.markLegacyReleased(legacy);
    expect((await researcherViews(researcher, legacy)).detail).toMatchObject({
      attestation: "{\"legacy\":1}",
      verification_receipt: "{\"ok\":true}",
    });
  });

  it("researcher routes refuse reviewer accounts (REVIEWER_ACCOUNT) and unapproved accounts (NOT_APPROVED)", async () => {
    const researcher = await newResearcher();
    const jobId = await h.createJob(researcher);
    // A reviewer may still own a workspace from before the account became a reviewer
    const reviewerWorkspace = await h.createWorkspace(reviewer);
    const createdBy = async (userIds: string[]) => {
      const { rows } = await h.query(
        `SELECT (SELECT count(*) FROM workspaces WHERE user_id = ANY($1::uuid[]) AND github_repo = 'example/x')::int AS workspaces,
                (SELECT count(*) FROM job_requests WHERE user_id = ANY($1::uuid[]))::int AS jobs`,
        [userIds],
      );
      return rows[0];
    };

    const researcherCalls = (userId: string | undefined, workspaceId: string) => [
      get("/api/workspaces", userId),
      get(`/api/workspaces/${workspaceId}`, userId),
      post("/api/workspaces", { name: "x", githubRepo: "example/x", githubBranch: "main" }, userId),
      get(`/api/workspaces/${workspaceId}/jobs`, userId),
      post(`/api/workspaces/${workspaceId}/jobs`, {}, userId),
      get("/api/user/jobs", userId),
      get("/api/jobs", userId),
      get(`/api/jobs/${jobId}`, userId),
      post("/api/jobs", { github_repo: "example/x", branch_name: "main" }, userId),
      get("/api/github/status", userId),
      get("/api/github/connect", userId),
      get("/api/github/repos", userId),
      post("/api/github/disconnect", {}, userId),
    ];

    const pendingUser = await h.createUser("user", "pending");
    const rejectedUser = await h.createUser("user", "rejected");
    const cases: [string | undefined, string, number, string | undefined][] = [
      [reviewer, reviewerWorkspace, 403, "REVIEWER_ACCOUNT"],
      [pendingUser, await h.createWorkspace(pendingUser), 403, "NOT_APPROVED"],
      [rejectedUser, await h.createWorkspace(rejectedUser), 403, "NOT_APPROVED"],
      [undefined, researcher.workspaceId, 401, undefined],
    ];
    for (const [userId, workspaceId, status, code] of cases) {
      for (const response of await Promise.all(researcherCalls(userId, workspaceId))) {
        expect(response.status).toBe(status);
        expect(response.body.code).toBe(code);
      }
    }
    expect(await createdBy([reviewer, pendingUser, rejectedUser])).toEqual({ workspaces: 0, jobs: 0 });

    // Approved users and staff keep their researcher routes, reviewers keep theirs
    for (const userId of [researcher.userId, staff]) {
      expect((await get("/api/workspaces", userId)).status).toBe(200);
      expect((await get("/api/user/jobs", userId)).status).toBe(200);
    }
    expect((await get("/api/review/jobs", reviewer)).status).toBe(200);
    expect((await get("/api/auth/me", reviewer)).status).toBe(200);
  });

  it("self-review: a reviewer cannot read or decide their own job, or a job in their workspace", async () => {
    const selfReviewer = await h.createUser("reviewer");
    const ownWorkspace = await h.createWorkspace(selfReviewer);
    const researcher = await h.createUser("user");
    const held = marker("self");

    const ownJob = await h.createJob({ userId: selfReviewer, workspaceId: ownWorkspace });
    const ownSha = await h.completeWithHeldOutput(ownJob, { kind: "result", content: `own ${held}` });
    const workspaceJob = await h.createJob({ userId: researcher, workspaceId: ownWorkspace });
    const workspaceSha = await h.completeWithHeldOutput(workspaceJob, { kind: "result", content: `ws ${held}` });

    for (const [jobId, sha] of [[ownJob, ownSha], [workspaceJob, workspaceSha]]) {
      const read = await get(`/api/review/jobs/${jobId}`, selfReviewer);
      expect(read.status).toBe(403);
      expect(read.body.code).toBe("OWN_JOB");
      expectAbsent([read.body], held);

      const approve = await decide(jobId, { decision: "approve", output_sha256: sha }, selfReviewer);
      expect(approve.status).toBe(403);
      expect(approve.body.code).toBe("OWN_JOB");
      expect(await releaseStatusOf(jobId)).toBe("pending");
      expect(await decisionRows(jobId)).toEqual([]);

      // Any other reviewer can review it
      expect((await get(`/api/review/jobs/${jobId}`, otherReviewer)).status).toBe(200);
    }

    const queue = await get("/api/review/jobs", selfReviewer);
    expect(queue.status).toBe(200);
    expectAbsent([queue.body], held);
    const own = (queue.body as Listed[]).filter((item) => [ownJob, workspaceJob].includes(item.job_id));
    expect(own.map((item) => item.own_job)).toEqual([true, true]);
    expect(own.map((item) => item.output_size)).toEqual([null, null]);
    expectAbsent(own, ownSha, workspaceSha);
  });

  it("self-review: the review queue does not tell a reviewer who decided on their own job", async () => {
    const selfReviewer = await h.createUser("reviewer");
    const ownJob = await h.createJob({ userId: selfReviewer, workspaceId: await h.createWorkspace(selfReviewer) });
    const ownSha = await h.completeWithHeldOutput(ownJob, { kind: "error", content: marker("own-decided") });
    const otherJob = await h.createJob(await newResearcher());
    const otherSha = await h.completeWithHeldOutput(otherJob, { kind: "result", content: marker("other-decided") });
    const reason = "The error message quotes row-level data";
    expect((await decide(ownJob, { decision: "reject", reason, output_sha256: ownSha }, reviewer)).status).toBe(201);
    expect((await decide(otherJob, { decision: "approve", output_sha256: otherSha }, reviewer)).status).toBe(201);

    for (const status of ["decided", "all"]) {
      const queue = await get(`/api/review/jobs?status=${status}`, selfReviewer);
      expect(queue.status).toBe(200);
      const own = (queue.body as Listed[]).find((item) => item.job_id === ownJob);
      expect(own).toMatchObject({
        own_job: true,
        output_size: null,
        decision: { decision: "reject", reason, reviewer: null, output_sha256: null },
      });
      expect(JSON.stringify(own)).not.toContain(reviewer);
      expect(JSON.stringify(own)).not.toContain(ownSha);
      expect((queue.body as Listed[]).find((item) => item.job_id === otherJob)).toMatchObject({
        own_job: false,
        decision: { decision: "approve", reviewer: { id: reviewer }, output_sha256: otherSha },
      });
    }
  });

  it("database guards back up the app checks (a decision by a non-reviewer maps to not_reviewer)", async () => {
    const researcher = await newResearcher();
    const jobId = await h.createJob(researcher);
    const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: marker("backstop") });
    // A staff account with a (bogus) mirror row passes the app's project scope
    const staffWithProject = await h.createUser("staff");
    await h.query("INSERT INTO reviewer_projects (user_id, project_id) VALUES ($1, $2)", [staffWithProject, h.TEST_PROJECT_ID]);

    // The role is normally checked by requireReviewer; called directly, the RG002 trigger refuses it
    const attempt = storage.recordReleaseDecision({
      jobId, reviewerId: staffWithProject, decision: "approve", reason: null, outputSha256: sha,
    });
    await expect(attempt).rejects.toBeInstanceOf(ReleaseDecisionError);
    await expect(attempt).rejects.toMatchObject({ reason: "not_reviewer" });
    expect(await releaseStatusOf(jobId)).toBe("pending");
  });

  it("authorisation: users and staff get 403 on every review endpoint, anonymous requests get 401", async () => {
    const researcher = await newResearcher();
    const held = marker("authz");
    const jobId = await h.createJob(researcher);
    const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: held });

    const reviewCalls = (userId?: string) => [
      get("/api/review/jobs", userId),
      get("/api/review/jobs?status=all", userId),
      get(`/api/review/jobs/${jobId}`, userId),
      post(`/api/review/jobs/${jobId}/decision`, { decision: "approve", output_sha256: sha }, userId),
    ];
    const cases: [string | undefined, number][] = [[researcher.userId, 403], [staff, 403], [undefined, 401]];
    for (const [userId, status] of cases) {
      for (const response of await Promise.all(reviewCalls(userId))) {
        expect(response.status).toBe(status);
        expectAbsent([response.body], held);
      }
    }
    expect(await releaseStatusOf(jobId)).toBe("pending");
  });

  it("authorisation: reviewers whose account is pending or rejected get 403 on every review endpoint", async () => {
    const researcher = await newResearcher();
    const held = marker("unapproved");
    const jobId = await h.createJob(researcher);
    const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: held });

    const reviewCalls = (userId: string) => [
      get("/api/review/jobs", userId),
      get(`/api/review/jobs/${jobId}`, userId),
      post(`/api/review/jobs/${jobId}/decision`, { decision: "approve", output_sha256: sha }, userId),
    ];

    const notYetApproved = await h.createUser("reviewer", "pending");
    // Revoked with the staff dashboard's Reject button after having reviewed
    const revoked = await h.createUser("reviewer");
    expect((await get(`/api/review/jobs/${jobId}`, revoked)).status).toBe(200);
    expect((await post(`/api/staff/users/${revoked}/reject`, {}, staff)).status).toBe(200);
    const { rows } = await h.query("SELECT approval_status FROM users WHERE id = $1", [revoked]);
    expect(rows[0].approval_status).toBe("rejected");

    for (const userId of [notYetApproved, revoked]) {
      for (const response of await Promise.all(reviewCalls(userId))) {
        expect(response.status).toBe(403);
        expectAbsent([response.body], held);
      }
    }
    expect(await releaseStatusOf(jobId)).toBe("pending");
    expect(await decisionRows(jobId)).toEqual([]);
  });

  it("authorisation: a failed user lookup in requireReviewer is a 500 and the server keeps serving", async () => {
    const lookup = vi.spyOn(storage, "getUser").mockRejectedValueOnce(new Error("connection terminated unexpectedly"));
    try {
      expect((await get("/api/review/jobs", reviewer)).status).toBe(500);
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      lookup.mockRestore();
    }
    expect((await get("/api/review/jobs", reviewer)).status).toBe(200);
  });

  it("conflicts: a second decision or a stale hash gets 409, a reject without a reason gets 400", async () => {
    const researcher = await newResearcher();
    const jobId = await h.createJob(researcher);
    const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: marker("conflict") });

    expect((await decide(jobId, { decision: "reject", output_sha256: sha }, reviewer)).status).toBe(400);
    expect((await decide(jobId, { decision: "reject", reason: "   ", output_sha256: sha }, reviewer)).status).toBe(400);
    expect((await decide(jobId, { decision: "approve" }, reviewer)).status).toBe(400);
    expect((await decide(jobId, { decision: "maybe", output_sha256: sha }, reviewer)).status).toBe(400);

    const stale = await decide(jobId, { decision: "approve", output_sha256: h.sha256("an older output") }, reviewer);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_OUTPUT");
    expect(await decisionRows(jobId)).toEqual([]);

    expect((await decide(jobId, { decision: "approve", output_sha256: sha }, reviewer)).status).toBe(201);
    const again = await decide(jobId, { decision: "approve", output_sha256: sha }, reviewer);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("NOT_PENDING");
    expect((await decide(jobId, { decision: "reject", reason: "too late", output_sha256: sha }, otherReviewer)).status).toBe(409);
    expect(await decisionRows(jobId)).toHaveLength(1);
  });

  it("conflicts: two reviewers deciding at once, exactly one decision is recorded", async () => {
    const researcher = await newResearcher();
    const jobId = await h.createJob(researcher);
    const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: marker("race") });

    const responses = await Promise.all([
      decide(jobId, { decision: "approve", output_sha256: sha }, reviewer),
      decide(jobId, { decision: "reject", reason: "small cell counts", output_sha256: sha }, otherReviewer),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses.find((response) => response.status === 201)!;
    expect(await decisionRows(jobId)).toEqual([
      expect.objectContaining({ decision: winner.body.decision.decision, release_status: winner.body.release_status }),
    ]);
  });

  it("returns 404 for unknown jobs and for jobs without held output", async () => {
    const researcher = await newResearcher();
    const legacy = await h.createJob({ ...researcher, status: "success", executionOutput: "42\n" });
    await h.markLegacyReleased(legacy);
    const body = { decision: "approve", output_sha256: h.sha256("42\n") };

    for (const jobId of ["JOB-DOES-NOT-EXIST", legacy]) {
      expect((await get(`/api/review/jobs/${jobId}`, reviewer)).status).toBe(404);
      expect((await decide(jobId, body, reviewer)).status).toBe(404);
    }
  });

  it("legacy released jobs keep their output and errors; not_required jobs show the platform error", async () => {
    const researcher = await newResearcher();
    const success = await h.createJob({
      ...researcher,
      status: "success",
      executionOutput: "legacy result 42\n",
      outputFiles: [{ name: "out.csv" }],
    });
    await h.markLegacyReleased(success);
    const failedError = "Bundle execution failed:\nSTDOUT: legacy\nSTDERR: x";
    const failed = await h.createJob({ ...researcher, status: "failed", errorMessage: failedError, executionError: "legacy stderr" });
    await h.markLegacyReleased(failed);
    const platformError = "Build validation failed: missing epsilon.yaml";
    const rejected = await h.createJob({ ...researcher, status: "rejected", releaseStatus: "not_required", errorMessage: platformError });

    let views = await researcherViews(researcher, success);
    expect(views.detail).toMatchObject({
      execution_output: "legacy result 42\n",
      release_status: "released",
      release: { status: "released", decision: null },
    });
    expect(views.listed.execution_output).toBe("legacy result 42\n");
    expect(views.paged).toMatchObject({ executionOutput: "legacy result 42\n", outputFiles: [{ name: "out.csv" }] });
    expect(views.inWorkspace.executionOutput).toBe("legacy result 42\n");

    views = await researcherViews(researcher, failed);
    expect(views.detail).toMatchObject({ error_message: failedError, execution_error: "legacy stderr" });
    expect(views.paged.errorMessage).toBe(failedError);

    views = await researcherViews(researcher, rejected);
    expect(views.detail).toMatchObject({
      error_message: platformError,
      release_status: "not_required",
      release: { status: "not_required", decision: null },
    });
    expect(views.listed.error_message).toBe(platformError);
    expect(views.inWorkspace.errorMessage).toBe(platformError);
  });

  it("review queue lists held jobs by status without their content", async () => {
    const researcher = await newResearcher();
    const held = marker("queue");
    const content = `rows=3 ${held}`;
    const pendingJob = await h.createJob({ ...researcher, aiDecision: "ai_approved" });
    await h.completeWithHeldOutput(pendingJob, { kind: "result", content });
    const decidedJob = await h.createJob(researcher);
    const decidedSha = await h.completeWithHeldOutput(decidedJob, { kind: "error", content: `err ${held}` });
    const reason = "Contains row-level data";
    expect((await decide(decidedJob, { decision: "reject", reason, output_sha256: decidedSha }, reviewer)).status).toBe(201);

    const [pending, decided, all] = await Promise.all([
      get("/api/review/jobs", reviewer),
      get("/api/review/jobs?status=decided", reviewer),
      get("/api/review/jobs?status=all", reviewer),
    ]);
    for (const response of [pending, decided, all]) {
      expect(response.status).toBe(200);
      expectAbsent([response.body], held);
    }

    const ids = (response: request.Response) => (response.body as Listed[]).map((item) => item.job_id);
    expect(ids(pending)).toContain(pendingJob);
    expect(ids(pending)).not.toContain(decidedJob);
    expect(ids(decided)).toContain(decidedJob);
    expect(ids(decided)).not.toContain(pendingJob);
    expect(ids(all)).toEqual(expect.arrayContaining([pendingJob, decidedJob]));

    expect((pending.body as Listed[]).find((item) => item.job_id === pendingJob)).toEqual({
      job_id: pendingJob,
      status: "success",
      release_status: "pending",
      completed_at: expect.any(String),
      project_id: h.TEST_PROJECT_ID,
      archetype_id: "archetype-test",
      submitted_by: { id: researcher.userId, username: expect.any(String), full_name: expect.any(String) },
      workspace: { id: researcher.workspaceId, name: expect.any(String), github_repo: expect.any(String) },
      output_kind: "result",
      output_size: Buffer.byteLength(content, "utf8"),
      attestation_status: "matches",
      own_job: false,
      ai_decision: "ai_approved",
      ai_review_unavailable: false,
      decision: null,
    });
    expect((decided.body as Listed[]).find((item) => item.job_id === decidedJob)).toMatchObject({
      release_status: "withheld",
      output_kind: "error",
      decision: { decision: "reject", reason, output_sha256: decidedSha, reviewer: { id: reviewer } },
    });

    expect((await get("/api/review/jobs?status=everything", reviewer)).status).toBe(400);
  });

  it("staff job list never contains held content", async () => {
    const researcher = await newResearcher();
    const held = marker("staff");
    const failed = await h.createJob(researcher);
    await h.completeWithHeldOutput(failed, { kind: "error", content: `error ${held}` });
    const succeeded = await h.createJob(researcher);
    await h.completeWithHeldOutput(succeeded, { kind: "result", content: `result ${held}` });

    const response = await get("/api/staff/jobs", staff);
    expect(response.status).toBe(200);
    expectAbsent([response.body], held);
    expect((response.body as Listed[]).find((job) => job.jobId === failed)?.errorMessage).toBe(HELD_ERROR_MESSAGE);
  });

  it("job creation responses go through the researcher view", async () => {
    const commit = vi.spyOn(githubApi, "getLatestCommit").mockResolvedValue({
      sha: "f00dcafe",
      message: "test commit",
      author: "tester",
      date: new Date(),
    });
    try {
      const researcher = await newResearcher();
      const viaWorkspace = await post(`/api/workspaces/${researcher.workspaceId}/jobs`, {}, researcher.userId);
      expect(viaWorkspace.status).toBe(200);
      expect(viaWorkspace.body).toMatchObject({
        commitSha: "f00dcafe",
        executionOutput: null,
        errorMessage: null,
        release: { status: null, decision: null },
      });

      const viaJobs = await post("/api/jobs", { github_repo: "example/new-repo", branch_name: "main" }, researcher.userId);
      expect(viaJobs.status).toBe(200);
      expect(viaJobs.body).toMatchObject({ github_repo: "example/new-repo", release_status: null });
    } finally {
      commit.mockRestore();
    }
  });
});
