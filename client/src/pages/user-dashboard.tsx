import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, Play, Clock, Plus, Github, GitBranch, Calendar } from "lucide-react";
import { Link } from "wouter";
import type { Workspace, JobRequest } from "@shared/schema";

export default function UserDashboard() {
  const { user } = useAuth();

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

  const completedJobs = jobRequests.filter(job => job.status === "completed").length;
  const runningJobs = jobRequests.filter(job => job.status === "running").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">My Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your workspaces and research projects
          </p>
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
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>My Workspaces</CardTitle>
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
      </div>
    </div>
  );
}
