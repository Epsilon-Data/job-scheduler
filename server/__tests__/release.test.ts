import { describe, expect, it, vi } from "vitest";
import { HELD_ERROR_MESSAGE, type JobOutput, type JobRequest, type ReleaseDecision } from "@shared/schema";
import { stripLogErrorDetails, toResearcherJob } from "../release";

// The view itself is pure; keep the database out of this unit test
vi.mock("../storage", () => ({ storage: {} }));

const RESULT = "count=7\nmean=54.2\n";
const REVIEWER_ID = "8f6c0a52-0000-4000-8000-0000000000e9";
const ENCLAVE_ERROR = "Traceback (most recent call last):\n  File \"main.py\", line 3\nValueError: patient 1234";

function job(overrides: Partial<JobRequest> = {}): JobRequest {
  return {
    id: "8f6c0a52-0000-4000-8000-000000000001",
    jobId: "JOB-UNIT",
    workspaceId: "8f6c0a52-0000-4000-8000-000000000002",
    userId: "8f6c0a52-0000-4000-8000-000000000003",
    commitSha: "abc1234",
    commitMessage: null,
    commitAuthor: null,
    commitDate: null,
    status: "success",
    startedAt: null,
    completedAt: null,
    durationSeconds: null,
    exitCode: null,
    errorMessage: null,
    logs: null,
    outputFiles: null,
    resultMetadata: null,
    executionOutput: null,
    executionError: null,
    executionMethod: null,
    validationStatus: null,
    validationPolicy: null,
    validationDecision: null,
    attestation: null,
    aiLogs: null,
    aiEnabled: true,
    zkpEnabled: true,
    executionMetrics: null,
    verificationReceipt: null,
    enclaveVersion: null,
    enclavePcr0: null,
    createdAt: null,
    updatedAt: null,
    releaseStatus: null,
    aiDecision: null,
    outputSha256: null,
    ...overrides,
  };
}

function output(kind: JobOutput["kind"], content: string): JobOutput {
  return {
    jobId: "JOB-UNIT",
    kind,
    content,
    contentSha256: "a".repeat(64),
    attestedOutputHash: null,
    createdAt: new Date("2026-10-01T10:00:00Z"),
  };
}

function decision(overrides: Partial<ReleaseDecision> = {}): ReleaseDecision {
  return {
    id: "8f6c0a52-0000-4000-8000-0000000000d1",
    jobId: "JOB-UNIT",
    decision: "approve",
    outputSha256: "a".repeat(64),
    reviewerId: REVIEWER_ID,
    reason: null,
    decidedAt: new Date("2026-10-02T09:30:00Z"),
    ...overrides,
  };
}

describe("toResearcherJob", () => {
  it("hides a pending job's held result and any legacy output columns", () => {
    const view = toResearcherJob(
      job({ releaseStatus: "pending", executionOutput: RESULT, executionError: "stderr", outputFiles: [{ name: "out.csv" }] }),
      output("result", RESULT),
    );

    expect(view).toMatchObject({ executionOutput: null, executionError: null, outputFiles: null, errorMessage: null });
    expect(view.release).toEqual({ status: "pending", decision: null });
    expect(JSON.stringify(view)).not.toContain("count=7");
  });

  it("replaces a held or unreleased error message with the held message", () => {
    expect(toResearcherJob(job({ status: "failed", releaseStatus: "pending", errorMessage: HELD_ERROR_MESSAGE }), output("error", ENCLAVE_ERROR)).errorMessage)
      .toBe(HELD_ERROR_MESSAGE);
    // In flight (or legacy in flight) with raw enclave text in error_message
    const inFlight = toResearcherJob(job({ status: "failed", releaseStatus: null, errorMessage: ENCLAVE_ERROR }));
    expect(inFlight.errorMessage).toBe(HELD_ERROR_MESSAGE);
    expect(JSON.stringify(inFlight)).not.toContain("patient 1234");
    expect(toResearcherJob(job({ status: "executing" })).errorMessage).toBeNull();
  });

  it("shows the held result once released, with the decision but no reviewer identity", () => {
    const view = toResearcherJob(
      job({ releaseStatus: "released", executionOutput: "stale column value" }),
      output("result", RESULT),
      decision({ reason: "aggregate only" }),
    );

    expect(view.executionOutput).toBe(RESULT);
    expect(view.release).toEqual({
      status: "released",
      decision: {
        id: "8f6c0a52-0000-4000-8000-0000000000d1",
        decision: "approve",
        decided_at: "2026-10-02T09:30:00.000Z",
        reason: "aggregate only",
        output_sha256: "a".repeat(64),
      },
    });
    expect(JSON.stringify(view)).not.toContain(REVIEWER_ID);
  });

  it("drops a held message left over from an earlier failed run once the result is released", () => {
    const view = toResearcherJob(
      job({ releaseStatus: "released", errorMessage: HELD_ERROR_MESSAGE }),
      output("result", RESULT),
      decision(),
    );

    expect(view.executionOutput).toBe(RESULT);
    expect(view.errorMessage).toBeNull();
  });

  it("hands out the output hash only once the output is released", () => {
    const sha = "b".repeat(64);
    for (const releaseStatus of [null, "pending", "withheld", "not_required"] as const) {
      const view = toResearcherJob(job({ releaseStatus, outputSha256: sha }), output("result", RESULT));
      expect(view.outputSha256).toBeNull();
      expect(JSON.stringify(view)).not.toContain(sha);
    }

    const released = toResearcherJob(job({ releaseStatus: "released", outputSha256: sha }), output("result", RESULT), decision());
    expect(released.outputSha256).toBe(sha);
  });

  it("shows a released held error as the error message, not as output", () => {
    const view = toResearcherJob(
      job({ status: "failed", releaseStatus: "released", errorMessage: HELD_ERROR_MESSAGE }),
      output("error", ENCLAVE_ERROR),
      decision(),
    );

    expect(view.errorMessage).toBe(ENCLAVE_ERROR);
    expect(view.executionOutput).toBeNull();
  });

  it("keeps a legacy released job (no held output) as it was", () => {
    const view = toResearcherJob(job({
      releaseStatus: "released",
      executionOutput: "42\n",
      executionError: "warning: x",
      outputFiles: [{ name: "out.csv" }],
      errorMessage: "Bundle execution failed:\nSTDOUT: 42",
    }));

    expect(view).toMatchObject({
      executionOutput: "42\n",
      executionError: "warning: x",
      outputFiles: [{ name: "out.csv" }],
      errorMessage: "Bundle execution failed:\nSTDOUT: 42",
      release: { status: "released", decision: null },
    });
  });

  it("keeps a withheld job hidden and shows the rejection reason", () => {
    const view = toResearcherJob(
      job({ status: "failed", releaseStatus: "withheld", errorMessage: HELD_ERROR_MESSAGE, executionError: ENCLAVE_ERROR }),
      output("error", ENCLAVE_ERROR),
      decision({ decision: "reject", reason: "Row-level data" }),
    );

    expect(view).toMatchObject({ executionOutput: null, executionError: null, errorMessage: HELD_ERROR_MESSAGE });
    expect(view.release).toMatchObject({
      status: "withheld",
      decision: { decision: "reject", reason: "Row-level data", output_sha256: null },
    });
    expect(JSON.stringify(view)).not.toContain("patient 1234");
  });

  it("shows the platform's own error for not_required jobs", () => {
    const view = toResearcherJob(job({
      status: "rejected",
      releaseStatus: "not_required",
      errorMessage: "Build validation failed: missing epsilon.yaml",
      executionOutput: "should not appear",
    }));

    expect(view.errorMessage).toBe("Build validation failed: missing epsilon.yaml");
    expect(view.executionOutput).toBeNull();
    expect(view.release).toEqual({ status: "not_required", decision: null });
  });

  it("returns a copy and leaves the row untouched", () => {
    const row = job({ releaseStatus: "pending", executionOutput: RESULT, errorMessage: ENCLAVE_ERROR });
    const before = structuredClone(row);
    const view = toResearcherJob(row, output("result", RESULT));

    expect(view).not.toBe(row);
    expect(row).toEqual(before);
    expect(view).toMatchObject({ jobId: "JOB-UNIT", commitSha: "abc1234", releaseStatus: "pending" });
  });
});

describe("stripLogErrorDetails", () => {
  it("drops error details in both spellings and keeps the rest of each entry", () => {
    const logs = [
      { id: "1", level: "error", message: "Enclave returned failure", errorDetails: { error: ENCLAVE_ERROR } },
      { id: "2", level: "error", message: "failed", error_details: { traceback: ENCLAVE_ERROR } },
      { id: "3", level: "info", message: "started" },
    ];

    expect(stripLogErrorDetails(logs)).toEqual([
      { id: "1", level: "error", message: "Enclave returned failure" },
      { id: "2", level: "error", message: "failed" },
      { id: "3", level: "info", message: "started" },
    ]);
  });
});
