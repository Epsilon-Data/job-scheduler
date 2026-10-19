import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import request from "supertest";
import type { Server } from "http";
import * as h from "./helpers";
import { isAiReviewUnavailable } from "@shared/aiReview";

const databaseUrl = inject("databaseUrl");

describe("AI review unavailable", () => {
  it("recognises the analyzer's error fallback and ai_error, not a real verdict", () => {
    expect(isAiReviewUnavailable("ai_rejected", "Analysis failed due to error: Connection error.")).toBe(true);
    expect(isAiReviewUnavailable("ai_error", "AI analysis error: boom")).toBe(true);
    expect(isAiReviewUnavailable(null, "AI analysis error: boom")).toBe(true);
    expect(isAiReviewUnavailable("ai_rejected", "Prints row-level identifiers")).toBe(false);
    expect(isAiReviewUnavailable("ai_approved", null)).toBe(false);
  });
});

describe.skipIf(!databaseUrl)("AI review unavailable in the review API (database tests, need TEST_DATABASE_URL)", () => {
  let server: Server;
  let reviewer: string;

  beforeAll(async () => {
    await h.assertThrowawayDatabase();
    server = await h.listen(await h.createTestApp());
    reviewer = await h.createUser("reviewer");
  });

  afterAll(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await h.closeDatabase();
  });

  it("an errored AI review has no confidence and is flagged unavailable", async () => {
    const userId = await h.createUser("user");
    const jobId = await h.createJob({ userId, workspaceId: await h.createWorkspace(userId), aiDecision: "ai_rejected" });
    await h.query(
      "UPDATE job_requests SET validation_status = '0.9', validation_decision = $2 WHERE job_id = $1",
      [jobId, "Analysis failed due to error: Connection error."],
    );
    await h.completeWithHeldOutput(jobId, { kind: "result", content: "x\n" });

    const detail = await request(server).get(`/api/review/jobs/${jobId}`).set(h.TEST_USER_HEADER, reviewer);
    expect(detail.body.ai).toMatchObject({ confidence: null, unavailable: true });

    const queue = await request(server).get("/api/review/jobs").set(h.TEST_USER_HEADER, reviewer);
    expect(queue.body.find((job: { job_id: string }) => job.job_id === jobId)).toMatchObject({ ai_review_unavailable: true });
  });
});
