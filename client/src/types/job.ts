// Job-related type definitions

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
