import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, Play, Clock, Plus, Github, GitBranch, Calendar } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Workspace, JobRequest } from "@shared/schema";

export default function UserDashboard() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
    enabled: user?.approvalStatus === "approved",
  });

  const { data: jobRequests = [] } = useQuery<JobRequest[]>({
    queryKey: ["/api/user/jobs"],
    enabled: user?.approvalStatus === "approved",
  });

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

  const getPageTitle = () => {
    if (location === "/workspaces") return "Workspaces";
    if (location === "/jobs") return "Job Requests";
    return "Dashboard";
  };

  const getPageDescription = () => {
    if (location === "/workspaces") return "Manage your research workspaces and repository connections.";
    if (location === "/jobs") return "View and manage your computational job requests.";
    return `Welcome back, ${user.name}! Here's what's happening with your research.`;
  };

  const completedJobs = jobRequests.filter(job => job.status === "completed").length;
  const runningJobs = jobRequests.filter(job => job.status === "running").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{getPageTitle()}</h1>
          <p className="mt-2 text-muted-foreground">{getPageDescription()}</p>
        </div>

        {/* Quick Stats */}
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
                  <Play className="h-5 w-5 text-success" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-foreground">{completedJobs}</h3>
                  <p className="text-sm text-muted-foreground">Jobs Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-foreground">{runningJobs}</h3>
                  <p className="text-sm text-muted-foreground">Jobs Running</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
                          <span>Created {new Date(workspace.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          {/* TODO: Add job count */}
                          0 jobs completed
                        </span>
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
                <CardTitle>{location === "/jobs" ? "All Job Requests" : "Recent Job Requests"}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {jobRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No job requests yet.</p>
                  <p className="text-sm text-muted-foreground">Create a workspace first, then submit job requests.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(location === "/jobs" ? jobRequests : jobRequests.slice(0, 5)).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-sm transition-shadow">
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${
                          job.status === "completed" ? "bg-green-500" :
                          job.status === "running" ? "bg-blue-500" :
                          job.status === "failed" ? "bg-red-500" : "bg-yellow-500"
                        }`}></div>
                        <div>
                          <p className="font-medium">{job.commitMessage}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.commitSha?.substring(0, 7)} • {new Date(job.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge className={`${
                          job.status === "completed" ? "bg-green-100 text-green-800" :
                          job.status === "running" ? "bg-blue-100 text-blue-800" :
                          job.status === "failed" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {job.status}
                        </Badge>
                        <Link href={`/jobs/${job.id}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {location === "/dashboard" && jobRequests.length > 5 && (
                    <div className="text-center pt-4">
                      <Link href="/jobs">
                        <Button variant="outline">View All Job Requests</Button>
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
