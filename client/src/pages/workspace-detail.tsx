import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings, Github, GitBranch, GitCommit, Eye, Download, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getJobStatusColor } from "@/lib/status-utils";
import { formatDateTimeShort, formatDuration } from "@/lib/date-utils";
import type { Workspace, JobRequest } from "@shared/schema";
import { useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface WorkspaceDetailProps {
  params: {
    id: string;
  };
}

interface GitHubCommit {
  sha?: string;
  message?: string;
  commit?: {
    sha?: string;
    message?: string;
  };
}

export default function WorkspaceDetail({ params }: WorkspaceDetailProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: workspace, isLoading } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${params.id}`],
    enabled: user?.approvalStatus === "approved",
  });

  const { data: jobRequests = [] } = useQuery<JobRequest[]>({
    queryKey: [`/api/workspaces/${params.id}/jobs`],
    enabled: !!workspace,
  });

  const { data: latestCommit } = useQuery<GitHubCommit>({
    queryKey: [`/api/github/repos/${workspace?.githubRepo}/commits/${workspace?.githubBranch}`],
    enabled: !!workspace?.githubRepo && !!workspace?.githubBranch,
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/workspaces/${params.id}/jobs`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Job request created",
        description: "Your job request has been submitted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${params.id}/jobs`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <LoadingSpinner message="Loading workspace..." />;
  }

  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Workspace not found</h2>
          <p className="text-muted-foreground">The workspace you're looking for doesn't exist or you don't have access to it.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <Link href="/dashboard" className="hover:text-primary">
              Dashboard
            </Link>
            <span>{">"}</span>
            <span>Workspaces</span>
            <span>{">"}</span>
            <span className="text-foreground">{workspace.name}</span>
          </nav>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{workspace.name}</h1>
              <p className="mt-2 text-muted-foreground">{workspace.description}</p>
            </div>
            <div className="flex space-x-3">
              <Link href={`/workspaces/${params.id}/jobs/new`}>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Job Request
                </Button>
              </Link>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Workspace Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Repository</h3>
              <div className="flex items-center">
                <Github className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{workspace.githubRepo}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Branch</h3>
              <div className="flex items-center">
                <GitBranch className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{workspace.githubBranch}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Last Commit</h3>
              <div className="flex items-center">
                <GitCommit className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {latestCommit?.sha?.substring(0, 7) || latestCommit?.commit?.sha?.substring(0, 7) || "Loading..."}
                </span>
              </div>
              {latestCommit && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {latestCommit.message || latestCommit.commit?.message || "No message"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Job Requests */}
        <Card>
          <CardHeader>
            <CardTitle>Job Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {jobRequests.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No job requests yet.</p>
                <Link href={`/workspaces/${params.id}/jobs/new`}>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Job Request
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                          Job ID
                        </th>
                        <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                          Commit
                        </th>
                        <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                          Submitted
                        </th>
                        <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                          Duration
                        </th>
                        <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobRequests
                        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                        .map((job) => (
                      <tr key={job.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-4 px-6">
                          <div className="text-sm font-medium text-foreground">{job.jobId}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center">
                            <span className="text-sm font-mono text-muted-foreground">
                              {job.commitSha?.substring(0, 7)}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {job.commitMessage?.substring(0, 50)}...
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-muted-foreground">
                          {formatDateTimeShort(job.createdAt)}
                        </td>
                        <td className="py-4 px-6 text-sm text-muted-foreground">
                          {formatDuration(job.durationSeconds)}
                        </td>
                        <td className="py-4 px-6">
                          <Badge className={getJobStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex space-x-2">
                            <Link href={`/jobs/${job.jobId}`}>
                              <Button size="sm" variant="ghost">
                                <Eye className="mr-1 h-3 w-3" />
                                View Details
                              </Button>
                            </Link>
                            {job.status === "completed" && (
                              <Button size="sm" variant="ghost">
                                <Download className="mr-1 h-3 w-3" />
                                Download
                              </Button>
                            )}
                            {(job.status === "running" || job.status === "queued") && (
                              <Button size="sm" variant="ghost">
                                <X className="mr-1 h-3 w-3" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {jobRequests.length > itemsPerPage && (
                <div className="mt-4 flex justify-center">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: Math.ceil(jobRequests.length / itemsPerPage) }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(prev => Math.min(Math.ceil(jobRequests.length / itemsPerPage), prev + 1))}
                          className={currentPage === Math.ceil(jobRequests.length / itemsPerPage) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
