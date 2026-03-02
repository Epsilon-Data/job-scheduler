import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";
import { formatDateTime, formatDuration } from "@/lib/date-utils";
import { getStepTypeColor, getWorkerEmoji, formatMetadataValue } from "@/lib/job-utils";
import type { JobLog } from "@/types/job";
import type { JobRequest } from "@shared/schema";

interface JobTimelineCardProps {
  jobRequest: JobRequest;
}

export function JobTimelineCard({ jobRequest }: JobTimelineCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle both snake_case and camelCase field names
  const detailedLogs = (jobRequest.detailed_logs || jobRequest.detailedLogs) as JobLog[] | undefined;
  const hasDetailedLogs = detailedLogs && detailedLogs.length > 0;

  return (
    <Card>
      <CardHeader>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <CardTitle>Job Timeline</CardTitle>
            <Badge variant="outline" className="text-xs">
              {hasDetailedLogs ? 'DETAILED' : 'BASIC'}
            </Badge>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <div className="space-y-1">
              {hasDetailedLogs ? (
                <DetailedTimeline logs={detailedLogs} />
              ) : (
                <BasicTimeline jobRequest={jobRequest} />
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function DetailedTimeline({ logs }: { logs: JobLog[] }) {
  return (
    <>
      {logs.map((log, index) => (
        <TimelineEntry key={index} log={log} />
      ))}
    </>
  );
}

function TimelineEntry({ log }: { log: JobLog }) {
  // Handle both snake_case and camelCase field names
  const stepType = log.step_type || log.stepType;
  const workerName = log.worker_name || log.workerName;
  const stepName = log.step_name || log.stepName;
  const createdAt = log.created_at || log.createdAt;
  const durationMs = log.duration_ms || log.durationMs;

  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
  };

  // Get worker badge color
  const getWorkerColor = (worker: string) => {
    switch (worker) {
      case 'JobFetcher': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'CloneWorker': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'ExecutorWorker': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'AIAgentWorker': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <div className="border-l-2 border-gray-600 pl-4 py-2">
      <div className="flex items-start gap-2 flex-wrap">
        {/* Worker Badge */}
        {workerName && (
          <span className={`text-xs px-2 py-0.5 rounded border ${getWorkerColor(workerName)}`}>
            {getWorkerEmoji(workerName)} {workerName}
          </span>
        )}
        {/* Step Name Badge */}
        {stepName && (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">
            {stepName}
          </span>
        )}
        {/* Duration if available */}
        {durationMs && (
          <span className="text-xs text-gray-500">
            ({durationMs}ms)
          </span>
        )}
      </div>
      <div className={`${getStepTypeColor(stepType || '', log.level)} mt-1`}>
        <span className="text-gray-500 text-xs">{formatTimestamp(createdAt)}</span>
        {' '}
        <span className="font-medium">{log.level.toUpperCase()}:</span>
        {' '}
        {log.message}
      </div>
      {log.metadata && Object.keys(log.metadata).length > 0 && (
        <div className="mt-2">
          {Object.entries(log.metadata).map(([key, value]) => (
            <div key={key} className="text-gray-400 ml-4 text-xs">
              {formatMetadataValue(key, value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BasicTimeline({ jobRequest }: { jobRequest: JobRequest }) {
  const relevantStatuses = ['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'success', 'failed'];
  const pastAIAnalysis = ['running', 'success', 'failed'].includes(jobRequest.status);

  return (
    <div className="space-y-1">
      {/* Job Created */}
      <div className="text-blue-400">
        {formatDateTime(jobRequest.createdAt)} INFO: Job {jobRequest.jobId} created and queued
      </div>
      <div className="text-gray-300">
        {formatDateTime(jobRequest.createdAt)} INFO: Repository: {jobRequest.commitSha?.substring(0, 7)} - {jobRequest.commitMessage}
      </div>

      {/* AI Analysis Timeline */}
      {relevantStatuses.includes(jobRequest.status) && (
        <>
          <div className="text-cyan-400">
            {formatDateTime(jobRequest.createdAt)} INFO: AI Pre-Execution Analysis started
          </div>
          {jobRequest.status === 'ai_analyzing' ? (
            <div className="text-cyan-300">
              [LIVE] INFO: AI agent analyzing code against dataset policies...
            </div>
          ) : jobRequest.status === 'ai_rejected' ? (
            <div className="text-red-400">
              {formatDateTime(jobRequest.updatedAt || jobRequest.createdAt)} ERROR: AI Pre-Execution Analysis REJECTED execution
            </div>
          ) : (
            <div className="text-green-400">
              {formatDateTime(jobRequest.updatedAt || jobRequest.createdAt)} SUCCESS: AI Pre-Execution Analysis APPROVED execution
            </div>
          )}
        </>
      )}

      {/* Execution Started */}
      {jobRequest.startedAt && (
        <div className="text-yellow-400">
          {formatDateTime(jobRequest.startedAt)} INFO: Job execution started by {jobRequest.executionMethod || 'job-runner'}
        </div>
      )}

      {/* Job Completed */}
      {jobRequest.status === "success" && jobRequest.completedAt && (
        <>
          <div className="text-green-400">
            {formatDateTime(jobRequest.completedAt)} SUCCESS: Job completed successfully
          </div>
          <div className="text-gray-300">
            {formatDateTime(jobRequest.completedAt)} INFO: Exit code: {jobRequest.exitCode || 0}
          </div>
          <div className="text-gray-300">
            {formatDateTime(jobRequest.completedAt)} INFO: Duration: {formatDuration(jobRequest.durationSeconds)}
          </div>
          {jobRequest.resultMetadata && (
            <div className="text-blue-400">
              {formatDateTime(jobRequest.completedAt)} INFO: Result metadata generated
            </div>
          )}
        </>
      )}

      {/* Job Failed */}
      {jobRequest.status === "failed" && jobRequest.completedAt && (
        <>
          <div className="text-red-400">
            {formatDateTime(jobRequest.completedAt)} ERROR: Job execution failed
          </div>
          {jobRequest.exitCode !== null && jobRequest.exitCode !== undefined && (
            <div className="text-gray-300">
              {formatDateTime(jobRequest.completedAt)} INFO: Exit code: {jobRequest.exitCode}
            </div>
          )}
          {jobRequest.errorMessage && (
            <div className="text-red-300">
              {formatDateTime(jobRequest.completedAt)} ERROR: {jobRequest.errorMessage}
            </div>
          )}
        </>
      )}

      {/* Job Running */}
      {jobRequest.status === "running" && (
        <div className="text-yellow-400">
          [LIVE] INFO: Job is currently executing...
        </div>
      )}

      {/* Job Pending */}
      {jobRequest.status === "pending" && (
        <div className="text-gray-400">
          [PENDING] INFO: Job is waiting to be picked up by job-runner
        </div>
      )}
    </div>
  );
}
