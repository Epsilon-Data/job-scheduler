import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { getLogLevelColor, formatLogTimestamp, extractRepoPath } from "@/lib/job-utils";
import type { AIAnalysisResult, JobLog, PIIDetail } from "@/types/job";
import type { JobRequest } from "@shared/schema";

interface AIAnalysisCardProps {
  jobRequest: JobRequest;
  aiAnalysisResult?: AIAnalysisResult;
}

export function AIAnalysisLogsCard({ jobRequest }: { jobRequest: JobRequest }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const relevantStatuses = ['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'success', 'failed'];
  if (!relevantStatuses.includes(jobRequest.status)) {
    return null;
  }

  const hasDetailedLogs = (jobRequest.detailed_logs as JobLog[] | undefined)?.some(
    (log) => log.worker_name === 'AIAgentWorker' || log.workerName === 'AIAgentWorker'
  );
  const hasAILogs = !!(jobRequest.ai_logs || jobRequest.aiLogs);

  return (
    <Card className="mb-8">
      <CardHeader>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-cyan-600" />
            <CardTitle>AI Analysis Logs</CardTitle>
            <Badge variant="outline" className="text-xs">
              {jobRequest.status === 'ai_analyzing' ? 'LIVE' :
               hasDetailedLogs || hasAILogs ? 'DETAILED' : 'SIMULATED'}
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
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto">
            <AILogsContent jobRequest={jobRequest} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function AILogsContent({ jobRequest }: { jobRequest: JobRequest }) {
  // Filter AI logs from detailed_logs
  const aiLogs = (jobRequest.detailed_logs as JobLog[] | undefined)?.filter(
    (log) => log.workerName === 'AIAgentWorker' || log.worker_name === 'AIAgentWorker'
  );

  if (aiLogs && aiLogs.length > 0) {
    return (
      <div className="space-y-1">
        {aiLogs.map((log, index) => (
          <AILogEntry key={index} log={log} />
        ))}
      </div>
    );
  }

  // Fallback to string-based logs
  const logs = jobRequest.ai_logs || jobRequest.aiLogs;
  if (logs && logs.trim() !== '') {
    const logLines = logs.split('\n').filter((line: string) => line.trim());
    return (
      <div className="space-y-1">
        {logLines.map((line: string, index: number) => (
          <div key={index} className={`whitespace-pre-wrap ${getLogLineColor(line)}`}>
            {line}
          </div>
        ))}
      </div>
    );
  }

  // Show simulated logs based on status
  return <SimulatedLogs status={jobRequest.status} jobId={jobRequest.jobId} />;
}

function AILogEntry({ log }: { log: JobLog }) {
  const metadata = log.logMetadata || log.metadata;

  return (
    <div className="border-l-2 border-cyan-600 pl-4 py-3">
      <div className={`${getLogLevelColor(log.level)} font-medium break-words`}>
        🤖 {log.level?.toUpperCase() || 'INFO'}: {log.message || log.log_message || log.description || 'Processing...'}
      </div>
      {metadata && Object.keys(metadata).length > 0 && (
        <AIMetadataDisplay metadata={metadata} />
      )}
    </div>
  );
}

function AIMetadataDisplay({ metadata }: { metadata: Record<string, unknown> }) {
  const approved = metadata.approved as boolean | undefined;
  const confidenceScore = metadata.confidence_score as number | undefined;
  const reasoning = metadata.reasoning as string | undefined;
  const risksIdentified = metadata.risks_identified as string[] | undefined;
  const recommendations = metadata.recommendations as string[] | undefined;

  return (
    <div className="mt-2 ml-4 space-y-1">
      {approved !== undefined && (
        <div className={`text-sm font-medium ${approved ? 'text-green-400' : 'text-red-400'}`}>
          {approved ? '✅ APPROVED' : '❌ REJECTED'}
        </div>
      )}
      {confidenceScore !== undefined && (
        <div className="text-gray-400 text-sm">
          Confidence: {(confidenceScore * 100).toFixed(1)}%
        </div>
      )}
      {reasoning && (
        <div className="text-gray-300 text-sm">
          <div className="font-semibold text-cyan-400">AI Reasoning:</div>
          <div className="pl-2 border-l border-cyan-600 mt-1">{reasoning}</div>
        </div>
      )}
      {risksIdentified && risksIdentified.length > 0 && (
        <div className="text-orange-400 text-sm">
          <div className="font-semibold">Risks Identified:</div>
          <ul className="pl-2 mt-1">
            {risksIdentified.map((risk, i) => (
              <li key={i} className="text-orange-300">• {risk}</li>
            ))}
          </ul>
        </div>
      )}
      {recommendations && recommendations.length > 0 && (
        <div className="text-blue-400 text-sm">
          <div className="font-semibold">Recommendations:</div>
          <ul className="pl-2 mt-1">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-blue-300">• {rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SimulatedLogs({ status, jobId }: { status: string; jobId: string }) {
  const currentTime = new Date().toISOString().replace('T', ' ').slice(0, -5);

  if (status === 'ai_analyzing') {
    return (
      <div className="space-y-2">
        <div className="text-yellow-300">🤖 [LIVE] INFO: AI agent is currently analyzing job {jobId}...</div>
        <div className="text-cyan-400">[LIVE] INFO: Checking code for PII access patterns...</div>
        <div className="text-blue-400">[LIVE] INFO: Running security analysis against dataset policies...</div>
      </div>
    );
  }

  if (['ai_approved', 'ai_rejected'].includes(status)) {
    return (
      <div className="space-y-2">
        <div className="text-blue-400">🤖 {currentTime} INFO: Starting AI security analysis</div>
        <div className="text-cyan-400">{currentTime} INFO: Analyzing code for PII patterns</div>
        <div className={status === 'ai_approved' ? 'text-green-400' : 'text-red-400'}>
          {currentTime} {status === 'ai_approved' ? 'SUCCESS: ✅ Code approved' : 'REJECTED: ❌ Code rejected'}
        </div>
      </div>
    );
  }

  if (['running', 'success', 'failed'].includes(status)) {
    return (
      <div className="space-y-2">
        <div className="text-blue-400">🤖 {currentTime} INFO: AI analysis completed successfully</div>
        <div className="text-green-400">{currentTime} SUCCESS: Code passed security review</div>
        <div className="text-gray-400">{currentTime} INFO: Job proceeding to execution phase</div>
      </div>
    );
  }

  return (
    <div className="text-gray-400">No AI analysis logs available for this job.</div>
  );
}

function getLogLineColor(line: string): string {
  if (line.includes('SUCCESS') || line.includes('✅')) return 'text-green-400';
  if (line.includes('ERROR') || line.includes('❌')) return 'text-red-400';
  if (line.includes('WARNING')) return 'text-orange-400';
  if (line.includes('INFO:')) return 'text-blue-400';
  return 'text-gray-300';
}

// AI Analysis Results Card (separate from logs)
export function AIAnalysisResultsCard({ aiAnalysisResult }: { aiAnalysisResult: AIAnalysisResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!aiAnalysisResult?.success || !aiAnalysisResult.data) {
    return null;
  }

  const { data } = aiAnalysisResult;

  return (
    <Card className="mb-8">
      <CardHeader>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-cyan-600" />
            <CardTitle>AI Analysis Results</CardTitle>
            <Badge variant="outline" className="text-xs">
              {data.approved ? 'APPROVED' : 'REJECTED'}
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
          <div className="space-y-4">
            {/* Analysis Decision */}
            <div className={`p-4 rounded-lg border ${data.approved
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'}`}>
              <h4 className={`font-semibold mb-2 flex items-center ${data.approved
                ? 'text-green-800'
                : 'text-red-800'}`}>
                <span className={`mr-2 ${data.approved ? 'text-green-500' : 'text-red-500'}`}>
                  {data.approved ? '✅' : '❌'}
                </span>
                Analysis Decision
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-sm">
                  <span className={`font-medium ${data.approved ? 'text-green-700' : 'text-red-700'}`}>
                    Status:
                  </span>
                  <div className={`font-semibold ${data.approved ? 'text-green-900' : 'text-red-900'}`}>
                    {data.approved ? 'APPROVED' : 'REJECTED'}
                  </div>
                </div>
                <div className="text-sm">
                  <span className={`font-medium ${data.approved ? 'text-green-700' : 'text-red-700'}`}>
                    Confidence:
                  </span>
                  <div className={`font-semibold ${data.approved ? 'text-green-900' : 'text-red-900'}`}>
                    {(data.confidence_score * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* AI Reasoning */}
            {data.reasoning && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                  <span className="text-blue-500 mr-2">🤖</span>
                  AI Reasoning
                </h4>
                <div className="text-sm text-blue-900 leading-relaxed bg-white p-3 rounded border">
                  {data.reasoning}
                </div>
              </div>
            )}

            {/* PII Violations */}
            {data.pii_details && data.pii_details.length > 0 && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <h4 className="font-semibold text-red-800 mb-3 flex items-center">
                  <span className="text-red-500 mr-2">🔍</span>
                  Code Policy Violations
                  <span className="ml-2 px-2 py-1 text-xs bg-red-200 text-red-800 rounded">
                    {data.pii_details.length} found
                  </span>
                </h4>
                <div className="space-y-3">
                  {data.pii_details.map((violation, index) => (
                    <ViolationDisplay key={index} violation={violation} />
                  ))}
                </div>
              </div>
            )}

            {/* Risks */}
            {data.risks_identified && data.risks_identified.length > 0 && (
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <h4 className="font-semibold text-orange-800 mb-2 flex items-center">
                  <span className="text-orange-500 mr-2">⚠️</span>
                  Risks Identified
                </h4>
                <ul className="space-y-1">
                  {data.risks_identified.map((risk, index) => (
                    <li key={index} className="text-sm text-orange-900 flex items-start">
                      <span className="mr-2 mt-0.5">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations && data.recommendations.length > 0 && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                  <span className="text-purple-500 mr-2">💡</span>
                  Recommendations
                </h4>
                <ul className="space-y-1">
                  {data.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-purple-900 flex items-start">
                      <span className="mr-2 mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                <span className="text-gray-500 mr-2">📊</span>
                Analysis Metadata
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {data.timestamp && (
                  <div>
                    <span className="text-gray-700 font-medium">Timestamp:</span>
                    <div className="text-gray-900">
                      {new Date(data.timestamp).toLocaleString()}
                    </div>
                  </div>
                )}
                {data.analysis_version && (
                  <div>
                    <span className="text-gray-700 font-medium">Version:</span>
                    <div className="text-gray-900">{data.analysis_version}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ViolationDisplay({ violation }: { violation: PIIDetail }) {
  return (
    <div className="bg-white border border-red-300 rounded-lg overflow-hidden">
      <div className="bg-red-50 px-4 py-3 border-b border-red-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            <span className="text-sm font-semibold text-red-800">
              {violation.type?.replace('_', ' ')?.toUpperCase() || 'PII VIOLATION'}
            </span>
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
              {violation.field}
            </span>
          </div>
          <div className="text-sm text-red-600 font-mono">Line {violation.line}</div>
        </div>
        <div className="mt-2 flex items-center text-sm text-red-700">
          📁 <span className="ml-1 font-mono">{extractRepoPath(violation.file)}</span>
        </div>
      </div>

      <div className="bg-gray-900 text-gray-100 p-4 font-mono text-sm">
        <div className="flex items-start space-x-4 bg-red-900/30 -mx-4 px-4 py-1 border-l-4 border-red-500">
          <span className="text-right min-w-[2.5rem] text-red-400 font-bold select-none">
            {violation.line}:
          </span>
          <span className="text-yellow-300">{violation.code}</span>
        </div>
      </div>

      <div className="bg-red-50 px-4 py-3 border-t border-red-200">
        <div className="flex items-start space-x-2">
          <span className="text-red-500 mt-0.5">⚠️</span>
          <div className="text-sm text-red-700">
            <span className="font-semibold">Policy Violation:</span> This code accesses the PII field{" "}
            <span className="font-mono bg-red-100 px-1 rounded">{violation.field}</span>{" "}
            which is prohibited by the dataset privacy policy.
          </div>
        </div>
      </div>
    </div>
  );
}
