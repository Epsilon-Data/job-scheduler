import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { Link } from "wouter";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getJobStatusColor } from "@/lib/status-utils";
import type { JobRequest } from "@shared/schema";
import type { AIAnalysisResult } from "@/types/job";

// Import all job detail components
import {
  JobOverviewCards,
  CommitInfoCard,
  JobProgressCard,
  ErrorDetailsCard,
  ExecutionOutputCard,
  ZKPCard,
  ResultMetadataCard,
  CodeViolationsCard,
  AIAnalysisLogsCard,
  AIAnalysisResultsCard,
  JobTimelineCard,
  DefaultPolicyCard,
} from "@/components/job-detail";

interface JobRequestDetailProps {
  params: {
    id: string;
  };
}

export default function JobRequestDetail({ params }: JobRequestDetailProps) {
  const { user } = useAuth();

  // params.id should be jobId format (JOB-XXXXX), not database UUID
  const jobId = params.id;
  const { data: jobRequest, isLoading, error } = useQuery<JobRequest>({
    queryKey: [`/api/jobs/${jobId}`],
    enabled: user?.approvalStatus === "approved",
  });

  // Feature flags from database (set at job creation based on backend env)
  const aiEnabled = jobRequest?.ai_enabled ?? jobRequest?.aiEnabled ?? false;
  const zkpEnabled = jobRequest?.zkp_enabled ?? jobRequest?.zkpEnabled ?? false;

  if (isLoading) {
    return <LoadingSpinner message="Loading job details..." />;
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

  if (!jobRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Job request not found</h2>
          <p className="text-muted-foreground">
            The job request you're looking for doesn't exist or you don't have access to it.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Job ID: {params.id}</p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Breadcrumb */}
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
              <Badge className={getJobStatusColor(jobRequest.status)}>
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

        {/* Job Overview Cards */}
        <JobOverviewCards jobRequest={jobRequest} />

        {/* Commit Information */}
        <CommitInfoCard jobRequest={jobRequest} />

        {/* Job Progress */}
        <JobProgressCard jobRequest={jobRequest} />

        {/* Error Details (if any) */}
        <ErrorDetailsCard jobRequest={jobRequest} />

        {/* Execution Output - displays raw stdout from execution_output field */}
        <ExecutionOutputCard jobRequest={jobRequest} />

        {/* ZKP Information - only show if ZKP was enabled for this job */}
        {zkpEnabled && <ZKPCard jobRequest={jobRequest} />}

        {/* Result Metadata - displays parsed result_metadata JSON */}
        <ResultMetadataCard jobRequest={jobRequest} />

        {/* Validation Policy (if exists) */}
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
                    : JSON.stringify(jobRequest.validationPolicy, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Default Policy */}
        <DefaultPolicyCard />

        {/* AI Sections - only show if AI was enabled for this job */}
        {aiEnabled && (
          <>
            {/* Code Violations */}
            <CodeViolationsCard jobRequest={jobRequest} />

            {/* AI Analysis Logs */}
            <AIAnalysisLogsCard jobRequest={jobRequest} />
          </>
        )}

        {/* Job Timeline */}
        <JobTimelineCard jobRequest={jobRequest} />
      </div>
    </div>
  );
}
