import {
  HELD_ERROR_MESSAGE,
  type JobOutput,
  type JobRelease,
  type JobRequest,
  type ReleaseDecision,
} from "@shared/schema";
import { storage } from "./storage";
import { toFileSummary } from "./outputFiles";

export type ResearcherJob<T extends JobRequest = JobRequest> = T & { release: JobRelease };

// Coordinator worker that writes the AI pre-execution review's job log entries
const AI_AGENT_WORKER = "AIAgentWorker";
// Coordinator worker that runs the job against real data and writes its log entries
const EXECUTOR_WORKER = "ExecutorWorker";

/**
 * Whether what a run left behind besides its output (log entries, metrics, metadata, exit code)
 * may be shown to the researcher: once a reviewer released the output, or when nothing was held
 * because the job ended before real data was requested. Not while the job is in flight, pending
 * or withheld: a script controls how long it runs and how it ends.
 */
export function runDetailsVisible(releaseStatus: string | null | undefined): boolean {
  return releaseStatus === "released" || releaseStatus === "not_required";
}

/**
 * Researcher-facing copy of a job row: output (and its hash), error text and output files
 * from a real-data run are only shown once a reviewer has released them. So are the attestation
 * and the verification receipt, which both carry the output hash. The run's metrics, result
 * metadata and exit code follow runDetailsVisible.
 * The AI pre-execution review is for reviewers only: its verdict, confidence, reasoning and
 * policy never reach the researcher.
 */
export function toResearcherJob<T extends JobRequest>(
  job: T,
  output?: JobOutput | null,
  decision?: ReleaseDecision | null,
): ResearcherJob<T> {
  const visible = job.releaseStatus === "released";
  const runDetails = runDetailsVisible(job.releaseStatus);

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
    validationStatus: null,
    validationPolicy: null,
    validationDecision: null,
    aiDecision: null,
    aiLogs: null,
    aiEnabled: false,
    executionMetrics: runDetails ? withoutAiDecision(job.executionMetrics) : null,
    resultMetadata: runDetails ? job.resultMetadata : null,
    exitCode: runDetails ? job.exitCode : null,
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

/**
 * execution_metrics JSON without its ai_decision copy; text that is not a JSON object is dropped.
 */
function withoutAiDecision(executionMetrics: string | null): string | null {
  if (!executionMetrics) return executionMetrics;
  try {
    const metrics = JSON.parse(executionMetrics);
    if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return null;
    const { ai_decision, ...rest } = metrics;
    return JSON.stringify(rest);
  } catch {
    return null;
  }
}

export interface ReleasedFiles {
  files: ReturnType<typeof toFileSummary>[];
  filesManifestSha256: string | null;
}

/**
 * The output files of a released job, for its researcher; null for any job not released.
 */
export async function loadReleasedFiles(job: Pick<JobRequest, "jobId" | "releaseStatus">): Promise<ReleasedFiles | null> {
  if (job.releaseStatus !== "released") return null;
  const [[output], files] = await Promise.all([
    storage.getJobOutputs([job.jobId]),
    storage.getJobOutputFiles(job.jobId),
  ]);
  return { files: files.map(toFileSummary), filesManifestSha256: output?.filesManifestSha256 ?? null };
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

/**
 * Job log entries for researchers, without the AI pre-execution review's entries
 * (they carry its reasoning, risks and confidence). The entries of the worker that runs the
 * job against real data are left out until runDetailsVisible: they say how the run went and
 * how long it took.
 */
export function toResearcherLogs<
  T extends { errorDetails?: unknown; error_details?: unknown; workerName?: string | null; worker_name?: string | null },
>(logs: T[], releaseStatus: string | null | undefined): Omit<T, "errorDetails" | "error_details">[] {
  const hidden = new Set(runDetailsVisible(releaseStatus) ? [AI_AGENT_WORKER] : [AI_AGENT_WORKER, EXECUTOR_WORKER]);
  return stripLogErrorDetails(
    logs.filter((log) => !hidden.has((log.workerName ?? log.worker_name) ?? "")),
  );
}
