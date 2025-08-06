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

  const { data: jobRequest, isLoading, error } = useQuery<JobRequest>({
    queryKey: [`/api/jobs/${params.id}`],
    enabled: user?.approvalStatus === "approved",
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
                {formatDuration(jobRequest.durationSeconds)}
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
                {jobRequest.completedAt ? formatDateTime(jobRequest.completedAt) : "-"}
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
              <CardTitle>Execution Output</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                <pre className="whitespace-pre-wrap">{jobRequest.executionOutput}</pre>
              </div>
            </CardContent>
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
        {jobRequest.resultMetadata && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Result Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                <pre className="whitespace-pre-wrap text-gray-100">
                  {(() => {
                    try {
                      const data = typeof jobRequest.resultMetadata === 'string' 
                        ? JSON.parse(jobRequest.resultMetadata) 
                        : jobRequest.resultMetadata;
                      return JSON.stringify(data, null, 2);
                    } catch (e) {
                      return jobRequest.resultMetadata;
                    }
                  })()}
                </pre>
              </div>
            </CardContent>
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
            <CardTitle>Default Policy (Simplified)</CardTitle>
          </CardHeader>
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
        </Card>

        {/* AI Analysis Logs */}
        {['ai_analyzing', 'ai_approved', 'ai_rejected', 'running', 'completed', 'failed'].includes(jobRequest.status) && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAILogs(!showAILogs)}>
                <div className="flex items-center space-x-2">
                  <Bot className="h-5 w-5 text-cyan-600" />
                  <CardTitle>AI Analysis Logs</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {jobRequest.status === 'ai_analyzing' ? 'LIVE' : 'COMPLETED'}
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
                  <div className="space-y-1">
                    {jobRequest.aiLogs ? (
                      jobRequest.aiLogs.split('\n').map((line, index) => {
                        const getLogColor = (logLine: string) => {
                          if (logLine.includes('SUCCESS') || logLine.includes('✅')) return 'text-green-400';
                          if (logLine.includes('ERROR') || logLine.includes('❌')) return 'text-red-400';
                          if (logLine.includes('CREW:')) return 'text-purple-400';
                          if (logLine.includes('WARNING')) return 'text-orange-400';
                          if (logLine.includes('DEBUG')) return 'text-gray-500';
                          if (logLine.includes('🤖') || logLine.includes('🔍')) return 'text-cyan-400';
                          if (logLine.includes('🚀') || logLine.includes('Agent:')) return 'text-yellow-400';
                          if (logLine.includes('🔧') || logLine.includes('tool')) return 'text-cyan-300';
                          if (logLine.includes('INFO:')) return 'text-blue-400';
                          return 'text-gray-300';
                        };
                        
                        return (
                          <div key={index} className={`whitespace-pre-wrap ${getLogColor(line)}`}>
                            {line}
                          </div>
                        );
                      })
                    ) : jobRequest.status === 'ai_analyzing' ? (
                      <div className="text-yellow-300">
                        [LIVE] INFO: AI agent is currently analyzing job {jobRequest.jobId}...
                      </div>
                    ) : (
                      <div className="text-gray-400">
                        No AI analysis logs available for this job.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Job Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Job Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="space-y-1">
                {jobRequest.logs ? (
                  jobRequest.logs.split('\n').map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap">
                      {line}
                    </div>
                  ))
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
        </Card>
      </div>
    </div>
  );
}
