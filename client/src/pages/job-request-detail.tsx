import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, GitCommit, User, Clock, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import type { JobRequest } from "@shared/schema";

interface JobRequestDetailProps {
  params: {
    id: string;
  };
}

export default function JobRequestDetail({ params }: JobRequestDetailProps) {
  const { user } = useAuth();

  const { data: jobRequest, isLoading } = useQuery<JobRequest>({
    queryKey: ["/api/jobs", params.id],
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

  if (!jobRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Job request not found</h2>
          <p className="text-muted-foreground">The job request you're looking for doesn't exist or you don't have access to it.</p>
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
      case "queued":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
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
                {new Date(jobRequest.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Completed</h3>
              <p className="text-lg font-semibold text-foreground">
                {jobRequest.completedAt ? new Date(jobRequest.completedAt).toLocaleDateString() : "-"}
              </p>
            </CardContent>
          </Card>
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
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Repository Clone</span>
                    <span className="text-sm text-muted-foreground">Completed</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Successfully cloned repository and checked out commit {jobRequest.commitSha?.substring(0, 7)}
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Environment Setup</span>
                    <span className="text-sm text-muted-foreground">Completed</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Environment configured with required dependencies
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Code Execution</span>
                    <span className="text-sm text-muted-foreground">Completed</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Job executed successfully with exit code {jobRequest.exitCode || 0}
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Results Processing</span>
                    <span className="text-sm text-muted-foreground">Completed</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Output files generated and stored securely
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Job Logs</CardTitle>
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
                    <div className="text-green-400">
                      [{new Date(jobRequest.createdAt).toLocaleString()}] INFO: Starting job execution
                    </div>
                    <div className="text-blue-400">
                      [{new Date(jobRequest.createdAt).toLocaleString()}] INFO: Job {jobRequest.jobId} initialized
                    </div>
                    <div className="text-gray-300">
                      [{new Date(jobRequest.createdAt).toLocaleString()}] INFO: Processing commit {jobRequest.commitSha?.substring(0, 7)}
                    </div>
                    {jobRequest.status === "completed" && (
                      <div className="text-green-400">
                        [{jobRequest.completedAt ? new Date(jobRequest.completedAt).toLocaleString() : ""}] INFO: Job completed successfully
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
