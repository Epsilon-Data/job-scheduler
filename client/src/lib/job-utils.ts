// Utility functions for job detail page

/**
 * Get color class for log level
 */
export function getLogLevelColor(level: string): string {
  switch (level?.toUpperCase()) {
    case 'SUCCESS': return 'text-green-400';
    case 'ERROR': return 'text-red-400';
    case 'WARNING': return 'text-orange-400';
    case 'DEBUG': return 'text-gray-500';
    case 'INFO': return 'text-blue-400';
    default: return 'text-gray-300';
  }
}

/**
 * Get color class for step type in timeline
 */
export function getStepTypeColor(stepType: string, level: string): string {
  if (level === 'ERROR') return 'text-red-400';
  if (level === 'SUCCESS') return 'text-green-400';
  if (level === 'WARNING') return 'text-orange-400';

  switch (stepType) {
    case 'QUEUED':
    case 'PENDING': return 'text-blue-400';
    case 'CLONING': return 'text-purple-400';
    case 'AI_ANALYZING': return 'text-cyan-400';
    case 'AI_APPROVED': return 'text-green-400';
    case 'AI_REJECTED': return 'text-red-400';
    case 'EXECUTING': return 'text-yellow-400';
    case 'COMPLETED': return 'text-green-400';
    case 'FAILED': return 'text-red-400';
    default: return 'text-gray-300';
  }
}

/**
 * Get emoji for worker name
 */
export function getWorkerEmoji(workerName: string): string {
  switch (workerName) {
    case 'CloneWorker': return '🔄';
    case 'AIAgentWorker': return '🤖';
    case 'ExecuteWorker': return '⚡';
    default: return '📝';
  }
}

/**
 * Format log timestamp for display
 */
export function formatLogTimestamp(timestamp: string | undefined): string {
  if (!timestamp) {
    return new Date().toISOString().replace('T', ' ').slice(0, -5);
  }
  const date = new Date(timestamp);
  return isNaN(date.getTime())
    ? new Date().toISOString().replace('T', ' ').slice(0, -5)
    : date.toISOString().replace('T', ' ').slice(0, -5);
}

/**
 * Clean file path by removing local development paths
 */
export function cleanFilePath(path: string | undefined): string {
  if (!path) return '';
  return path
    .replace(/\/Users\/[^/]+\/Developments\/[^/]+\/[^/]+\/[^/]+\/shared_storage\//, '')
    .replace('/shared/epsilon/', '');
}

/**
 * Extract repository path from file path
 */
export function extractRepoPath(filePath: string | undefined): string {
  if (!filePath) return 'Unknown file';
  return filePath.replace(/.*\/(repositories\/[^/]+\/)/, '');
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T>(json: string | undefined | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Format metadata value for display
 */
export function formatMetadataValue(key: string, value: unknown): string {
  switch (key) {
    case 'repo_url':
      return `Repository: ${String(value).replace('https://github.com/', '')}`;
    case 'commit_sha':
      return `Commit: ${String(value)?.substring(0, 7)}`;
    case 'repo_path':
      return `Local Path: ${cleanFilePath(String(value))}`;
    case 'files_count':
      return `Files: ${value}`;
    case 'size_mb':
      return `Size: ${value}MB`;
    case 'confidence_score':
      return `Confidence: ${(Number(value) * 100).toFixed(1)}%`;
    case 'execution_time':
      return `Duration: ${value}`;
    case 'approved':
      return value ? '✅ Approved' : '❌ Rejected';
    case 'reasoning':
      return `Reason: ${value}`;
    case 'risks_identified':
      return Array.isArray(value) ? `Risks: ${value.join(', ')}` : `Risks: ${value}`;
    case 'recommendations':
      return Array.isArray(value) ? `Recommendations: ${value.join(', ')}` : `Recommendations: ${value}`;
    default:
      if (typeof value === 'object') {
        return `${key}: ${JSON.stringify(value, null, 2)}`;
      }
      return `${key}: ${value}`;
  }
}
