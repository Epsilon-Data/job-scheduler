import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ShieldCheck, CheckCircle, X, Loader2, ChevronDown, ChevronRight, Bot, AlertTriangle, Info, GitCommit, Clock, Cpu } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getJobStatusColor } from "@/lib/status-utils";
import type { JobRequest } from "@shared/schema";
import type { JobLog, AIAnalysisResult } from "@/types/job";
import { API_CONFIG } from "@/lib/constants";
import { safeJsonParse } from "@/lib/job-utils";

interface JobRequestDetailProps {
  params: { id: string };
}

export default function JobRequestDetail({ params }: JobRequestDetailProps) {
  const { user } = useAuth();
  const jobId = params.id;
  const { data: jobRequest, isLoading, error } = useQuery<JobRequest>({
    queryKey: [`/api/jobs/${jobId}`],
    enabled: user?.approvalStatus === "approved",
  });

  if (isLoading) return <LoadingSpinner message="Loading job details..." />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!jobRequest) return <NotFoundState jobId={params.id} />;

  const aiEnabled = jobRequest.ai_enabled ?? jobRequest.aiEnabled ?? false;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <JobHeader jobRequest={jobRequest} />

        {/* Commit Info */}
        <CommitInfo jobRequest={jobRequest} />

        {/* Execution Pipeline */}
        <ExecutionPipeline jobRequest={jobRequest} />

        {/* Error Details */}
        {jobRequest.status === 'failed' || jobRequest.status === 'rejected' ? (
          <ErrorCard jobRequest={jobRequest} />
        ) : null}

        {/* Execution Output */}
        <ExecutionOutput jobRequest={jobRequest} />

        {/* Attestation */}
        <AttestationSummary jobRequest={jobRequest} />

        {/* AI Policy Analysis — visually separated */}
        {aiEnabled && <AIAnalysisSection jobRequest={jobRequest} />}

        {/* Detailed Timeline — collapsed */}
        <DetailedTimeline jobRequest={jobRequest} />
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────── */

function JobHeader({ jobRequest }: { jobRequest: JobRequest }) {
  return (
    <div className="mb-6">
      <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
        <Link href="/dashboard" className="hover:text-primary">Dashboard</Link>
        <span>{">"}</span>
        <span className="text-foreground">{jobRequest.jobId}</span>
      </nav>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{jobRequest.jobId}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobRequest.status === 'success' && jobRequest.completedAt
              ? `Completed ${new Date(jobRequest.completedAt).toLocaleString()}`
              : jobRequest.status}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge className={getJobStatusColor(jobRequest.status)}>{jobRequest.status}</Badge>
          {jobRequest.status === "success" && (
            <a
              href={`${API_CONFIG.TRUST_CENTER_URL}/verify/${jobRequest.jobId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Verify on Trust Center
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Commit Info ──────────────────────────────────────────────── */

function CommitInfo({ jobRequest }: { jobRequest: JobRequest }) {
  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6 bg-muted/50 rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5">
        <GitCommit className="h-4 w-4" />
        <code className="text-xs">{jobRequest.commitSha?.slice(0, 8)}</code>
      </div>
      <span className="text-foreground">{jobRequest.commitMessage}</span>
      {jobRequest.commitAuthor && <span>by {jobRequest.commitAuthor}</span>}
    </div>
  );
}

/* ── Execution Pipeline ──────────────────────────────────────── */

const PIPELINE_STEPS = [
  { key: 'queued', label: 'Queued' },
  { key: 'cloned', label: 'Cloned' },
  { key: 'data_fetched', label: 'Data Fetched' },
  { key: 'encrypted', label: 'Encrypted' },
  { key: 'executed', label: 'Executed in TEE' },
  { key: 'attested', label: 'Attestation' },
  { key: 'completed', label: 'Completed' },
];

function getCompletedSteps(status: string): number {
  const statusMap: Record<string, number> = {
    'pending': 0, 'queued': 1, 'cloning': 1, 'cloned': 2, 'ai_approved': 2,
    'executing': 4, 'success': 7, 'failed': 4, 'rejected': 3,
  };
  return statusMap[status] ?? 0;
}

function ExecutionPipeline({ jobRequest }: { jobRequest: JobRequest }) {
  const completedSteps = getCompletedSteps(jobRequest.status);
  const isFailed = ['failed', 'rejected'].includes(jobRequest.status);

  // Parse execution metrics for timing
  const metrics = safeJsonParse<Record<string, number>>(
    typeof jobRequest.executionMetrics === 'string' ? jobRequest.executionMetrics : null, {}
  );

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Execution Pipeline
          </CardTitle>
          {metrics?.total_ms && (
            <span className="text-xs text-muted-foreground">
              Total: {(metrics.total_ms / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFailed ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.round((completedSteps / PIPELINE_STEPS.length) * 100)}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isComplete = i < completedSteps;
            const isActive = i === completedSteps && !isFailed && jobRequest.status !== 'success';
            const isFailedStep = isFailed && i === completedSteps;

            return (
              <div key={step.key} className="flex flex-col items-center text-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  isComplete ? 'bg-green-100 text-green-700' :
                  isFailedStep ? 'bg-red-100 text-red-700' :
                  isActive ? 'bg-blue-100 text-blue-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isComplete ? <CheckCircle className="h-4 w-4" /> :
                   isFailedStep ? <X className="h-4 w-4" /> :
                   isActive ? <Loader2 className="h-4 w-4 animate-spin" /> :
                   <div className="h-2 w-2 rounded-full bg-current opacity-30" />}
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">{step.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Error Card ──────────────────────────────────────────────── */

function ErrorCard({ jobRequest }: { jobRequest: JobRequest }) {
  const errorMsg = jobRequest.errorMessage || jobRequest.executionError;
  if (!errorMsg) return null;

  return (
    <Card className="mb-6 border-red-200">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3 bg-red-50 rounded-lg p-4">
          <X className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Execution Failed</p>
            <pre className="text-sm text-red-700 mt-1 whitespace-pre-wrap font-mono">{errorMsg}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Execution Output ────────────────────────────────────────── */

function ExecutionOutput({ jobRequest }: { jobRequest: JobRequest }) {
  const output = jobRequest.executionOutput;
  const [verifyResult, setVerifyResult] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [computedHash, setComputedHash] = useState<string>('');

  // Extract attested output_hash from CBOR attestation document
  let attestedOutputHash = '';
  try {
    const attestation = safeJsonParse<any>(
      typeof (jobRequest as any).attestation === 'string' ? (jobRequest as any).attestation : null, null
    );
    if (attestation?.attestation?.attestation_document) {
      const decoded = atob(attestation.attestation.attestation_document);
      const start = decoded.indexOf('{"job_id"');
      if (start >= 0) {
        let depth = 0, end = start;
        for (let i = start; i < decoded.length; i++) {
          if (decoded[i] === '{') depth++;
          else if (decoded[i] === '}') depth--;
          if (depth === 0) { end = i + 1; break; }
        }
        const userData = JSON.parse(decoded.slice(start, end));
        attestedOutputHash = userData?.output_hash || '';
      }
    }
  } catch {}

  const verify = async () => {
    if (!output) { setVerifyResult('mismatch'); return; }
    const encoded = new TextEncoder().encode(output);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    setComputedHash(hex);
    setVerifyResult(hex === attestedOutputHash ? 'match' : 'mismatch');
  };

  if (!output) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Execution Output</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
          {output}
        </pre>
        {attestedOutputHash && (
          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Output Integrity:</span>
            {verifyResult === 'idle' && (
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={verify}>
                <ShieldCheck className="h-3 w-3 mr-1" />
                Verify SHA-256
              </Button>
            )}
            {verifyResult === 'match' && (
              <Badge variant="outline" className="text-green-700 border-green-300 text-xs gap-1">
                <CheckCircle className="h-3 w-3" /> Hash matches attested value
              </Badge>
            )}
            {verifyResult === 'mismatch' && (
              <Badge variant="outline" className="text-red-700 border-red-300 text-xs gap-1">
                <X className="h-3 w-3" /> Hash does not match
              </Badge>
            )}
            {computedHash && (
              <span className="font-mono text-xs text-muted-foreground truncate">{computedHash.slice(0, 16)}...</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Attestation Summary ─────────────────────────────────────── */

function AttestationSummary({ jobRequest }: { jobRequest: JobRequest }) {
  const attestationRaw = (jobRequest as any).attestation;
  if (!attestationRaw) return null;

  const attestation = safeJsonParse<any>(
    typeof attestationRaw === 'string' ? attestationRaw : JSON.stringify(attestationRaw), null
  );
  if (!attestation?.attestation) return null;

  const doc = attestation.attestation;
  const proof = attestation.proof;
  const isLocal = doc.is_local === true;

  // Extract user_data JSON from the base64 CBOR attestation document
  // user_data contains job_id, script_hash, dataset_hash, output_hash, timestamp, nonce
  let userData: any = null;
  try {
    if (doc.attestation_document) {
      const decoded = atob(doc.attestation_document);
      const start = decoded.indexOf('{"job_id"');
      if (start >= 0) {
        let depth = 0, end = start;
        for (let i = start; i < decoded.length; i++) {
          if (decoded[i] === '{') depth++;
          else if (decoded[i] === '}') depth--;
          if (depth === 0) { end = i + 1; break; }
        }
        userData = JSON.parse(decoded.slice(start, end));
      }
    }
  } catch {}
  // Fallback: try doc.user_data or proof
  if (!userData) {
    userData = safeJsonParse<any>(
      typeof doc.user_data === 'string' ? doc.user_data : null, null
    );
  }

  // Parse verification_receipt and execution_metrics from job
  const receipt = safeJsonParse<any>(
    typeof (jobRequest as any).verification_receipt === 'string'
      ? (jobRequest as any).verification_receipt : null, null
  );
  const metrics = safeJsonParse<any>(
    typeof (jobRequest as any).execution_metrics === 'string'
      ? (jobRequest as any).execution_metrics : null, null
  );

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            Attestation
          </CardTitle>
          <Badge variant="outline" className="text-green-700 border-green-300">
            {isLocal ? 'LOCAL DEV' : 'ATTESTED'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Core attestation info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Module ID</span>
            <p className="font-mono text-xs truncate">{doc.module_id}</p>
          </div>
          {doc.format && (
            <div>
              <span className="text-muted-foreground">Format</span>
              <p className="font-mono text-xs">{doc.format}</p>
            </div>
          )}
          {doc.signed_by && (
            <div>
              <span className="text-muted-foreground">Signed By</span>
              <p className="font-mono text-xs">{doc.signed_by}</p>
            </div>
          )}
          {doc.attestation_document_length && (
            <div>
              <span className="text-muted-foreground">Document Size</span>
              <p className="font-mono text-xs">{doc.attestation_document_length} bytes</p>
            </div>
          )}
        </div>

        {/* PCR Values */}
        {(receipt?.pcrs || doc.pcrs) && (
          <>
            <div className="border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">PCR Values (Enclave Measurements)</span>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm">
              {['pcr0', 'pcr1', 'pcr2'].map((pcr) => {
                const value = receipt?.pcrs?.[pcr] || doc.pcrs?.[pcr];
                if (!value) return null;
                return (
                  <div key={pcr}>
                    <span className="text-muted-foreground uppercase text-xs">{pcr}</span>
                    <p className="font-mono text-xs break-all">{value}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Execution Proof Chain: repo → commit → script → data → output */}
        <>
          <div className="border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution Proof</span>
          </div>
          <div className="space-y-2 text-sm">
            {/* Source */}
            {((jobRequest as any).github_repo || jobRequest.commitSha) && (
              <div className="flex items-start gap-2">
                <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  {(jobRequest as any).github_repo && (
                    <a
                      href={`https://github.com/${(jobRequest as any).github_repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {(jobRequest as any).github_repo}
                    </a>
                  )}
                  {((jobRequest as any).commit_hash || jobRequest.commitSha) && (
                    <p className="font-mono text-xs text-muted-foreground">
                      commit {((jobRequest as any).commit_hash || jobRequest.commitSha)?.slice(0, 8)}
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* Arrow */}
            {(userData?.script_hash || proof?.script_hash) && (
              <div className="text-muted-foreground text-xs pl-2">↓</div>
            )}
            {/* Script Hash */}
            {(userData?.script_hash || proof?.script_hash) && (
              <div>
                <span className="text-muted-foreground">Script Hash (SHA-256 of code bundle)</span>
                <p className="font-mono text-xs break-all">{userData?.script_hash || proof?.script_hash}</p>
              </div>
            )}
            {/* Dataset Hash */}
            {(userData?.dataset_hash || proof?.dataset_hash) && (
              <div>
                <span className="text-muted-foreground">Dataset Hash (SHA-256 of ingested data)</span>
                <p className="font-mono text-xs break-all">{userData?.dataset_hash || proof?.dataset_hash}</p>
              </div>
            )}
            {/* Arrow */}
            {(userData?.output_hash || proof?.output_hash) && (
              <div className="text-muted-foreground text-xs pl-2">↓</div>
            )}
            {/* Output Hash */}
            {(userData?.output_hash || proof?.output_hash) && (
              <div>
                <span className="text-muted-foreground">Output Hash (SHA-256 of execution result)</span>
                <p className="font-mono text-xs break-all">{userData?.output_hash || proof?.output_hash}</p>
              </div>
            )}
            {/* Timestamp */}
            {(userData?.timestamp || proof?.timestamp) && (
              <div className="pt-1">
                <span className="text-muted-foreground">Timestamp</span>
                <p className="font-mono text-xs">
                  {typeof (userData?.timestamp ?? proof?.timestamp) === 'number'
                    ? new Date((userData?.timestamp ?? proof?.timestamp) * 1000).toISOString()
                    : (userData?.timestamp || '')}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
            All hashes above are embedded in the hardware-signed attestation document. They cannot be modified after execution.
          </p>
        </>

        {/* Server Verification Receipt */}
        {receipt && (
          <>
            <div className="border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Server Verification</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {Object.entries(receipt.checks || {}).map(([check, passed]) => (
                <div key={check} className="flex items-center gap-1.5">
                  {passed ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className="text-xs">{check.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
            {receipt.error && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">{receipt.error}</p>
            )}
            {receipt.timing && (
              <p className="text-xs text-muted-foreground">
                Verified in {receipt.timing.total_ms?.toFixed(0)}ms (parse: {receipt.timing.parse_ms?.toFixed(0)}ms, cert chain: {receipt.timing.cert_chain_ms?.toFixed(0)}ms)
              </p>
            )}
          </>
        )}

        {/* Execution Metrics */}
        {metrics && (
          <>
            <div className="border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution Metrics</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {metrics.fetch_middleware_ms != null && (
                <div>
                  <span className="text-muted-foreground text-xs">Data Fetch</span>
                  <p className="font-mono text-xs">{(metrics.fetch_middleware_ms / 1000).toFixed(2)}s</p>
                </div>
              )}
              {metrics.zip_and_encrypt_ms != null && (
                <div>
                  <span className="text-muted-foreground text-xs">Encrypt</span>
                  <p className="font-mono text-xs">{metrics.zip_and_encrypt_ms.toFixed(0)}ms</p>
                </div>
              )}
              {metrics.enclave_round_trip_ms != null && (
                <div>
                  <span className="text-muted-foreground text-xs">Enclave Execution</span>
                  <p className="font-mono text-xs">{metrics.enclave_round_trip_ms.toFixed(0)}ms</p>
                </div>
              )}
              {metrics.total_ms != null && (
                <div>
                  <span className="text-muted-foreground text-xs">Total</span>
                  <p className="font-mono text-xs">{(metrics.total_ms / 1000).toFixed(2)}s</p>
                </div>
              )}
              {metrics.ai_decision && (
                <div>
                  <span className="text-muted-foreground text-xs">AI Decision</span>
                  <Badge variant="outline" className="text-xs">{metrics.ai_decision.replace(/_/g, ' ')}</Badge>
                </div>
              )}
            </div>
          </>
        )}

        {/* Raw attestation document */}
        {doc.attestation_document && (
          <>
            <div className="border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Raw Attestation Document (Base64)</span>
            </div>
            <div className="relative">
              <pre className="bg-muted rounded px-3 py-2 text-xs font-mono break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                {doc.attestation_document}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-6 text-xs"
                onClick={() => navigator.clipboard.writeText(doc.attestation_document)}
              >
                Copy
              </Button>
            </div>
          </>
        )}

        {isLocal && (
          <p className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
            Local simulation — signed by a local ECDSA P-384 CA instead of AWS Nitro hardware.
            All cryptographic verification steps are identical to production.
          </p>
        )}

      </CardContent>
    </Card>
  );
}

/* ── AI Analysis Section (Independent) ───────────────────────── */

function AIAnalysisSection({ jobRequest }: { jobRequest: JobRequest }) {
  const [showLogs, setShowLogs] = useState(false);
  const aiLogs = jobRequest.ai_logs || jobRequest.aiLogs;
  const validationStatus = jobRequest.validationStatus || (jobRequest as any).validation_status;
  const validationDecision = jobRequest.validationDecision || (jobRequest as any).validation_decision;

  const confidence = validationStatus ? parseFloat(validationStatus) : null;
  const isError = validationDecision?.startsWith('AI analysis error');
  const isLoading = !validationStatus && !validationDecision;

  // Parse risks from ai_logs (must be before isApproved)
  let risks: string[] = [];
  try {
    const parsed = typeof aiLogs === 'string' ? JSON.parse(aiLogs) : aiLogs;
    if (Array.isArray(parsed)) risks = parsed;
  } catch {}

  // Determine approval: if risks exist it's rejected, otherwise check confidence
  const isApproved = risks.length === 0 && confidence !== null && confidence >= 0.8;

  // Get AI-specific detailed logs
  const detailedLogs = ((jobRequest.detailed_logs || jobRequest.detailedLogs) as JobLog[] | undefined)
    ?.filter(log => (log.worker_name || log.workerName) === 'AIAgentWorker')
    ?.sort((a, b) => new Date(a.created_at || a.createdAt || 0).getTime() - new Date(b.created_at || b.createdAt || 0).getTime());

  return (
    <div className="mb-6">
      <div className="border-t border-dashed pt-6 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Bot className="h-4 w-4" />
          <span className="font-medium">AI Policy Analysis</span>
          <Badge variant="outline" className="text-xs">Beta</Badge>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <Card className="border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin shrink-0" />
              <div>
                <p className="font-medium text-sm text-blue-800">AI Analysis in Progress</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CrewAI agents are analyzing the code for security risks. This typically takes 30-60 seconds.
                </p>
              </div>
            </div>
            {/* Show any logs that arrived so far */}
            {detailedLogs && detailedLogs.length > 0 && (
              <div className="mt-3 space-y-1">
                {detailedLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-blue-700">
                    <CheckCircle className="h-3 w-3 shrink-0" />
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {isError && (
        <Card className="border-red-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <X className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-red-800">AI Analysis Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{validationDecision}</p>
                <div className="flex items-start gap-1.5 mt-3 text-xs text-muted-foreground bg-muted rounded px-3 py-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>AI analysis failure does not affect job execution or attestation.</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result State */}
      {!isLoading && !isError && confidence !== null && (
        <Card className={isApproved ? 'border-green-200' : risks.length > 0 ? 'border-red-200' : 'border-amber-200'}>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              {isApproved ? (
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              ) : risks.length > 0 ? (
                <X className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {isApproved ? 'Approved' : risks.length > 0 ? 'Rejected' : 'Flagged for Review'}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Confidence: {Math.round(confidence * 100)}%
                  </Badge>
                </div>

                {validationDecision && (
                  <p className="text-sm text-muted-foreground mt-1">{validationDecision}</p>
                )}

              {risks.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {risks.map((risk, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{risk}</Badge>
                  ))}
                </div>
              )}

              <div className="flex items-start gap-1.5 mt-3 text-xs text-muted-foreground bg-muted rounded px-3 py-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  AI analysis is informational only and does not affect execution or attestation.
                  The AI agent operates outside the Trusted Computing Base.
                </span>
              </div>

              {/* CrewAI Logs Toggle */}
              {detailedLogs && detailedLogs.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showLogs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Agent Logs ({detailedLogs.length} events)
                  </button>
                  {showLogs && (
                    <div className="mt-2 space-y-1 bg-muted/50 rounded-lg p-3">
                      {detailedLogs.map((log, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                          <span className="text-muted-foreground shrink-0 w-16">
                            {new Date(log.created_at || log.createdAt || '').toLocaleTimeString()}
                          </span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {log.step_type || log.stepType}
                          </Badge>
                          <span className="text-foreground">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

/* ── Detailed Timeline (collapsed) ───────────────────────────── */

function DetailedTimeline({ jobRequest }: { jobRequest: JobRequest }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailedLogs = (jobRequest.detailed_logs || jobRequest.detailedLogs) as JobLog[] | undefined;

  if (!detailedLogs || detailedLogs.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader
        className="pb-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            Detailed Timeline
            <span className="text-xs font-normal">({detailedLogs.length} events)</span>
          </CardTitle>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="space-y-1.5">
            {detailedLogs
              .sort((a, b) => new Date(a.created_at || a.createdAt || 0).getTime() - new Date(b.created_at || b.createdAt || 0).getTime())
              .map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-muted last:border-0">
                  <span className="text-muted-foreground shrink-0 w-16">
                    {new Date(log.created_at || log.createdAt || '').toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {log.step_type || log.stepType}
                  </Badge>
                  <span className="text-foreground truncate">{log.message}</span>
                  {(log.duration_ms || log.durationMs) && (
                    <span className="text-muted-foreground shrink-0">
                      {log.duration_ms || log.durationMs}ms
                    </span>
                  )}
                </div>
              ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ── Error/Not Found States ──────────────────────────────────── */

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Error loading job</h2>
        <p className="text-muted-foreground">{message}</p>
        <Link href="/dashboard"><Button className="mt-4">Back to Dashboard</Button></Link>
      </div>
    </div>
  );
}

function NotFoundState({ jobId }: { jobId: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Job not found</h2>
        <p className="text-muted-foreground">Job ID: {jobId}</p>
        <Link href="/dashboard"><Button className="mt-4">Back to Dashboard</Button></Link>
      </div>
    </div>
  );
}
