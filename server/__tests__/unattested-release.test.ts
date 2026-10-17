import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import type { Server } from "http";
import * as h from "./helpers";


const databaseUrl = inject("databaseUrl");

describe.skipIf(!databaseUrl)("a dev database that allows unattested release (database tests, need TEST_DATABASE_URL)", () => {
  let server: Server;
  let reviewer: string;

  beforeAll(async () => {
    // Only this file's connections carry the setting (a startup option, read by pg when it opens a connection),
    // as ALTER DATABASE ... SET would in dev; the other test files share the database and must keep RG009
    vi.stubEnv("PGOPTIONS", "-c epsilon.allow_unattested_release=on");
    await h.assertThrowawayDatabase();
    server = await h.listen(await h.createTestApp());
    reviewer = await h.createUser("reviewer");
  });

  afterAll(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await h.closeDatabase();
    vi.unstubAllEnvs();
  });

  it("does not block Approve on a missing or different attested hash, and the trigger agrees", async () => {
    const { rows } = await h.query("SELECT current_setting('epsilon.allow_unattested_release', true) AS value");
    expect(rows[0].value).toBe("on");

    const userId = await h.createUser("user");
    const workspaceId = await h.createWorkspace(userId);
    for (const attestedOutputHash of [null, h.sha256("another output")]) {
      const jobId = await h.createJob({ userId, workspaceId });
      const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: `dev ${randomUUID()}`, attestedOutputHash });

      const detail = await request(server).get(`/api/review/jobs/${jobId}`).set(h.TEST_USER_HEADER, reviewer);
      expect(detail.status).toBe(200);
      expect(detail.body.attestation_status).toBe(attestedOutputHash ? "mismatch" : "not_attested");
      expect(detail.body.approve_blocked_reason).toBeNull();

      const approve = await request(server)
        .post(`/api/review/jobs/${jobId}/decision`)
        .set(h.TEST_USER_HEADER, reviewer)
        .send({ decision: "approve", output_sha256: sha });
      expect(approve.status).toBe(201);
      expect(approve.body.release_status).toBe("released");
    }
  });
});
