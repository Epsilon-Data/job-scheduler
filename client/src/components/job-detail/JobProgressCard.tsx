import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, X, Loader2 } from "lucide-react";
import type { JobLog } from "@/types/job";
import type { JobRequest } from "@shared/schema";

interface JobProgressCardProps {
  jobRequest: JobRequest;
}

interface StepConfig {
  phase: number;
  label: string;
  icon: string;
  color: string;
  progress: number;
  terminal?: boolean;
  isError?: boolean;
}

// Step type configuration from backend
const STEP_CONFIG: Record<string, StepConfig> = {
  // === PHASE 1: QUEUE ===
  job_queued: { phase: 1, label: "Processing Job", icon: "📋", color: "#3B82F6", progress: 0 },
  queued: { phase: 1, label: "Queued", icon: "📋", color: "#3B82F6", progress: 5 },

  // === PHASE 2: CLONE ===
  clone_start: { phase: 2, label: "Clone Started", icon: "🚀", color: "#8B5CF6", progress: 10 },
  clone_preparing: { phase: 2, label: "Preparing Storage", icon: "📁", color: "#8B5CF6", progress: 15 },
  clone_downloading: { phase: 2, label: "Downloading", icon: "📥", color: "#8B5CF6", progress: 20 },
  clone_validating: { phase: 2, label: "Validating", icon: "🔍", color: "#8B5CF6", progress: 25 },
  cloned: { phase: 2, label: "Cloned", icon: "✅", color: "#10B981", progress: 30 },

  // === PHASE 3: AI ANALYSIS ===
  ai_start: { phase: 3, label: "AI Started", icon: "🤖", color: "#F59E0B", progress: 35 },
  ai_analyzing: { phase: 3, label: "Analyzing", icon: "🔬", color: "#F59E0B", progress: 40 },
  ai_evaluating: { phase: 3, label: "Evaluating", icon: "📊", color: "#F59E0B", progress: 45 },
  ai_approved: { phase: 3, label: "AI Approved", icon: "✅", color: "#10B981", progress: 50 },
  ai_rejected: { phase: 3, label: "AI Rejected", icon: "🚫", color: "#EF4444", progress: 100, terminal: true, isError: true },

  // === PHASE 4: EXECUTOR ===
  execution_start: { phase: 4, label: "Execution Started", icon: "⚡", color: "#6366F1", progress: 52 },
  build_validation: { phase: 4, label: "Validating Build", icon: "📋", color: "#6366F1", progress: 55 },
  build_validated: { phase: 4, label: "Build Valid", icon: "✅", color: "#6366F1", progress: 58 },
  enclave_keypair: { phase: 4, label: "Getting Key", icon: "🔑", color: "#6366F1", progress: 60 },
  enclave_keypair_complete: { phase: 4, label: "Key Received", icon: "✅", color: "#6366F1", progress: 65 },
  enclave_keypair_error: { phase: 4, label: "Key Error", icon: "❌", color: "#EF4444", progress: 65, isError: true },
  middleware_fetch: { phase: 4, label: "Fetching CSV", icon: "📡", color: "#6366F1", progress: 68 },
  middleware_fetch_complete: { phase: 4, label: "CSV Received", icon: "✅", color: "#6366F1", progress: 72 },
  middleware_fetch_error: { phase: 4, label: "Fetch Error", icon: "❌", color: "#EF4444", progress: 72, isError: true },
  zip_build: { phase: 4, label: "Compressing", icon: "📦", color: "#6366F1", progress: 75 },
  zip_complete: { phase: 4, label: "Compressed", icon: "✅", color: "#6366F1", progress: 78 },
  zip_error: { phase: 4, label: "Zip Error", icon: "❌", color: "#EF4444", progress: 78, isError: true },
  encryption: { phase: 4, label: "Encrypting", icon: "🔐", color: "#6366F1", progress: 82 },
  encryption_complete: { phase: 4, label: "Encrypted", icon: "✅", color: "#6366F1", progress: 85 },
  encryption_error: { phase: 4, label: "Encryption Error", icon: "❌", color: "#EF4444", progress: 85, isError: true },
  enclave_execution: { phase: 4, label: "Running in Enclave", icon: "🏃", color: "#6366F1", progress: 90 },
  enclave_execution_error: { phase: 4, label: "Enclave Error", icon: "❌", color: "#EF4444", progress: 90, isError: true },
  success: { phase: 4, label: "Completed", icon: "🎉", color: "#10B981", progress: 100, terminal: true },

  // === ERROR STATES ===
  rejected: { phase: 4, label: "Rejected", icon: "🚫", color: "#EF4444", progress: 100, terminal: true, isError: true },
  execution_failed: { phase: 4, label: "Execution Failed", icon: "❌", color: "#EF4444", progress: 100, terminal: true, isError: true },
  failed: { phase: 0, label: "Failed", icon: "❌", color: "#EF4444", progress: 100, terminal: true, isError: true },
  error: { phase: 0, label: "Error", icon: "❌", color: "#EF4444", progress: 100, terminal: true, isError: true },
};

const TERMINAL_STATES = ['success', 'failed', 'rejected', 'ai_rejected', 'execution_failed'];

interface ProgressStep {
  stepType: string;
  stepName: string;
  config: StepConfig;
  status: 'pending' | 'active' | 'complete' | 'failed';
  message: string;
  durationMs?: number;
}

// Parse logs and extract steps using step_type
function parseLogsToSteps(logs: JobLog[], aiEnabled: boolean): ProgressStep[] {
  if (!logs || logs.length === 0) return [];

  // Sort logs by created_at ascending (oldest first)
  const sortedLogs = [...logs].sort((a, b) => {
    const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
    const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
    return dateA - dateB;
  });

  const steps: ProgressStep[] = [];
  const seenStepTypes = new Set<string>();
  let hasTerminalState = false;
  let terminalStepType = '';

  for (const log of sortedLogs) {
    const stepType = log.step_type || log.stepType || 'unknown';
    const stepName = log.step_name || log.stepName || 'Unknown';
    const workerName = log.worker_name || log.workerName || 'Unknown';
    const durationMs = log.duration_ms || log.durationMs;

    // Skip AI logs if AI is disabled
    if (!aiEnabled && workerName === 'AIAgentWorker') {
      continue;
    }

    // Skip duplicate step types (keep first occurrence with message)
    if (seenStepTypes.has(stepType)) {
      continue;
    }
    seenStepTypes.add(stepType);

    const config = STEP_CONFIG[stepType] || {
      phase: 0,
      label: stepName,
      icon: "📝",
      color: "#6B7280",
      progress: 0,
    };

    // Check for terminal state
    if (TERMINAL_STATES.includes(stepType) || config.terminal) {
      hasTerminalState = true;
      terminalStepType = stepType;
    }

    steps.push({
      stepType,
      stepName,
      config,
      status: 'pending', // Will be updated below
      message: log.message || '',
      durationMs,
    });
  }

  // Determine status for each step
  const lastIndex = steps.length - 1;
  steps.forEach((step, index) => {
    if (step.config.isError) {
      step.status = 'failed';
    } else if (hasTerminalState) {
      // If job is finished, all non-error steps are complete
      step.status = step.config.isError ? 'failed' : 'complete';
    } else if (index === lastIndex) {
      // Last step is active
      step.status = 'active';
    } else {
      // All previous steps are complete
      step.status = 'complete';
    }
  });

  return steps;
}

// Fallback steps when no logs are available
function getFallbackSteps(jobRequest: JobRequest, aiEnabled: boolean): ProgressStep[] {
  const status = jobRequest.status;
  const steps: ProgressStep[] = [];

  // Queue step
  steps.push({
    stepType: 'queued',
    stepName: 'Queue Job',
    config: STEP_CONFIG['queued'],
    status: status === 'pending' ? 'active' : 'complete',
    message: status === 'pending' ? 'Waiting to be queued...' : 'Job queued for processing',
  });

  // Clone step
  const cloneComplete = ['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'success', 'failed'].includes(status);
  steps.push({
    stepType: 'cloned',
    stepName: 'Clone Repository',
    config: STEP_CONFIG['cloned'],
    status: cloneComplete ? 'complete' : status === 'queued' ? 'active' : 'pending',
    message: cloneComplete ? 'Repository cloned successfully' : 'Cloning repository...',
  });

  // AI Analysis step (only if enabled)
  if (aiEnabled) {
    const aiComplete = ['running', 'success', 'failed'].includes(status);
    const aiFailed = status === 'ai_rejected';
    steps.push({
      stepType: aiFailed ? 'ai_rejected' : 'ai_approved',
      stepName: 'AI Analysis',
      config: STEP_CONFIG[aiFailed ? 'ai_rejected' : 'ai_approved'],
      status: aiFailed ? 'failed' : aiComplete ? 'complete' : status === 'ai_analyzing' ? 'active' : 'pending',
      message: aiFailed ? 'Code rejected by AI analysis' : aiComplete ? 'Code approved by AI' : 'Analyzing code...',
    });
  }

  // Execution step
  const execComplete = status === 'success';
  const execFailed = status === 'failed';
  steps.push({
    stepType: execFailed ? 'execution_failed' : execComplete ? 'success' : 'execution_start',
    stepName: 'Execute Code',
    config: STEP_CONFIG[execFailed ? 'execution_failed' : execComplete ? 'success' : 'execution_start'],
    status: execFailed ? 'failed' : execComplete ? 'complete' : status === 'running' ? 'active' : 'pending',
    message: execFailed ? 'Execution failed' : execComplete ? 'Executed successfully' : 'Waiting to execute...',
  });

  return steps;
}

function ProgressStepItem({ step, isLast }: { step: ProgressStep; isLast: boolean }) {
  const bgColor = step.status === 'failed'
    ? 'bg-red-50 dark:bg-red-950/30'
    : step.status === 'complete'
    ? 'bg-green-50 dark:bg-green-950/30'
    : step.status === 'active'
    ? 'bg-blue-50 dark:bg-blue-950/30'
    : 'bg-gray-50 dark:bg-gray-900';

  const borderColor = step.status === 'failed'
    ? 'border-l-red-500'
    : step.status === 'complete'
    ? 'border-l-green-500'
    : step.status === 'active'
    ? 'border-l-blue-500'
    : 'border-l-gray-300 dark:border-l-gray-600';

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-r-lg border-l-4 ${bgColor} ${borderColor}`}>
      {/* Status Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {step.status === 'complete' ? (
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
        ) : step.status === 'failed' ? (
          <X className="h-5 w-5 text-red-600 dark:text-red-400" />
        ) : step.status === 'active' ? (
          <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">{step.config.icon}</span>
          <span className="font-medium text-foreground">{step.config.label}</span>
          {step.durationMs && (
            <span className="text-xs text-muted-foreground bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {formatDuration(step.durationMs)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2" title={step.message}>
          {step.message}
        </p>
      </div>
    </div>
  );
}

export function JobProgressCard({ jobRequest }: JobProgressCardProps) {
  // Check if AI is enabled for this job
  const aiEnabled = jobRequest.ai_enabled ?? jobRequest.aiEnabled ?? false;

  // Get detailed logs
  const detailedLogs = (jobRequest.detailed_logs || jobRequest.detailedLogs) as JobLog[] | undefined;

  // Parse logs to steps or use fallback
  const steps = detailedLogs && detailedLogs.length > 0
    ? parseLogsToSteps(detailedLogs, aiEnabled)
    : getFallbackSteps(jobRequest, aiEnabled);

  // Calculate overall progress
  const lastStep = steps[steps.length - 1];
  const overallProgress = lastStep?.config.progress || 0;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Job Progress
            <span className="text-xs font-normal text-muted-foreground">
              ({steps.length} steps)
            </span>
          </CardTitle>
          <span className="text-sm font-medium text-muted-foreground">
            {overallProgress}%
          </span>
        </div>
        {/* Overall progress bar */}
        <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              lastStep?.status === 'failed' ? 'bg-red-500' :
              lastStep?.status === 'complete' && lastStep?.config.terminal ? 'bg-green-500' :
              'bg-blue-500'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {steps.map((step, index) => (
            <ProgressStepItem
              key={`${step.stepType}-${index}`}
              step={step}
              isLast={index === steps.length - 1}
            />
          ))}
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No progress information available
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
