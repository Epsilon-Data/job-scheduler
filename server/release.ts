import {
  HELD_ERROR_MESSAGE,
  type JobOutput,
  type JobRelease,
  type JobRequest,
  type ReleaseDecision,
} from "@shared/schema";
import { storage } from "./storage";

export type ResearcherJob<T extends JobRequest = JobRequest> = T & { release: JobRelease };

/**
 * Researcher-facing copy of a job row: output (and its hash), error text and output files
 * from a real-data run are only shown once a reviewer has released them. So are the attestation
 * and the verification receipt, which both carry the output hash.
 */
export function toResearcherJob<T extends JobRequest>(
  job: T,
  output?: JobOutput | null,
  decision?: ReleaseDecision | null,
): ResearcherJob<T> {
  const visible = job.releaseStatus === "released";

  let executionOutput: string | null = null;
  if (visible) {
    executionOutput = output ? (output.kind === "result" ? output.content : null) : job.executionOutput;
  }

  let errorMessage: string | null;
  if (visible) {
    errorMessage = output?.kind === "error" ? output.content : job.errorMessage;
    // Left over from an earlier failed run of a job whose result was then released
    if (output?.kind === "result" && errorMessage === HELD_ERROR_MESSAGE) errorMessage = null;
  } else if (job.releaseStatus === "not_required") {
    errorMessage = job.errorMessage;
  } else {
    errorMessage = job.errorMessage ? HELD_ERROR_MESSAGE : null;
  }

  return {
    ...job,
    executionOutput,
    executionError: visible ? job.executionError : null,
    outputFiles: visible ? job.outputFiles : null,
    errorMessage,
    outputSha256: visible ? job.outputSha256 : null,
    attestation: visible ? job.attestation : null,
    verificationReceipt: visible ? job.verificationReceipt : null,
    release: {
      status: job.releaseStatus,
      decision: decision
        ? {
            id: decision.id,
            decision: decision.decision,
            decided_at: decision.decidedAt.toISOString(),
            reason: decision.reason,
            // The hash of withheld output is not handed out either
            output_sha256: visible ? decision.outputSha256 : null,
          }
        : null,
    },
  };
}

export interface ReleaseRecords {
  outputs: Map<string, JobOutput>;
  decisions: Map<string, ReleaseDecision>;
}

/**
 * Batch loader: one query for held outputs and one for decisions.
 * Held content is only read for released jobs.
 */
export async function loadReleaseRecords(
  jobs: Pick<JobRequest, "jobId" | "releaseStatus">[],
): Promise<ReleaseRecords> {
  const releasedJobIds = jobs.filter((job) => job.releaseStatus === "released").map((job) => job.jobId);
  const [outputs, decisions] = await Promise.all([
    storage.getJobOutputs(releasedJobIds),
    storage.getReleaseDecisions(jobs.map((job) => job.jobId)),
  ]);
  return {
    outputs: new Map(outputs.map((output) => [output.jobId, output])),
    decisions: new Map(decisions.map((decision) => [decision.jobId, decision])),
  };
}

export async function toResearcherJobs<T extends JobRequest>(jobs: T[]): Promise<ResearcherJob<T>[]> {
  const { outputs, decisions } = await loadReleaseRecords(jobs);
  return jobs.map((job) => toResearcherJob(job, outputs.get(job.jobId), decisions.get(job.jobId)));
}

/**
 * Job log entries for researchers: error details can carry enclave-returned text.
 */
export function stripLogErrorDetails<T extends { errorDetails?: unknown; error_details?: unknown }>(
  logs: T[],
): Omit<T, "errorDetails" | "error_details">[] {
  return logs.map(({ errorDetails, error_details, ...entry }) => entry);
}
