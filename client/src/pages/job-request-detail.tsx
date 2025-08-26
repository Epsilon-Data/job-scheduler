import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, GitCommit, User, Clock, CheckCircle, X, Eye, ChevronDown, ChevronRight, Bot } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { JobRequest } from "@shared/schema";

// ZKP Verify Button Component
function ZKPVerifyButton({ zkp }: { zkp: any }) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  
  return (
    <div className="flex items-center gap-2">
      {verificationResult && (
        <span className={`text-xs px-2 py-1 rounded ${
          verificationResult.valid 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {verificationResult.valid ? '✅ Valid' : '❌ Invalid'}
        </span>
      )}
      <button
        onClick={async () => {
          setVerifying(true);
          try {
            const response = await fetch('http://localhost:3003/api/zkp/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proof: zkp.proof,
                publicSignals: zkp.publicSignals,
                verificationKey: zkp.verificationKey
              })
            });
            const result = await response.json();
            
            setVerificationResult(result);
            
            if (result.success && result.valid) {
              alert('✅ Proof is VALID!\n\nYour execution integrity is cryptographically verified. This proves:\n• Your exact script was executed\n• Your exact dataset was used\n• No tampering occurred during execution');
            } else {
              alert('❌ Proof verification FAILED!\n\nThis may indicate:\n• Tampering with code or data\n• Corrupted proof data\n• Invalid execution');
            }
          } catch (error) {
            setVerificationResult({ success: false, error: (error as Error).message });
            alert('⚠️ Could not connect to verification service.\n\nTry:\n• Check if ZKP service is running\n• Use the manual API command below\n• Contact system administrator');
          } finally {
            setVerifying(false);
          }
        }}
        disabled={verifying}
        className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verifying ? '⏳ Verifying...' : 'Verify Proof'}
      </button>
    </div>
  );
}

interface JobRequestDetailProps {
  params: {
    id: string;
  };
}

export default function JobRequestDetail({ params }: JobRequestDetailProps) {
  const { user } = useAuth();
  const [showAILogs, setShowAILogs] = useState(false);
  const [showExecutionOutput, setShowExecutionOutput] = useState(false);
  const [showResultMetadata, setShowResultMetadata] = useState(false);
  const [showDefaultPolicy, setShowDefaultPolicy] = useState(false);
  const [showAIAnalysisResults, setShowAIAnalysisResults] = useState(false);
  const [showJobTimeline, setShowJobTimeline] = useState(false);

  const { data: jobRequest, isLoading, error } = useQuery<JobRequest>({
    queryKey: [`/api/jobs/${params.id}`],
    enabled: user?.approvalStatus === "approved",
  });

  // Fetch execution result from epsilon-coordinator
  const { data: executionResult } = useQuery({
    queryKey: [`/api/jobs/${params.id}/execution-result`],
    enabled: !!jobRequest && user?.approvalStatus === "approved",
    retry: false
  });

  // Fetch AI analysis result from epsilon-coordinator
  const { data: aiAnalysisResult } = useQuery({
    queryKey: [`/api/jobs/${params.id}/ai-analysis-result`],
    enabled: !!jobRequest && user?.approvalStatus === "approved",
    retry: false
  });


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Error loading job request</h2>
          <p className="text-muted-foreground">Error: {(error as Error).message}</p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!jobRequest && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Job request not found</h2>
          <p className="text-muted-foreground">The job request you're looking for doesn't exist or you don't have access to it.</p>
          <p className="text-xs text-muted-foreground mt-2">Job ID: {params.id}</p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "ai_analyzing":
        return "bg-cyan-100 text-cyan-800";
      case "ai_approved":
        return "bg-green-100 text-green-800";
      case "ai_rejected":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds && seconds !== 0) return "-";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <Link href="/dashboard" className="hover:text-primary">
              Dashboard
            </Link>
            <span>{">"}</span>
            <Link href="/workspaces" className="hover:text-primary">
              Workspaces
            </Link>
            <span>{">"}</span>
            <span className="text-foreground">{jobRequest.jobId}</span>
          </nav>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Job Request Details</h1>
              <p className="mt-2 text-muted-foreground">{jobRequest.jobId}</p>
            </div>
            <div className="flex items-center space-x-3">
              <Badge className={getStatusColor(jobRequest.status)}>
                {jobRequest.status}
              </Badge>
              {jobRequest.status === "completed" && (
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download Results
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Job Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Job ID</h3>
              <p className="text-lg font-semibold text-foreground">{jobRequest.jobId}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Duration</h3>
              <p className="text-lg font-semibold text-foreground">
                {formatDuration(jobRequest.duration_seconds || jobRequest.durationSeconds)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Submitted</h3>
              <p className="text-lg font-semibold text-foreground">
                {formatDateTime(jobRequest.createdAt)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Completed</h3>
              <p className="text-lg font-semibold text-foreground">
                {(jobRequest.completed_at || jobRequest.completedAt) ? formatDateTime(jobRequest.completed_at || jobRequest.completedAt) : "-"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Execution Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Exit Code</h3>
              <p className="text-lg font-semibold text-foreground">
                {jobRequest.exitCode !== null && jobRequest.exitCode !== undefined ? jobRequest.exitCode : "-"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Execution Method</h3>
              <p className="text-lg font-semibold text-foreground">
                {jobRequest.executionMethod || "Unknown"}
              </p>
            </CardContent>
          </Card>

          {jobRequest.validationStatus && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Validation Status</h3>
                <Badge className={jobRequest.validationStatus === 'validated' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {jobRequest.validationStatus}
                </Badge>
              </CardContent>
            </Card>
          )}

          {jobRequest.validationDecision && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Validation Decision</h3>
                <Badge className={jobRequest.validationDecision === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                  {jobRequest.validationDecision}
                </Badge>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Commit Information */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Commit Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                  <GitCommit className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <Badge variant="outline">{jobRequest.commitSha?.substring(0, 7)}</Badge>
                  <span className="text-sm text-muted-foreground">on main</span>
                </div>
                <h3 className="text-base font-medium text-foreground mb-1">
                  {jobRequest.commitMessage || "No commit message"}
                </h3>
                <div className="flex items-center space-x-4 mt-3 text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <User className="mr-1 h-4 w-4" />
                    <span>{jobRequest.commitAuthor || "Unknown"}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="mr-1 h-4 w-4" />
                    <span>
                      {jobRequest.commitDate ? new Date(jobRequest.commitDate).toLocaleDateString() : "Unknown"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Progress */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Job Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Repository Clone */}
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  ['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) 
                    ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Repository Clone</span>
                    <span className="text-sm text-muted-foreground">
                      {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) 
                      ? `Successfully cloned repository and checked out commit ${jobRequest.commitSha?.substring(0, 7)}`
                      : 'Waiting to clone repository'}
                  </p>
                </div>
              </div>

              {/* Environment Setup */}
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  ['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) 
                    ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Environment Setup</span>
                    <span className="text-sm text-muted-foreground">
                      {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) 
                      ? `Environment configured for AI analysis and execution`
                      : 'Waiting to setup environment'}
                  </p>
                </div>
              </div>

              {/* Pre-Execution AI Analysis */}
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  jobRequest.status === 'ai_analyzing' 
                    ? 'bg-cyan-100'
                    : jobRequest.status === 'ai_approved'
                    ? 'bg-green-100'
                    : jobRequest.status === 'ai_rejected'
                    ? 'bg-red-100'
                    : ['running', 'completed', 'failed'].includes(jobRequest.status)
                    ? 'bg-green-100'
                    : 'bg-gray-100'
                }`}>
                  {jobRequest.status === 'ai_analyzing' ? (
                    <div className="w-2 h-2 bg-cyan-600 rounded-full animate-pulse"></div>
                  ) : jobRequest.status === 'ai_approved' || ['running', 'completed', 'failed'].includes(jobRequest.status) ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : jobRequest.status === 'ai_rejected' ? (
                    <X className="h-4 w-4 text-red-600" />
                  ) : (
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Pre-Execution AI Analysis</span>
                    <span className="text-sm text-muted-foreground">
                      {jobRequest.status === 'ai_analyzing' ? 'Analyzing' :
                       jobRequest.status === 'ai_approved' ? 'Approved' :
                       jobRequest.status === 'ai_rejected' ? 'Rejected' :
                       ['running', 'completed', 'failed'].includes(jobRequest.status) ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {jobRequest.status === 'ai_analyzing' 
                      ? 'AI agent is currently analyzing code against dataset policies'
                      : jobRequest.status === 'ai_rejected' 
                      ? 'AI analysis determined the code poses privacy or security risks'
                      : jobRequest.status === 'ai_approved' || ['running', 'completed', 'failed'].includes(jobRequest.status)
                      ? 'AI analysis approved code for execution against dataset policy'
                      : 'Waiting for AI analysis of code and dataset policies'}
                  </p>
                </div>
              </div>

              {/* Code Execution */}
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  jobRequest.status === 'completed' 
                    ? 'bg-green-100' 
                    : jobRequest.status === 'failed' && jobRequest.executionMethod !== 'ai_rejected'
                    ? 'bg-red-100'
                    : jobRequest.status === 'running' 
                    ? 'bg-blue-100' 
                    : 'bg-gray-100'
                }`}>
                  {jobRequest.status === 'completed' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : jobRequest.status === 'failed' && jobRequest.executionMethod !== 'ai_rejected' ? (
                    <X className="h-4 w-4 text-red-600" />
                  ) : jobRequest.status === 'running' ? (
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                  ) : (
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Code Execution</span>
                    <span className="text-sm text-muted-foreground">
                      {jobRequest.executionMethod === 'ai_rejected' ? 'Skipped' :
                       jobRequest.status === 'completed' ? 'Completed' : 
                       jobRequest.status === 'failed' ? 'Failed' :
                       jobRequest.status === 'running' ? 'Running' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {jobRequest.executionMethod === 'ai_rejected' 
                      ? 'Code execution was skipped due to AI analysis rejection'
                      : jobRequest.status === 'completed' 
                      ? `Job executed successfully with exit code ${jobRequest.exitCode || 0}`
                      : jobRequest.status === 'failed'
                      ? `Job execution failed${jobRequest.exitCode ? ` with exit code ${jobRequest.exitCode}` : ''}`
                      : jobRequest.status === 'running'
                      ? 'Job is currently executing...'
                      : 'Waiting to execute job after AI analysis approval'}
                  </p>
                </div>
              </div>

              {/* Results Processing */}
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  jobRequest.status === 'completed' 
                    ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {jobRequest.status === 'completed' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Results Processing</span>
                    <span className="text-sm text-muted-foreground">
                      {jobRequest.status === 'completed' ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {jobRequest.status === 'completed' 
                      ? (jobRequest.resultMetadata ? 'Results processed and metadata generated' : 'Job completed')
                      : 'Waiting to process results'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Messages */}
        {(jobRequest.errorMessage || jobRequest.executionError) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-red-600">Error Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                {jobRequest.errorMessage && (
                  <div className="mb-4">
                    <h4 className="font-medium text-red-800 mb-2">Error Message:</h4>
                    <p className="text-red-700 whitespace-pre-wrap">{jobRequest.errorMessage}</p>
                  </div>
                )}
                {jobRequest.executionError && (
                  <div>
                    <h4 className="font-medium text-red-800 mb-2">Execution Error:</h4>
                    <pre className="text-red-700 text-sm bg-white p-2 rounded border overflow-x-auto whitespace-pre-wrap">
                      {jobRequest.executionError}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Execution Output */}
        {jobRequest.executionOutput && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowExecutionOutput(!showExecutionOutput)}>
                <div className="flex items-center space-x-2">
                  <span className="text-lg">🖥️</span>
                  <CardTitle>Execution Output</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {jobRequest.executionOutput ? 'AVAILABLE' : 'EMPTY'}
                  </Badge>
                </div>
                {showExecutionOutput ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {showExecutionOutput && (
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground flex items-center justify-between">
                    <span>Program output and console logs</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(jobRequest.executionOutput)}
                      className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                    >
                      Copy Output
                    </button>
                  </div>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{jobRequest.executionOutput}</pre>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* ZKP Information */}
        {jobRequest.resultMetadata && (() => {
          try {
            const metadata = typeof jobRequest.resultMetadata === 'string' 
              ? JSON.parse(jobRequest.resultMetadata) 
              : jobRequest.resultMetadata;
            
            if (metadata.zkp) {
              const zkp = metadata.zkp;
              return (
                <Card className="mb-8">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        🔐 Zero-Knowledge Proof (ZKP)
                      </CardTitle>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                        zkp.status === 'generated' ? 'bg-green-100 text-green-800' :
                        zkp.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {zkp.status?.toUpperCase() || 'UNKNOWN'}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-2">🔐 Your Integrity Proof</h4>
                      <p className="text-sm text-blue-800 mb-3">
                        This ZKP proves your code and dataset weren't tampered with. <strong>You can verify this yourself!</strong>
                      </p>
                      
                      <div className="bg-white border border-blue-300 rounded-lg p-3 mb-3">
                        <h5 className="font-medium text-blue-900 mb-2">✅ Verify Your Script Hash</h5>
                        <div className="space-y-2">
                          <div className="bg-gray-50 p-2 rounded border">
                            <code className="text-xs text-gray-800 break-all">{zkp.scriptHash || 'Not available'}</code>
                          </div>
                          <div className="text-xs text-blue-700">
                            <strong>How to verify:</strong>
                            <pre className="bg-blue-100 p-2 rounded mt-1 text-xs overflow-x-auto">
{`git clone ${jobRequest.repoUrl || 'your-repo'}
sha256sum example_analysis.py
# Should match: ${zkp.scriptHash?.substring(0, 16)}...`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white border border-blue-300 rounded-lg p-3 mb-3">
                        <h5 className="font-medium text-blue-900 mb-2">✅ Verify Your Dataset Hash</h5>
                        <div className="space-y-2">
                          <div className="bg-gray-50 p-2 rounded border">
                            <code className="text-xs text-gray-800 break-all">{zkp.datasetHash || 'Not available'}</code>
                          </div>
                          <div className="text-xs text-blue-700">
                            <strong>How to verify:</strong>
                            <pre className="bg-blue-100 p-2 rounded mt-1 text-xs overflow-x-auto">
{`git clone ${jobRequest.repoUrl || 'your-repo'}
sha256sum *.csv
# Should match: ${zkp.datasetHash?.substring(0, 16)}...`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 border border-green-300 rounded-lg p-3">
                        <h5 className="font-medium text-green-900 mb-2">🛡️ What This Guarantees</h5>
                        <ul className="text-xs text-green-800 space-y-1">
                          <li>• Your exact script ({zkp.executionId}) was executed</li>
                          <li>• Your exact dataset was used (no substitution)</li>
                          <li>• Execution occurred at: {zkp.timestamp ? new Date(zkp.timestamp).toLocaleString() : 'Unknown'}</li>
                          <li>• No tampering during execution</li>
                        </ul>
                      </div>
                    </div>

                    {zkp.status === 'failed' && zkp.error && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">Error Details</h4>
                        <p className="text-sm text-red-800">{zkp.error}</p>
                      </div>
                    )}

                    {zkp.status === 'generated' && zkp.proof && (
                      <div className="space-y-3">
                        <div className="bg-purple-50 border border-purple-300 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium text-purple-900">🔍 Independent Verification</h5>
                            <ZKPVerifyButton zkp={zkp} />
                          </div>
                          <p className="text-xs text-purple-800 mb-2">
                            Click to verify this proof instantly, or use the manual API call below:
                          </p>
                          <details className="bg-white border rounded p-2">
                            <summary className="text-xs cursor-pointer text-gray-600">Show API Command</summary>
                            <pre className="text-xs text-gray-800 overflow-x-auto mt-2">
{`curl -X POST http://localhost:3003/api/zkp/verify \\
  -H "Content-Type: application/json" \\
  -d '{
    "proof": ${JSON.stringify(zkp.proof, null, 2).substring(0, 50)}...,
    "publicSignals": ${JSON.stringify(zkp.publicSignals, null, 2).substring(0, 50)}...,
    "verificationKey": {...}
  }'`}
                            </pre>
                          </details>
                        </div>

                        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <summary className="font-semibold text-gray-900 cursor-pointer">
                            📋 Complete Verification Data
                          </summary>
                          <div className="mt-3 space-y-3 text-sm text-gray-700">
                            <div>
                              <p className="mb-2"><strong>Circuit:</strong> {zkp.metadata?.circuit || 'integrity_verification'}</p>
                              <p className="mb-2"><strong>What the proof guarantees:</strong></p>
                              <ul className="text-xs ml-4 space-y-1">
                                <li>• Script hash: {zkp.scriptHash?.substring(0, 32)}...</li>
                                <li>• Dataset hash: {zkp.datasetHash?.substring(0, 32)}...</li>
                                <li>• Execution ID: {zkp.executionId}</li>
                                <li>• Timestamp: {zkp.timestamp ? new Date(zkp.timestamp).toLocaleString() : 'Unknown'}</li>
                              </ul>
                            </div>
                            
                            <div className="bg-white border rounded p-3">
                              <span className="text-xs font-medium text-gray-600">Public Signals (for verification):</span>
                              <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto max-h-32">
                                {JSON.stringify(zkp.publicSignals, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }
          } catch (e) {
            // Ignore parsing errors for ZKP display
          }
          return null;
        })()}

        {/* Result Metadata */}
        {(jobRequest.resultMetadata || executionResult) && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowResultMetadata(!showResultMetadata)}>
                <div className="flex items-center space-x-2">
                  <span className="text-lg">📊</span>
                  <CardTitle>Result Metadata</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {executionResult?.success ? 'LOADED' : jobRequest.resultMetadata ? 'AVAILABLE' : 'EMPTY'}
                  </Badge>
                </div>
                {showResultMetadata ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {showResultMetadata && (
              <CardContent>
              <div className="space-y-4">
                {(() => {
                  // Use fetched execution result if available
                  if (executionResult && executionResult.success && executionResult.data) {
                    const data = executionResult.data;
                    
                    return (
                      <div className="space-y-4">
                        {/* File Location */}
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                          <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                            <span className="text-purple-500 mr-2">📁</span>
                            Result File Location
                          </h4>
                          <div className="text-sm text-purple-900 font-mono bg-white p-2 rounded border">
                            {executionResult.result_type}: {executionResult.file_path?.replace('/Users/nizzle1994/Developments/WebStorm/Epsilon/epsilon-cordinator/shared_storage/', '')}
                          </div>
                        </div>
                        
                        {/* Execution Summary */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                            <span className="text-blue-500 mr-2">⚡</span>
                            Execution Summary
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {data.execution_type && (
                              <div className="text-sm">
                                <span className="text-blue-700 font-medium">Type:</span>
                                <div className="text-blue-900">{data.execution_type}</div>
                              </div>
                            )}
                            {data.status && (
                              <div className="text-sm">
                                <span className="text-blue-700 font-medium">Status:</span>
                                <div className={`font-semibold ${data.status === 'completed' ? 'text-green-700' : 'text-red-700'}`}>
                                  {data.status}
                                </div>
                              </div>
                            )}
                            {data.execution_time && (
                              <div className="text-sm">
                                <span className="text-blue-700 font-medium">Duration:</span>
                                <div className="text-blue-900">{data.execution_time}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Output */}
                        {data.output && (
                          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <h4 className="font-semibold text-green-800 mb-2 flex items-center">
                              <span className="text-green-500 mr-2">📄</span>
                              Execution Output
                            </h4>
                            <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm">
                              {data.output}
                            </div>
                          </div>
                        )}
                        
                        {/* Logs */}
                        {data.logs && (
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                              <span className="text-gray-500 mr-2">📝</span>
                              Execution Logs
                            </h4>
                            <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm max-h-64 overflow-y-auto">
                              {data.logs}
                            </div>
                          </div>
                        )}
                        
                        {/* Artifacts */}
                        {data.artifacts && Array.isArray(data.artifacts) && data.artifacts.length > 0 && (
                          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                            <h4 className="font-semibold text-orange-800 mb-2 flex items-center">
                              <span className="text-orange-500 mr-2">📎</span>
                              Generated Artifacts
                            </h4>
                            <ul className="space-y-1">
                              {data.artifacts.map((artifact: any, index: number) => (
                                <li key={index} className="text-sm text-orange-900 flex items-center">
                                  <span className="mr-2">•</span>
                                  {typeof artifact === 'string' ? artifact : JSON.stringify(artifact)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Check if resultMetadata is a file path
                  const isFilePath = (str: string) => {
                    return typeof str === 'string' && (str.includes('/') && (str.endsWith('.json') || str.includes('_result')));
                  };
                  
                  // If it's a file path, show the path and try to parse executionOutput instead
                  if (typeof jobRequest.resultMetadata === 'string' && isFilePath(jobRequest.resultMetadata)) {
                    try {
                      // Try to get actual data from executionOutput if it contains JSON
                      let actualData = null;
                      if (jobRequest.executionOutput && jobRequest.executionOutput.trim().startsWith('{')) {
                        actualData = JSON.parse(jobRequest.executionOutput);
                      }
                      
                      return (
                        <div className="space-y-4">
                          {/* Show the file path */}
                          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                            <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                              <span className="text-purple-500 mr-2">📁</span>
                              Result Location
                            </h4>
                            <div className="text-sm text-purple-900 font-mono bg-white p-2 rounded border">
                              {jobRequest.resultMetadata.replace('/shared/epsilon/', '')}
                            </div>
                          </div>
                          
                          {/* Show parsed execution output data if available */}
                          {actualData && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                                <span className="text-blue-500 mr-2">⚡</span>
                                Execution Results
                              </h4>
                              <div className="space-y-2">
                                {actualData.execution_type && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Type:</span>
                                    <span className="ml-2 text-blue-900">{actualData.execution_type}</span>
                                  </div>
                                )}
                                {actualData.status && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Status:</span>
                                    <span className={`ml-2 font-semibold ${actualData.status === 'completed' ? 'text-green-700' : 'text-red-700'}`}>
                                      {actualData.status}
                                    </span>
                                  </div>
                                )}
                                {actualData.execution_time && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Duration:</span>
                                    <span className="ml-2 text-blue-900">{actualData.execution_time}</span>
                                  </div>
                                )}
                                {actualData.output && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Output:</span>
                                    <div className="mt-1 bg-gray-900 text-gray-100 p-2 rounded font-mono text-xs">
                                      {actualData.output}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {!actualData && (
                            <div className="bg-gray-100 p-4 rounded-lg border">
                              <p className="text-sm text-gray-600">Result file path stored. Detailed execution data may be available in the Execution Output section above.</p>
                            </div>
                          )}
                        </div>
                      );
                    } catch (e) {
                      return (
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                          <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                            <span className="text-purple-500 mr-2">📁</span>
                            Result Location
                          </h4>
                          <div className="text-sm text-purple-900 font-mono bg-white p-2 rounded border">
                            {jobRequest.resultMetadata.replace('/shared/epsilon/', '')}
                          </div>
                        </div>
                      );
                    }
                  }
                  
                  // Original parsing logic for JSON data
                  try {
                    const data = typeof jobRequest.resultMetadata === 'string' 
                      ? JSON.parse(jobRequest.resultMetadata) 
                      : jobRequest.resultMetadata;
                    
                    const formatResultMetadata = (metadata: any) => {
                      if (!metadata) return null;
                      
                      return (
                        <div className="space-y-4">
                          {/* Execution Info */}
                          {(metadata.execution_type || metadata.status || metadata.execution_time) && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                                <span className="text-blue-500 mr-2">⚡</span>
                                Execution Summary
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {metadata.execution_type && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Type:</span>
                                    <div className="text-blue-900">{metadata.execution_type}</div>
                                  </div>
                                )}
                                {metadata.status && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Status:</span>
                                    <div className={`font-semibold ${metadata.status === 'completed' ? 'text-green-700' : 'text-red-700'}`}>
                                      {metadata.status}
                                    </div>
                                  </div>
                                )}
                                {metadata.execution_time && (
                                  <div className="text-sm">
                                    <span className="text-blue-700 font-medium">Duration:</span>
                                    <div className="text-blue-900">{metadata.execution_time}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Output Info */}
                          {metadata.output && (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                              <h4 className="font-semibold text-green-800 mb-2 flex items-center">
                                <span className="text-green-500 mr-2">📄</span>
                                Execution Output
                              </h4>
                              <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm">
                                {metadata.output}
                              </div>
                            </div>
                          )}
                          
                          {/* Result Path */}
                          {metadata.result_path && (
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                              <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                                <span className="text-purple-500 mr-2">📁</span>
                                Result Location
                              </h4>
                              <div className="text-sm text-purple-900 font-mono bg-white p-2 rounded border">
                                {metadata.result_path.replace('/shared/epsilon/', '')}
                              </div>
                            </div>
                          )}
                          
                          {/* Other Fields */}
                          {Object.entries(metadata).filter(([key]) => 
                            !['execution_type', 'status', 'execution_time', 'output', 'result_path'].includes(key)
                          ).map(([key, value]) => (
                            <div key={key} className="bg-gray-100 p-3 rounded border">
                              <h5 className="font-medium text-gray-700 mb-1">{key.replace(/_/g, ' ').toUpperCase()}:</h5>
                              <div className="text-sm text-gray-900">
                                {typeof value === 'object' ? (
                                  <pre className="bg-white p-2 rounded text-xs font-mono overflow-x-auto">
                                    {JSON.stringify(value, null, 2)}
                                  </pre>
                                ) : (
                                  String(value)
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    };
                    
                    return formatResultMetadata(data);
                  } catch (e) {
                    return (
                      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <h4 className="font-semibold text-red-800 mb-2">Raw Metadata (Parse Error):</h4>
                        <pre className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm overflow-x-auto">
                          {jobRequest.resultMetadata}
                        </pre>
                      </div>
                    );
                  }
                })()}
              </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Validation Policy */}
        {jobRequest.validationPolicy && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Validation Policy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-blue-50 p-4 rounded-lg">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">
                  {typeof jobRequest.validationPolicy === 'string' 
                    ? jobRequest.validationPolicy 
                    : JSON.stringify(jobRequest.validationPolicy, null, 2)
                  }
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Default Policy */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowDefaultPolicy(!showDefaultPolicy)}>
              <div className="flex items-center space-x-2">
                <span className="text-lg">🔒</span>
                <CardTitle>Default Policy (Simplified)</CardTitle>
                <Badge variant="outline" className="text-xs">
                  HEALTHCARE
                </Badge>
              </div>
              {showDefaultPolicy ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {showDefaultPolicy && (
            <CardContent>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-2">Healthcare Dataset Policy</h4>
                <p className="text-sm text-gray-600 mb-4">This default policy is applied to all healthcare datasets to ensure privacy compliance.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h5 className="font-medium text-gray-700 mb-2 flex items-center">
                      <span className="text-red-500 mr-2">🔒</span>
                      PII Fields Protected
                    </h5>
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-2">
                        {['patient_id', 'patient_name', 'medical_record', 'date_of_birth', 'ssn', 'email', 'phone', 'address'].map((field) => (
                          <span key={field} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {field}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">+ other healthcare identifiers</p>
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h5 className="font-medium text-gray-700 mb-2 flex items-center">
                      <span className="text-blue-500 mr-2">📊</span>
                      Validation Requirements
                    </h5>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm">
                        <span className="text-green-500 mr-2">✓</span>
                        <span className="text-gray-600">Row count must be reported</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="text-green-500 mr-2">✓</span>
                        <span className="text-gray-600">PII detection required</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="text-red-500 mr-2">✗</span>
                        <span className="text-gray-600">Reject if PII detected</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="text-green-500 mr-2">✓</span>
                        <span className="text-gray-600">Approve if no PII found</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> This policy ensures that any code accessing healthcare data cannot expose or output personally identifiable information.
                  </p>
                </div>
              </div>
            </div>
            </CardContent>
          )}
        </Card>

        {/* Code Violations Summary */}
        {(jobRequest.code_violations || (jobRequest.detailed_logs && jobRequest.detailed_logs.some((log: any) => log.worker_name === 'AIAgentWorker' && log.metadata?.pii_details))) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <span className="text-lg mr-2">🔍</span>
                Code Policy Violations Detected
                <Badge variant="destructive" className="ml-2 text-xs">
                  {(jobRequest.code_violations || jobRequest.detailed_logs?.find((log: any) => log.worker_name === 'AIAgentWorker' && log.metadata?.pii_details)?.metadata?.pii_details)?.length || 0} violations
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const violations = jobRequest.code_violations || 
                  jobRequest.detailed_logs?.find((log: any) => log.worker_name === 'AIAgentWorker' && log.metadata?.pii_details)?.metadata?.pii_details || [];
                
                return (
                  <div className="space-y-3">
                    <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800">
                        ⚠️ The AI agent detected code that accesses personally identifiable information (PII) fields, which violates the dataset privacy policy.
                      </p>
                    </div>
                    
                    {violations.map((violation: any, index: number) => (
                      <div key={index} className="bg-white border border-red-300 rounded-lg p-3">
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
                            📁 {violation.file?.replace(/.*\/(repositories\/[^/]+\/)/, '') || 'Unknown file'}
                          </div>
                        </div>
                        <div className="bg-gray-900 text-gray-100 p-3 rounded border font-mono text-sm overflow-x-auto">
                          <div className="flex items-start space-x-3">
                            <span className="text-red-400 font-bold min-w-[3rem] text-right">{violation.line}:</span>
                            <span className="text-yellow-300">{violation.code}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-red-600">
                          ⚠️ This code accesses PII field "{violation.field}" which violates the dataset privacy policy.
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
              }
            </CardContent>
          </Card>
        )}

        {/* AI Analysis Logs */}
        {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAILogs(!showAILogs)}>
                <div className="flex items-center space-x-2">
                  <Bot className="h-5 w-5 text-cyan-600" />
                  <CardTitle>AI Analysis Logs</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {jobRequest.status === 'ai_analyzing' ? 'LIVE' : 
                     (jobRequest.detailed_logs?.some((log: any) => log.worker_name === 'AIAgentWorker') || 
                      jobRequest.ai_logs || jobRequest.aiLogs) ? 'DETAILED' : 'SIMULATED'}
                  </Badge>
                </div>
                {showAILogs ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {showAILogs && (
              <CardContent>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto">
                  {/* Show whether logs are real or simulated */}
                  {!jobRequest.detailed_logs?.some((log: any) => log.worker_name === 'AIAgentWorker') && 
                   !jobRequest.ai_logs && !jobRequest.aiLogs && (
                    <div className="mb-3 p-2 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-300">
                      📊 Simulated logs based on job status - detailed logs may be available in the database
                    </div>
                  )}
                  <div className="space-y-1">
                    {(() => {
                      // Debug info (remove in production)
                      console.log('AI Logs Debug:', {
                        detailed_logs: jobRequest.detailed_logs?.length || 0,
                        ai_logs: jobRequest.ai_logs ? 'present' : 'missing',
                        aiLogs: jobRequest.aiLogs ? 'present' : 'missing',
                        status: jobRequest.status
                      });
                      
                      // Filter AI logs from detailed_logs if available, otherwise use ai_logs
                      const aiLogs = jobRequest.detailed_logs ? 
                        jobRequest.detailed_logs.filter((log: any) => log.worker_name === 'AIAgentWorker')
                        : null;
                      
                      if (aiLogs && aiLogs.length > 0) {
                        console.log('Found AI logs:', aiLogs);
                        return aiLogs.map((log: any, index: number) => {
                          const getLogColor = (level: string) => {
                            switch (level) {
                              case 'SUCCESS': return 'text-green-400';
                              case 'ERROR': return 'text-red-400';
                              case 'WARNING': return 'text-orange-400';
                              case 'DEBUG': return 'text-gray-500';
                              case 'INFO': return 'text-blue-400';
                              default: return 'text-gray-300';
                            }
                          };
                          
                          const formatTimestamp = (timestamp: string | undefined) => {
                            if (!timestamp) return new Date().toLocaleString();
                            const date = new Date(timestamp);
                            return isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString();
                          };
                          
                          const formatAIMetadata = (metadata: any) => {
                            if (!metadata || Object.keys(metadata).length === 0) return null;
                            
                            return (
                              <div className="mt-2 ml-4 space-y-1">
                                {metadata.approved !== undefined && (
                                  <div className={`text-sm font-medium ${metadata.approved ? 'text-green-400' : 'text-red-400'}`}>
                                    {metadata.approved ? '✅ APPROVED' : '❌ REJECTED'}
                                  </div>
                                )}
                                {metadata.confidence_score && (
                                  <div className="text-gray-400 text-sm">
                                    Confidence: {(metadata.confidence_score * 100).toFixed(1)}%
                                  </div>
                                )}
                                {metadata.reasoning && (
                                  <div className="text-gray-300 text-sm">
                                    <div className="font-semibold text-cyan-400">AI Reasoning:</div>
                                    <div className="pl-2 border-l border-cyan-600 mt-1">{metadata.reasoning}</div>
                                  </div>
                                )}
                                {metadata.risks_identified && Array.isArray(metadata.risks_identified) && (
                                  <div className="text-orange-400 text-sm">
                                    <div className="font-semibold">Risks Identified:</div>
                                    <ul className="pl-2 mt-1">
                                      {metadata.risks_identified.map((risk: string, i: number) => (
                                        <li key={i} className="text-orange-300">• {risk}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {metadata.recommendations && Array.isArray(metadata.recommendations) && (
                                  <div className="text-blue-400 text-sm">
                                    <div className="font-semibold">Recommendations:</div>
                                    <ul className="pl-2 mt-1">
                                      {metadata.recommendations.map((rec: string, i: number) => (
                                        <li key={i} className="text-blue-300">• {rec}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {metadata.result_path && (
                                  <div className="text-gray-400 text-sm">
                                    Result Path: {metadata.result_path.replace('/shared/epsilon/', '')}
                                  </div>
                                )}
                                {/* Show other metadata fields */}
                                {Object.entries(metadata).map(([key, value]) => {
                                  if (['approved', 'confidence_score', 'reasoning', 'risks_identified', 'recommendations', 'result_path'].includes(key)) {
                                    return null; // Already handled above
                                  }
                                  return (
                                    <div key={key} className="text-gray-500 text-xs">
                                      {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          };
                          
                          return (
                            <div key={index} className="border-l-2 border-cyan-600 pl-4 py-3">
                              <div className={`${getLogColor(log.level)} font-medium`}>
                                🤖 [{formatTimestamp(log.created_at)}] {log.level?.toUpperCase() || 'INFO'}: {log.message || 'Processing...'}
                              </div>
                              {log.metadata && formatAIMetadata(log.metadata)}
                            </div>
                          );
                        });
                      } else if (jobRequest.ai_logs || jobRequest.aiLogs) {
                        // Fallback to string-based logs - parse JSON lines if possible
                        const logs = jobRequest.ai_logs || jobRequest.aiLogs;
                        if (!logs || logs.trim() === '') {
                          return (
                            <div className="text-gray-400">
                              No AI analysis logs available yet.
                            </div>
                          );
                        }
                        const logLines = logs.split('\n').filter((line: string) => line.trim());
                        
                        return logLines.map((line: string, index: number) => {
                          try {
                            // Try to parse as JSON
                            const logData = JSON.parse(line);
                            const formatTimestamp = (timestamp: string | undefined) => {
                              if (!timestamp) return new Date().toLocaleString();
                              const date = new Date(timestamp);
                              return isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString();
                            };
                            
                            const getLogColor = (level: string) => {
                              switch (level?.toLowerCase()) {
                                case 'success': return 'text-green-400';
                                case 'error': return 'text-red-400';
                                case 'warning': return 'text-orange-400';
                                case 'debug': return 'text-gray-500';
                                case 'info': return 'text-blue-400';
                                default: return 'text-gray-300';
                              }
                            };
                            
                            const formatAIMetadata = (metadata: any) => {
                              if (!metadata || Object.keys(metadata).length === 0) return null;
                              
                              return (
                                <div className="mt-2 ml-4 space-y-1">
                                  {metadata.approved !== undefined && (
                                    <div className={`text-sm font-medium ${metadata.approved ? 'text-green-400' : 'text-red-400'}`}>
                                      {metadata.approved ? '✅ APPROVED' : '❌ REJECTED'}
                                    </div>
                                  )}
                                  {metadata.confidence_score && (
                                    <div className="text-gray-400 text-sm">
                                      Confidence: {(metadata.confidence_score * 100).toFixed(1)}%
                                    </div>
                                  )}
                                  {metadata.reasoning && (
                                    <div className="text-gray-300 text-sm">
                                      <div className="font-semibold text-cyan-400">AI Reasoning:</div>
                                      <div className="pl-2 border-l border-cyan-600 mt-1">{metadata.reasoning}</div>
                                    </div>
                                  )}
                                  {metadata.risks_identified && Array.isArray(metadata.risks_identified) && (
                                    <div className="text-orange-400 text-sm">
                                      <div className="font-semibold">Risks Identified:</div>
                                      <ul className="pl-2 mt-1">
                                        {metadata.risks_identified.map((risk: string, i: number) => (
                                          <li key={i} className="text-orange-300">• {risk}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {metadata.recommendations && Array.isArray(metadata.recommendations) && (
                                    <div className="text-blue-400 text-sm">
                                      <div className="font-semibold">Recommendations:</div>
                                      <ul className="pl-2 mt-1">
                                        {metadata.recommendations.map((rec: string, i: number) => (
                                          <li key={i} className="text-blue-300">• {rec}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {metadata.result_path && (
                                    <div className="text-gray-400 text-sm">
                                      Result Path: {metadata.result_path.replace('/shared/epsilon/', '')}
                                    </div>
                                  )}
                                </div>
                              );
                            };
                            
                            // Check if this is an AI worker log
                            if (logData.worker === 'AIAgentWorker') {
                              return (
                                <div key={index} className="border-l-2 border-cyan-600 pl-4 py-3">
                                  <div className={`${getLogColor(logData.level)} font-medium`}>
                                    🤖 [{formatTimestamp(logData.timestamp)}] {logData.level?.toUpperCase()}: {logData.message}
                                  </div>
                                  {formatAIMetadata(logData.metadata)}
                                </div>
                              );
                            } else {
                              // Non-AI worker logs
                              return (
                                <div key={index} className={`whitespace-pre-wrap ${getLogColor(logData.level)}`}>
                                  [{formatTimestamp(logData.timestamp)}] {logData.level?.toUpperCase()}: {logData.message}
                                </div>
                              );
                            }
                          } catch (e) {
                            // If not JSON, display as plain text with color detection
                            const getLogColor = (logLine: string) => {
                              if (logLine.includes('SUCCESS') || logLine.includes('✅')) return 'text-green-400';
                              if (logLine.includes('ERROR') || logLine.includes('❌')) return 'text-red-400';
                              if (logLine.includes('WARNING')) return 'text-orange-400';
                              if (logLine.includes('INFO:')) return 'text-blue-400';
                              return 'text-gray-300';
                            };
                            
                            return (
                              <div key={index} className={`whitespace-pre-wrap ${getLogColor(line)}`}>
                                {line}
                              </div>
                            );
                          }
                        });
                      } else {
                        // No detailed logs or ai_logs available
                        if (jobRequest.status === 'ai_analyzing') {
                          return (
                            <div className="space-y-2">
                              <div className="text-yellow-300">
                                🤖 [LIVE] INFO: AI agent is currently analyzing job {jobRequest.jobId}...
                              </div>
                              <div className="text-cyan-400">
                                [LIVE] INFO: Checking code for PII access patterns...
                              </div>
                              <div className="text-blue-400">
                                [LIVE] INFO: Running security analysis against dataset policies...
                              </div>
                            </div>
                          );
                        } else if (['ai_approved', 'ai_rejected'].includes(jobRequest.status)) {
                          const currentTime = new Date().toLocaleString();
                          return (
                            <div className="space-y-2">
                              <div className="text-blue-400">
                                🤖 [{currentTime}] INFO: Starting AI security analysis
                              </div>
                              <div className="text-cyan-400">
                                [{currentTime}] INFO: Analyzing code for PII patterns and policy compliance
                              </div>
                              <div className="text-purple-400">
                                [{currentTime}] INFO: Executing code with dummy data for validation
                              </div>
                              <div className={jobRequest.status === 'ai_approved' ? 'text-green-400' : 'text-red-400'}>
                                [{currentTime}] {jobRequest.status === 'ai_approved' ? 'SUCCESS' : 'REJECTED'}: 
                                {jobRequest.status === 'ai_approved' ? '✅ Code approved - no policy violations detected' : '❌ Code rejected - policy violations found'}
                              </div>
                              <div className="text-gray-400">
                                [{currentTime}] INFO: Analysis results saved to database
                              </div>
                              {jobRequest.status === 'ai_rejected' && (
                                <div className="text-orange-400">
                                  [{currentTime}] INFO: Check Code Policy Violations section above for details
                                </div>
                              )}
                            </div>
                          );
                        } else if (['running', 'completed', 'failed'].includes(jobRequest.status)) {
                          const currentTime = new Date().toLocaleString();
                          return (
                            <div className="space-y-2">
                              <div className="text-blue-400">
                                🤖 [{currentTime}] INFO: AI analysis completed successfully
                              </div>
                              <div className="text-green-400">
                                [{currentTime}] SUCCESS: Code passed security review
                              </div>
                              <div className="text-gray-400">
                                [{currentTime}] INFO: Job proceeding to execution phase
                              </div>
                            </div>
                          );
                        } else {
                          return (
                            <div className="space-y-2">
                              <div className="text-gray-400">
                                No detailed AI analysis logs available for this job.
                              </div>
                              <div className="text-gray-500 text-sm">
                                Status: {jobRequest.status}
                              </div>
                              {['completed', 'failed'].includes(jobRequest.status) && (
                                <div className="text-gray-500 text-sm">
                                  Check the AI Analysis Results section below for detailed findings.
                                </div>
                              )}
                            </div>
                          );
                        }
                      }
                    })()}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* AI Analysis Results */}
        {aiAnalysisResult && aiAnalysisResult.success && aiAnalysisResult.data && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAIAnalysisResults(!showAIAnalysisResults)}>
                <div className="flex items-center space-x-2">
                  <Bot className="h-5 w-5 text-cyan-600" />
                  <CardTitle>AI Analysis Results</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {aiAnalysisResult.data.approved ? 'APPROVED' : 'REJECTED'}
                  </Badge>
                </div>
                {showAIAnalysisResults ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {showAIAnalysisResults && (
              <CardContent>
              <div className="space-y-4">
                {/* File Location */}
                <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                  <h4 className="font-semibold text-cyan-800 mb-2 flex items-center">
                    <span className="text-cyan-500 mr-2">📁</span>
                    AI Analysis File Location
                  </h4>
                  <div className="text-sm text-cyan-900 font-mono bg-white p-2 rounded border">
                    {aiAnalysisResult.file_path?.replace('/Users/nizzle1994/Developments/WebStorm/Epsilon/epsilon-cordinator/shared_storage/', '')}
                  </div>
                </div>

                {/* Analysis Decision */}
                <div className={`p-4 rounded-lg border ${aiAnalysisResult.data.approved 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'}`}>
                  <h4 className={`font-semibold mb-2 flex items-center ${aiAnalysisResult.data.approved 
                    ? 'text-green-800' 
                    : 'text-red-800'}`}>
                    <span className={`mr-2 ${aiAnalysisResult.data.approved ? 'text-green-500' : 'text-red-500'}`}>
                      {aiAnalysisResult.data.approved ? '✅' : '❌'}
                    </span>
                    Analysis Decision
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="text-sm">
                      <span className={`font-medium ${aiAnalysisResult.data.approved ? 'text-green-700' : 'text-red-700'}`}>
                        Status:
                      </span>
                      <div className={`font-semibold ${aiAnalysisResult.data.approved ? 'text-green-900' : 'text-red-900'}`}>
                        {aiAnalysisResult.data.approved ? 'APPROVED' : 'REJECTED'}
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className={`font-medium ${aiAnalysisResult.data.approved ? 'text-green-700' : 'text-red-700'}`}>
                        Confidence:
                      </span>
                      <div className={`font-semibold ${aiAnalysisResult.data.approved ? 'text-green-900' : 'text-red-900'}`}>
                        {(aiAnalysisResult.data.confidence_score * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Reasoning */}
                {aiAnalysisResult.data.reasoning && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                      <span className="text-blue-500 mr-2">🤖</span>
                      AI Reasoning
                    </h4>
                    <div className="text-sm text-blue-900 leading-relaxed bg-white p-3 rounded border">
                      {aiAnalysisResult.data.reasoning}
                    </div>
                  </div>
                )}

                {/* Code Violations */}
                {aiAnalysisResult.data.pii_details && aiAnalysisResult.data.pii_details.length > 0 && (
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <h4 className="font-semibold text-red-800 mb-3 flex items-center">
                      <span className="text-red-500 mr-2">🔍</span>
                      Code Policy Violations
                      <span className="ml-2 px-2 py-1 text-xs bg-red-200 text-red-800 rounded">
                        {aiAnalysisResult.data.pii_details.length} found
                      </span>
                    </h4>
                    <div className="space-y-3">
                      {aiAnalysisResult.data.pii_details.map((violation: any, index: number) => (
                        <div key={index} className="bg-white border border-red-300 rounded-lg overflow-hidden">
                          {/* Header */}
                          <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-2">
                                  <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                  <span className="text-sm font-semibold text-red-800">
                                    {violation.type?.replace('_', ' ')?.toUpperCase() || 'PII VIOLATION'}
                                  </span>
                                </div>
                                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
                                  {violation.field}
                                </span>
                              </div>
                              <div className="text-sm text-red-600 font-mono">
                                Line {violation.line}
                              </div>
                            </div>
                            <div className="mt-2 flex items-center text-sm text-red-700">
                              📁 <span className="ml-1 font-mono">{violation.file?.replace(/.*\/(repositories\/[^/]+\/)/, '') || 'Unknown file'}</span>
                            </div>
                          </div>

                          {/* Code Snippet */}
                          <div className="bg-gray-900 text-gray-100">
                            {/* File header bar */}
                            <div className="bg-gray-800 px-4 py-2 text-xs text-gray-300 border-b border-gray-700 flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="flex space-x-1">
                                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                </div>
                                <span className="font-mono text-gray-400">{violation.file?.split('/').pop() || 'script.py'}</span>
                              </div>
                              <button 
                                onClick={() => navigator.clipboard.writeText(violation.code)}
                                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                              >
                                Copy
                              </button>
                            </div>
                            
                            {/* Code content with context lines */}
                            <div className="p-4 font-mono text-sm">
                              {/* Context line above (simulated) */}
                              <div className="flex items-start space-x-4 text-gray-500">
                                <span className="text-right min-w-[2.5rem] select-none">{violation.line - 1}:</span>
                                <span className="text-gray-600"># ... (context)</span>
                              </div>
                              
                              {/* Actual violation line */}
                              <div className="flex items-start space-x-4 bg-red-900/30 -mx-4 px-4 py-1 border-l-4 border-red-500">
                                <span className="text-right min-w-[2.5rem] text-red-400 font-bold select-none">{violation.line}:</span>
                                <span className="text-yellow-300">
                                  {(() => {
                                    const code = violation.code;
                                    const field = violation.field;
                                    
                                    // Simple syntax highlighting for the PII field
                                    if (code.includes(field)) {
                                      const parts = code.split(field);
                                      return (
                                        <>
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
                                        </>
                                      );
                                    }
                                    return code;
                                  })()}
                                </span>
                              </div>
                              
                              {/* Context line below (simulated) */}
                              <div className="flex items-start space-x-4 text-gray-500">
                                <span className="text-right min-w-[2.5rem] select-none">{violation.line + 1}:</span>
                                <span className="text-gray-600"># ... (context)</span>
                              </div>
                            </div>
                          </div>

                          {/* Violation explanation */}
                          <div className="bg-red-50 px-4 py-3 border-t border-red-200">
                            <div className="flex items-start space-x-2">
                              <span className="text-red-500 mt-0.5">⚠️</span>
                              <div className="text-sm text-red-700">
                                <span className="font-semibold">Policy Violation:</span> This code accesses the PII field 
                                <span className="font-mono bg-red-100 px-1 rounded">{violation.field}</span> which is prohibited by the dataset privacy policy.
                                {violation.type === 'print_statement' && (
                                  <span className="block mt-1 text-red-600">
                                    <strong>Risk:</strong> This could expose sensitive data in logs or console output.
                                  </span>
                                )}
                                {violation.type === 'dictionary_access' && (
                                  <span className="block mt-1 text-red-600">
                                    <strong>Risk:</strong> Direct access to PII data from dataset.
                                  </span>
                                )}
                                {violation.type === 'attribute_access' && (
                                  <span className="block mt-1 text-red-600">
                                    <strong>Risk:</strong> Object attribute access to PII field.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risks Identified */}
                {aiAnalysisResult.data.risks_identified && aiAnalysisResult.data.risks_identified.length > 0 && (
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                    <h4 className="font-semibold text-orange-800 mb-2 flex items-center">
                      <span className="text-orange-500 mr-2">⚠️</span>
                      Risks Identified
                    </h4>
                    <ul className="space-y-1">
                      {aiAnalysisResult.data.risks_identified.map((risk: string, index: number) => (
                        <li key={index} className="text-sm text-orange-900 flex items-start">
                          <span className="mr-2 mt-0.5">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {aiAnalysisResult.data.recommendations && aiAnalysisResult.data.recommendations.length > 0 && (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                      <span className="text-purple-500 mr-2">💡</span>
                      Recommendations
                    </h4>
                    <ul className="space-y-1">
                      {aiAnalysisResult.data.recommendations.map((rec: string, index: number) => (
                        <li key={index} className="text-sm text-purple-900 flex items-start">
                          <span className="mr-2 mt-0.5">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Analysis Metadata */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                    <span className="text-gray-500 mr-2">📊</span>
                    Analysis Metadata
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {aiAnalysisResult.data.timestamp && (
                      <div>
                        <span className="text-gray-700 font-medium">Timestamp:</span>
                        <div className="text-gray-900">
                          {new Date(aiAnalysisResult.data.timestamp).toLocaleString()}
                        </div>
                      </div>
                    )}
                    {aiAnalysisResult.data.analysis_version && (
                      <div>
                        <span className="text-gray-700 font-medium">Version:</span>
                        <div className="text-gray-900">{aiAnalysisResult.data.analysis_version}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Job Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowJobTimeline(!showJobTimeline)}>
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <CardTitle>Job Timeline</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {(jobRequest.detailed_logs && jobRequest.detailed_logs.length > 0) ? 'DETAILED' : 'BASIC'}
                </Badge>
              </div>
              {showJobTimeline ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {showJobTimeline && (
            <CardContent>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="space-y-1">
                {(jobRequest.detailed_logs && jobRequest.detailed_logs.length > 0) || (jobRequest.logs_summary && jobRequest.logs_summary.length > 0) ? (
                  jobRequest.detailed_logs.map((log: any, index: number) => {
                    const getStepColor = (stepType: string, level: string) => {
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
                    };
                    
                    const formatTimestamp = (timestamp: string) => {
                      return new Date(timestamp).toLocaleString();
                    };
                    
                    const formatMetadata = (metadata: any) => {
                      if (!metadata || Object.keys(metadata).length === 0) return null;
                      
                      // Format specific metadata fields in a user-friendly way
                      const formatValue = (key: string, value: any) => {
                        switch (key) {
                          case 'repo_url':
                            return `Repository: ${value.replace('https://github.com/', '')}`;
                          case 'commit_sha':
                            return `Commit: ${value?.substring(0, 7)}`;
                          case 'repo_path':
                            return `Local Path: ${value?.replace('/shared/epsilon/', '')}`;
                          case 'files_count':
                            return `Files: ${value}`;
                          case 'size_mb':
                            return `Size: ${value}MB`;
                          case 'confidence_score':
                            return `Confidence: ${(value * 100).toFixed(1)}%`;
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
                      };
                      
                      return Object.entries(metadata).map(([key, value]) => (
                        <div key={key} className="text-gray-400 ml-4 text-xs">
                          {formatValue(key, value)}
                        </div>
                      ));
                    };
                    
                    const getWorkerEmoji = (workerName: string) => {
                      switch (workerName) {
                        case 'CloneWorker': return '🔄';
                        case 'AIAgentWorker': return '🤖';
                        case 'ExecuteWorker': return '⚡';
                        default: return '📝';
                      }
                    };
                    
                    return (
                      <div key={index} className="border-l-2 border-gray-600 pl-4 py-2">
                        <div className={`${getStepColor(log.step_type, log.level)} font-medium`}>
                          {getWorkerEmoji(log.worker_name)} [{formatTimestamp(log.created_at)}] {log.level}: {log.message}
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2">
                            {formatMetadata(log.metadata)}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="space-y-1">
                    <div className="text-blue-400">
                      [{new Date(jobRequest.createdAt).toLocaleString()}] INFO: Job {jobRequest.jobId} created and queued
                    </div>
                    <div className="text-gray-300">
                      [{new Date(jobRequest.createdAt).toLocaleString()}] INFO: Repository: {jobRequest.commitSha?.substring(0, 7)} - {jobRequest.commitMessage}
                    </div>
                    {/* AI Analysis Timeline */}
                    {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) && (
                      <>
                        <div className="text-cyan-400">
                          [{new Date(jobRequest.createdAt).toLocaleString()}] INFO: 🤖 AI Pre-Execution Analysis started
                        </div>
                        {jobRequest.status === 'ai_analyzing' ? (
                          <div className="text-cyan-300">
                            [LIVE] INFO: AI agent analyzing code against dataset policies...
                          </div>
                        ) : jobRequest.status === 'ai_rejected' ? (
                          <div className="text-red-400">
                            [{new Date(jobRequest.updatedAt || jobRequest.createdAt).toLocaleString()}] ERROR: ❌ AI Pre-Execution Analysis REJECTED execution
                          </div>
                        ) : (
                          <div className="text-green-400">
                            [{new Date(jobRequest.updatedAt || jobRequest.createdAt).toLocaleString()}] SUCCESS: ✅ AI Pre-Execution Analysis APPROVED execution
                          </div>
                        )}
                      </>
                    )}
                    {jobRequest.startedAt && (
                      <div className="text-yellow-400">
                        [{new Date(jobRequest.startedAt).toLocaleString()}] INFO: Job execution started by {jobRequest.executionMethod || 'job-runner'}
                      </div>
                    )}
                    {jobRequest.status === "completed" && jobRequest.completedAt && (
                      <>
                        <div className="text-green-400">
                          [{new Date(jobRequest.completedAt).toLocaleString()}] SUCCESS: Job completed successfully
                        </div>
                        <div className="text-gray-300">
                          [{new Date(jobRequest.completedAt).toLocaleString()}] INFO: Exit code: {jobRequest.exitCode || 0}
                        </div>
                        <div className="text-gray-300">
                          [{new Date(jobRequest.completedAt).toLocaleString()}] INFO: Duration: {formatDuration(jobRequest.durationSeconds)}
                        </div>
                        {jobRequest.resultMetadata && (
                          <>
                            <div className="text-blue-400">
                              [{new Date(jobRequest.completedAt).toLocaleString()}] INFO: Result metadata generated
                            </div>
                            {(() => {
                              try {
                                const metadata = typeof jobRequest.resultMetadata === 'string' 
                                  ? JSON.parse(jobRequest.resultMetadata) 
                                  : jobRequest.resultMetadata;
                                if (metadata.ai_pre_execution_analysis) {
                                  const aiAnalysis = metadata.ai_pre_execution_analysis;
                                  return (
                                    <div className="text-cyan-300">
                                      [{new Date(jobRequest.completedAt).toLocaleString()}] INFO: 🤖 AI Analysis: {aiAnalysis.decision} (confidence: {aiAnalysis.confidence_score || 'N/A'})
                                    </div>
                                  );
                                }
                              } catch (e) {
                                // Ignore parsing errors
                              }
                              return null;
                            })()}
                          </>
                        )}
                      </>
                    )}
                    {jobRequest.status === "failed" && jobRequest.completedAt && (
                      <>
                        <div className="text-red-400">
                          [{new Date(jobRequest.completedAt).toLocaleString()}] ERROR: Job execution failed
                        </div>
                        {jobRequest.exitCode && (
                          <div className="text-gray-300">
                            [{new Date(jobRequest.completedAt).toLocaleString()}] INFO: Exit code: {jobRequest.exitCode}
                          </div>
                        )}
                        {jobRequest.errorMessage && (
                          <div className="text-red-300">
                            [{new Date(jobRequest.completedAt).toLocaleString()}] ERROR: {jobRequest.errorMessage}
                          </div>
                        )}
                      </>
                    )}
                    {jobRequest.status === "running" && (
                      <div className="text-yellow-400">
                        [LIVE] INFO: Job is currently executing...
                      </div>
                    )}
                    {jobRequest.status === "pending" && (
                      <div className="text-gray-400">
                        [PENDING] INFO: Job is waiting to be picked up by job-runner
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
