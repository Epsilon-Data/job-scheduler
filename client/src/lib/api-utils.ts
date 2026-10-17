/**
 * API utility functions for transforming responses
 */

import { OWN_JOB_REVIEW_MESSAGE } from "./constants";

/**
 * Normalize job request data to ensure consistent field names
 * Handles both snake_case (from API) and camelCase field names
 */
export function normalizeJobRequest<T extends Record<string, unknown>>(job: T): T {
  // Create a normalized object with both naming conventions for backwards compatibility
  const normalized = { ...job } as Record<string, unknown>;

  // Map common fields (API snake_case -> Frontend camelCase)
  const fieldMappings: [string, string][] = [
    ['id', 'jobId'],
    ['created_at', 'createdAt'],
    ['updated_at', 'updatedAt'],
    ['started_at', 'startedAt'],
    ['completed_at', 'completedAt'],
    ['duration_seconds', 'durationSeconds'],
    ['exit_code', 'exitCode'],
    ['result_metadata', 'resultMetadata'],
    ['error_message', 'errorMessage'],
    ['execution_output', 'executionOutput'],
    ['execution_error', 'executionError'],
    ['commit_hash', 'commitSha'],
    ['commit_message', 'commitMessage'],
    ['commit_time', 'commitDate'],
    ['execution_method', 'executionMethod'],
    ['validation_status', 'validationStatus'],
    ['validation_policy', 'validationPolicy'],
    ['validation_decision', 'validationDecision'],
    ['detailed_logs', 'detailedLogs'],
    ['ai_logs', 'aiLogs'],
    ['github_repo', 'githubRepo'],
    ['branch_name', 'branchName'],
    ['release_status', 'releaseStatus'],
    ['ai_decision', 'aiDecision'],
  ];

  for (const [snakeCase, camelCase] of fieldMappings) {
    // If snake_case exists but camelCase doesn't, copy it
    if (normalized[snakeCase] !== undefined && normalized[camelCase] === undefined) {
      normalized[camelCase] = normalized[snakeCase];
    }
    // If camelCase exists but snake_case doesn't, copy it
    if (normalized[camelCase] !== undefined && normalized[snakeCase] === undefined) {
      normalized[snakeCase] = normalized[camelCase];
    }
  }

  // Also normalize detailed_logs entries if present
  if (Array.isArray(normalized.detailed_logs) || Array.isArray(normalized.detailedLogs)) {
    const logs = (normalized.detailed_logs || normalized.detailedLogs) as Record<string, unknown>[];
    normalized.detailed_logs = logs.map(normalizeLogEntry);
    normalized.detailedLogs = normalized.detailed_logs;
  }

  return normalized as T;
}

/**
 * Normalize log entry fields
 */
function normalizeLogEntry(log: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...log };

  const logFieldMappings: [string, string][] = [
    ['job_id', 'jobId'],
    ['worker_name', 'workerName'],
    ['step_name', 'stepName'],
    ['step_type', 'stepType'],
    ['log_metadata', 'logMetadata'],
    ['duration_ms', 'durationMs'],
    ['error_details', 'errorDetails'],
    ['parent_log_id', 'parentLogId'],
    ['created_at', 'createdAt'],
  ];

  for (const [snakeCase, camelCase] of logFieldMappings) {
    if (normalized[snakeCase] !== undefined && normalized[camelCase] === undefined) {
      normalized[camelCase] = normalized[snakeCase];
    }
    if (normalized[camelCase] !== undefined && normalized[snakeCase] === undefined) {
      normalized[snakeCase] = normalized[camelCase];
    }
  }

  return normalized;
}

export interface ApiError {
  status: number | null;
  message: string;
  code?: string;
}

/**
 * Parse an error thrown by apiRequest or the default query function ("<status>: <body>")
 */
export function parseApiError(error: unknown): ApiError {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/^(\d{3}): ([\s\S]*)$/);
  if (!match) return { status: null, message: text };

  const status = Number(match[1]);
  try {
    const body = JSON.parse(match[2]);
    if (body && typeof body.message === "string") {
      return { status, message: body.message, code: typeof body.code === "string" ? body.code : undefined };
    }
  } catch {}
  return { status, message: match[2] };
}

const NOT_REVIEWER_MESSAGE = "Your account can no longer review jobs.";

// Review routes: plain wording per error code (others keep the server's message)
const REVIEW_ERROR_MESSAGES = new Map<string, string>([
  ["REAUTH_REQUIRED", "Your sign-in has expired. Sign in again."],
  ["KEYCLOAK_UNAVAILABLE", "Your reviewer access could not be confirmed. Try again shortly."],
  ["NOT_FOUND", "Job not found, or it is not in your projects."],
  ["OWN_JOB", OWN_JOB_REVIEW_MESSAGE],
  ["NOT_REVIEWER", NOT_REVIEWER_MESSAGE],
  ["NOT_PENDING", "This job is no longer awaiting a decision."],
  ["STALE_OUTPUT", "The held output has changed. Review it again."],
  ["NO_PROJECT", "This job has no project, so no reviewer can decide on it."],
  ["ASSIGNMENT_STALE", "Your project assignment could not be confirmed. Try again."],
  ["NOT_ATTESTED", "The result does not match the hash the enclave signed, so it cannot be approved."],
]);

export function reviewErrorMessage(error: ApiError): string {
  const message = error.code ? REVIEW_ERROR_MESSAGES.get(error.code) : undefined;
  if (message) return message;
  // requireReviewer answers 403 without a code once the account is no longer an approved reviewer
  if (error.status === 403) return NOT_REVIEWER_MESSAGE;
  return error.message;
}

/**
 * A review route answering 401 (the session has ended) or 403 for anything but the reviewer's own job
 * (no longer an approved reviewer) means the signed-in account has changed
 */
export function isReviewAccessLost(error: ApiError): boolean {
  return error.status === 401 || (error.status === 403 && error.code !== "OWN_JOB");
}