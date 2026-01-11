import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { extractRepoPath } from "@/lib/job-utils";
import type { PIIDetail, JobLog } from "@/types/job";
import type { JobRequest } from "@shared/schema";

interface CodeViolationsCardProps {
  jobRequest: JobRequest;
}

export function CodeViolationsCard({ jobRequest }: CodeViolationsCardProps) {
  // Get violations from code_violations or detailed_logs
  const violations: PIIDetail[] = jobRequest.code_violations ||
    (jobRequest.detailed_logs as JobLog[] | undefined)?.find(
      (log) => log.worker_name === 'AIAgentWorker' && log.metadata?.pii_details
    )?.metadata?.pii_details as PIIDetail[] || [];

  if (violations.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center">
          <span className="text-lg mr-2">🔍</span>
          Code Policy Violations Detected
          <Badge variant="destructive" className="ml-2 text-xs">
            {violations.length} violations
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <p className="text-sm text-red-800">
              ⚠️ The AI agent detected code that accesses personally identifiable information (PII) fields, which violates the dataset privacy policy.
            </p>
          </div>

          {violations.map((violation, index) => (
            <ViolationItem key={index} violation={violation} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ViolationItem({ violation }: { violation: PIIDetail }) {
  return (
    <div className="bg-white border border-red-300 rounded-lg p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
            {violation.type?.replace('_', ' ')?.toUpperCase() || 'VIOLATION'}
          </span>
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
            PII: {violation.field}
          </span>
        </div>
        <div className="text-xs text-red-600 font-mono">
          Line {violation.line}
        </div>
      </div>
      <div className="mb-2">
        <div className="text-sm text-red-700 font-medium mb-1">
          📁 {extractRepoPath(violation.file)}
        </div>
      </div>
      <div className="bg-gray-900 text-gray-100 p-3 rounded border font-mono text-sm overflow-x-auto">
        <div className="flex items-start space-x-3">
          <span className="text-red-400 font-bold min-w-[3rem] text-right">
            {violation.line}:
          </span>
          <CodeWithHighlight code={violation.code || ''} field={violation.field || ''} />
        </div>
      </div>
      <div className="mt-2 text-xs text-red-600">
        ⚠️ This code accesses PII field "{violation.field}" which violates the dataset privacy policy.
      </div>
    </div>
  );
}

function CodeWithHighlight({ code, field }: { code: string; field: string }) {
  if (!code.includes(field)) {
    return <span className="text-yellow-300">{code}</span>;
  }

  const parts = code.split(field);
  return (
    <span className="text-yellow-300">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="bg-red-500 text-white px-1 rounded font-bold">
              {field}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
