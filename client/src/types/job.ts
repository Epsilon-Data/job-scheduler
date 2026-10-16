// Job-related type definitions
import type { JobOutput, ReleaseDecision, ReleaseStatus } from "@shared/schema";

export interface AttestationData {
  attestation: {
    attestation_document: string;
    attestation_document_length: number;
    format: string;
    signed_by: string;
    user_data_included: boolean;
    user_data_hash?: string;
    nonce_included: boolean;
    how_to_verify: string[];
    aws_root_cert_url: string;
  };
  proof: {
    job_id: string;
    output_hash: string;
    timestamp: number;
    nonce: string;
  };
  verification_guide: Record<string, string>;
}

export interface ZKPData {
  proof: unknown;
  publicSignals: unknown;
  verificationKey: unknown;
  status?: string;
  error?: string;
  scriptHash?: string;
  datasetHash?: string;
  executionId?: string;
  timestamp?: string;
  metadata?: {
    circuit?: string;
  };
}

export interface VerificationResult {
  success: boolean;
  valid?: boolean;
  error?: string;
}

// Execution Result API Response Types
export interface OutputFile {
  name: string;
  size: number;
  content?: string;
}

export interface ExecutionResultData {
  stdout?: string;
  stderr?: string;
  output_files?: OutputFile[];
  return_code?: number;
  execution_time?: number;
  success?: boolean;
  execution_type?: string;
  status?: string;
  output?: string;
  logs?: string;
  artifacts?: string[];
  hash_verification?: {
    code_hash?: string;
    dataset_hash?: string;
    verified?: boolean;
  };
  zkp?: ZKPData;
}

export interface ExecutionResult {
  success: boolean;
  data?: ExecutionResultData;
  result_type?: string;
  file_path?: string;
  error?: string;
}

// AI Analysis Result API Response Types
export interface PIIDetail {
  type: string;
  location?: string;
  severity?: string;
  field?: string;
  line?: number;
  file?: string;
  code?: string;
}

export interface AIAnalysisData {
  approved: boolean;
  confidence_score: number;
  reasoning?: string;
  detected_issues?: string[];
  recommendations?: string[];
  pii_details?: PIIDetail[];
  risks_identified?: string[];
  timestamp?: string;
  analysis_version?: string;
}

export interface AIAnalysisResult {
  success: boolean;
  data?: AIAnalysisData;
  file_path?: string;
  error?: string;
}

// Job log types - supports both snake_case (API) and camelCase (frontend)
export interface JobLog {
  id: string;
  // snake_case (from API)
  job_id?: string;
  worker_name?: string;
  step_name?: string;
  step_type?: string;
  created_at?: string;
  duration_ms?: number;
  error_details?: unknown;
  parent_log_id?: string;
  log_message?: string;
  // camelCase (normalized)
  jobId?: string;
  workerName?: string;
  stepName?: string;
  stepType?: string;
  createdAt?: string;
  durationMs?: number;
  errorDetails?: unknown;
  parentLogId?: string;
  logMessage?: string;
  // Common fields
  level: string;
  message: string;
  description?: string;
  metadata?: Record<string, unknown>;
  logMetadata?: Record<string, unknown>;
  progress?: number;
}

// Output-release review API (reviewers only)
export interface ReviewPerson {
  id: string;
  username: string;
  full_name: string | null;
}

export interface ReviewDecision {
  id: string;
  decision: ReleaseDecision["decision"];
  reason: string | null;
  output_sha256: string | null;
  decided_at: string;
  reviewer: ReviewPerson | null;
}

interface ReviewJobBase {
  job_id: string;
  status: string;
  release_status: ReleaseStatus | null;
  completed_at: string | null;
  submitted_by: ReviewPerson;
  workspace: { id: string; name: string; github_repo: string };
  decision: ReviewDecision | null;
}

// GET /api/review/jobs (never carries held content)
export interface ReviewQueueJob extends ReviewJobBase {
  output_kind: JobOutput["kind"] | null;
  output_size: number | null;
  own_job: boolean;
  ai_decision: string | null;
}

// GET /api/review/jobs/:jobId
export interface ReviewJobDetail extends ReviewJobBase {
  commit_sha: string;
  output: {
    kind: JobOutput["kind"];
    content: string;
    content_sha256: string;
    attested_output_hash: string | null;
    hash_matches_attestation: boolean | null;
    size_bytes: number;
  };
  verification_receipt: Record<string, unknown> | null;
  ai: {
    decision: string | null;
    confidence: number | null;
    reasoning: string | null;
  };
}

// POST /api/review/jobs/:jobId/decision
export interface ReviewDecisionResult {
  decision: ReviewDecision;
  release_status: "released" | "withheld";
}
