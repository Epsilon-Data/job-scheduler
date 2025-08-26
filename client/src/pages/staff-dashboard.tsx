import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Users, Clock, CheckCircle, Server, Github } from "lucide-react";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

export default function StaffDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Redirect if not staff
  if (user && user.role !== "staff") {
    setLocation("/dashboard");
    return null;
  }

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/staff/users"],
    enabled: user?.role === "staff",
  });

  const { data: pendingUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/staff/users/pending"],
    enabled: user?.role === "staff",
  });

  const { data: allWorkspaces = [] } = useQuery({
    queryKey: ["/api/staff/workspaces"],
    enabled: user?.role === "staff",
  });

  const { data: allJobs = [] } = useQuery({
    queryKey: ["/api/staff/jobs"],
    enabled: user?.role === "staff",
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/staff/users/${userId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User approved",
        description: "The user has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/users/pending"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/staff/users/${userId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User rejected",
        description: "The user has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/users/pending"] });
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const totalUsers = users.length;
  const pendingCount = pendingUsers.length;
  const approvedCount = users.filter(u => u.approvalStatus === "approved").length;
  const activeWorkspaces = allWorkspaces.filter((w: any) => w.status === "active").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Staff Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Manage user approvals and system oversight
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-foreground">{totalUsers}</h3>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-foreground">{pendingCount}</h3>
                  <p className="text-sm text-muted-foreground">Pending Approvals</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-foreground">{approvedCount}</h3>
                  <p className="text-sm text-muted-foreground">Approved Users</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Server className="h-5 w-5 text-purple-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-foreground">{activeWorkspaces}</h3>
                  <p className="text-sm text-muted-foreground">Active Workspaces</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                      User
                    </th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                      Institution
                    </th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                      Request Date
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
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-4 px-6">
                        <div className="flex items-center">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={user.avatarUrl || ""} alt={user.fullName || user.username} />
                            <AvatarFallback>
                              <Github className="w-5 h-5" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-foreground">
                              {user.fullName || user.username}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              @{user.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-foreground">
                        {user.institution || "N/A"}
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6">
                        <Badge
                          variant={
                            user.approvalStatus === "approved"
                              ? "default"
                              : user.approvalStatus === "pending"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {user.approvalStatus}
                        </Badge>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex space-x-2">
                          {user.approvalStatus === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveMutation.mutate(user.id)}
                                disabled={approveMutation.isPending}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectMutation.mutate(user.id)}
                                disabled={rejectMutation.isPending}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {user.approvalStatus === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectMutation.mutate(user.id)}
                              disabled={rejectMutation.isPending}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Job Requests Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-foreground mb-6">All Job Requests</h2>
          
          {allJobs.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground text-center">No job requests found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {allJobs.map((job: any) => (
                <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-semibold text-foreground">{job.jobId}</h3>
                          <Badge variant={
                            job.status === "completed" ? "default" : 
                            job.status === "running" ? "secondary" : 
                            job.status === "failed" ? "destructive" : "outline"
                          }>
                            {job.status}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Repository</p>
                            <p className="font-medium">{job.githubRepo || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Workspace</p>
                            <p className="font-medium">{job.workspaceName || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">User</p>
                            <p className="font-medium">{job.username} ({job.fullName})</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Commit</p>
                            <p className="font-medium font-mono text-xs">{job.commitSha?.substring(0, 8) || "N/A"}</p>
                          </div>
                        </div>
                        
                        {job.commitMessage && (
                          <div className="mt-3 p-3 bg-muted rounded-md">
                            <p className="text-sm text-muted-foreground mb-1">Commit Message</p>
                            <p className="text-sm">{job.commitMessage}</p>
                          </div>
                        )}
                        
                        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Created: {new Date(job.createdAt).toLocaleDateString()}</span>
                          {job.startedAt && <span>Started: {new Date(job.startedAt).toLocaleDateString()}</span>}
                          {job.completedAt && <span>Completed: {new Date(job.completedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setLocation(`/jobs/${job.jobId}`)}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
