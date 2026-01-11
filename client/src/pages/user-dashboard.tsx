import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, Play, Clock, Plus, Github, GitBranch, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getJobStatusColor, getJobStatusDotColor } from "@/lib/status-utils";
import { formatDate } from "@/lib/date-utils";
import type { Workspace, JobRequest, PaginatedJobsResponse } from "@shared/schema";

// Extended workspace type with job statistics (matches server response)
interface WorkspaceWithJobCounts extends Workspace {
  jobCounts: {
    total: number;
    completed: number;
    running: number;
    failed: number;
    pending: number;
  };
}

// Job request with workspace details (matches server response)
interface JobRequestWithWorkspace extends JobRequest {
  workspace: {
    id: string;
    name: string;
    githubRepo: string;
    githubBranch: string;
  } | null;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [jobsPage, setJobsPage] = useState(1);
  const jobsLimit = 10;

  const { data: workspaces = [], isLoading } = useQuery<WorkspaceWithJobCounts[]>({
    queryKey: ["/api/workspaces"],
    enabled: user?.approvalStatus === "approved",
  });

  const { data: jobsResponse, isLoading: isLoadingJobs } = useQuery<PaginatedJobsResponse<JobRequestWithWorkspace>>({
    queryKey: ["/api/user/jobs", { page: jobsPage, limit: jobsLimit }],
    enabled: user?.approvalStatus === "approved",
  });

  const jobRequests = jobsResponse?.data ?? [];
  const pagination = jobsResponse?.pagination;
  const jobStats = jobsResponse?.stats;

  if (user?.approvalStatus !== "approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              {user?.approvalStatus === "pending" ? "Approval Pending" : "Access Denied"}
            </h2>
            <p className="text-muted-foreground">
              {user?.approvalStatus === "pending"
                ? "Your access request is being reviewed by our staff."
                : "Your access request has been denied. Please contact support for more information."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pageInfo = useMemo(() => {
    if (location === "/workspaces") {
      return { title: "Workspaces", description: "Manage your research workspaces and repository connections." };
    }
    if (location === "/jobs") {
      return { title: "Job Requests", description: "View and manage your computational job requests." };
    }
    return { title: "Dashboard", description: `Welcome back, ${user?.fullName || user?.username}! Here's what's happening with your research.` };
  }, [location, user?.fullName, user?.username]);

  if (isLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }



  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{pageInfo.title}</h1>
          <p className="mt-2 text-muted-foreground">{pageInfo.description}</p>
        </div>

        {/* Quick Stats - Show only on Dashboard */}
        {location === "/dashboard" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Folder className="h-5 w-5 text-primary" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-foreground">{workspaces.length}</h3>
                    <p className="text-sm text-muted-foreground">Active Workspaces</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Play className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-foreground">{jobStats?.completed ?? 0}</h3>
                    <p className="text-sm text-muted-foreground">Completed Jobs</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-foreground">{(jobStats?.queued ?? 0) + (jobStats?.running ?? 0)}</h3>
                    <p className="text-sm text-muted-foreground">Jobs Running</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Workspaces Section */}
        {(location === "/dashboard" || location === "/workspaces") && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{location === "/workspaces" ? "All Workspaces" : "My Workspaces"}</CardTitle>
                <Link href="/workspaces/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Workspace
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
            {workspaces.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">You haven't created any workspaces yet.</p>
                <Link href="/workspaces/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Workspace
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workspaces.map((workspace) => (
                  <Card key={workspace.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-foreground">{workspace.name}</h3>
                        <Badge variant={workspace.status === "active" ? "default" : "secondary"}>
                          {workspace.status}
                        </Badge>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Github className="mr-2 h-4 w-4" />
                          <span>{workspace.githubRepo}</span>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <GitBranch className="mr-2 h-4 w-4" />
                          <span>{workspace.githubBranch}</span>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Calendar className="mr-2 h-4 w-4" />
                          <span>Created {formatDate(workspace.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-green-600">{workspace.jobCounts?.completed || 0} completed</span>
                          {(workspace.jobCounts?.running || 0) > 0 && (
                            <span className="text-blue-600">• {workspace.jobCounts.running} running</span>
                          )}
                          {(workspace.jobCounts?.failed || 0) > 0 && (
                            <span className="text-red-600">• {workspace.jobCounts.failed} failed</span>
                          )}
                        </div>
                        <Link href={`/workspaces/${workspace.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        )}

        {/* Job Requests Section */}
        {(location === "/dashboard" || location === "/jobs") && (
          <Card className="mt-8">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>
                  {location === "/jobs" ? "All Job Requests" : "Recent Job Requests"}
                  {pagination && location === "/jobs" && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({pagination.total} total)
                    </span>
                  )}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingJobs ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner message="Loading jobs..." />
                </div>
              ) : jobRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No job requests yet.</p>
                  <p className="text-sm text-muted-foreground">Create a workspace first, then submit job requests.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(location === "/jobs" ? jobRequests : jobRequests.slice(0, 5)).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-sm transition-shadow">
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${getJobStatusDotColor(job.status)}`} />
                        <div>
                          <p className="font-medium">{job.commitMessage || "Job Request"}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{job.commitSha?.substring(0, 7)}</span>
                            <span>•</span>
                            <span>{formatDate(job.createdAt)}</span>
                            {job.workspace && (
                              <>
                                <span>•</span>
                                <Link href={`/workspaces/${job.workspace.id}`} className="flex items-center gap-1 hover:text-foreground">
                                  <Folder className="h-3 w-3" />
                                  <span>{job.workspace.name}</span>
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge className={getJobStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                        <Link href={`/jobs/${job.jobId}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                      </div>
                    </div>
                  ))}

                  {/* Pagination Controls - Only on /jobs page */}
                  {location === "/jobs" && pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                        {pagination.total} jobs
                      </p>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setJobsPage(p => Math.max(1, p - 1))}
                          disabled={pagination.page <= 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setJobsPage(p => p + 1)}
                          disabled={!pagination.hasMore}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Link to all jobs - Only on dashboard */}
                  {location === "/dashboard" && pagination && pagination.total > 5 && (
                    <div className="text-center pt-4">
                      <Link href="/jobs">
                        <Button variant="outline">View All {pagination.total} Job Requests</Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
