/**
 * API utility functions for transforming responses
 */

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