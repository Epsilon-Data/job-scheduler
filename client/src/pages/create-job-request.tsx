import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, GitCommit, User, Calendar, Code, FileCode, Eye } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Workspace } from "@shared/schema";

interface CreateJobRequestProps {
  params: {
    workspaceId: string;
  };
}

export default function CreateJobRequest({ params }: CreateJobRequestProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: workspace, isLoading } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${params.workspaceId}`],
    enabled: user?.approvalStatus === "approved",
  });

  const { data: latestCommit } = useQuery({
    queryKey: [`/api/github/repos/${workspace?.githubRepo}/commits/${workspace?.githubBranch}`],
    enabled: !!workspace?.githubRepo && !!workspace?.githubBranch,
  });

  const { data: repoFiles } = useQuery({
    queryKey: [`/api/github/repos/${workspace?.githubRepo}/contents`],
    enabled: !!workspace?.githubRepo,
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/workspaces/${params.workspaceId}/jobs`);
      return response.json();
    },
    onSuccess: (jobRequest) => {
      toast({
        title: "Job request created",
        description: `Job ${jobRequest.jobId} has been submitted successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", params.workspaceId, "jobs"] });
      setLocation(`/jobs/${jobRequest.id}`);
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
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
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
            <Link href={`/workspaces/${params.workspaceId}`} className="hover:text-primary">
              {workspace.name}
            </Link>
            <span>{">"}</span>
            <span className="text-foreground">New Job Request</span>
          </nav>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Create Job Request</h1>
              <p className="mt-2 text-muted-foreground">
                Submit a computational job for workspace: {workspace.name}
              </p>
            </div>
            <Link href={`/workspaces/${params.workspaceId}`}>
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Workspace
              </Button>
            </Link>
          </div>
        </div>

        {/* Workspace Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Repository</h3>
              <div className="flex items-center">
                <Code className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{workspace.githubRepo}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Branch</h3>
              <div className="flex items-center">
                <GitCommit className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{workspace.githubBranch}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
              <Badge className="bg-green-100 text-green-800">
                {workspace.status}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Latest Commit Info */}
        {latestCommit && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitCommit className="mr-2 h-5 w-5" />
                Latest Commit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {latestCommit.commit?.message || "No commit message"}
                    </p>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <User className="mr-1 h-4 w-4" />
                        {latestCommit.commit?.author?.name || "Unknown"}
                      </div>
                      <div className="flex items-center">
                        <Calendar className="mr-1 h-4 w-4" />
                        {latestCommit.commit?.author?.date ? 
                          new Date(latestCommit.commit.author.date).toLocaleDateString() : 
                          "Unknown date"
                        }
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {latestCommit.sha?.substring(0, 7) || "Unknown"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Repository Files Preview */}
        {repoFiles && Array.isArray(repoFiles) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileCode className="mr-2 h-5 w-5" />
                Repository Files
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {repoFiles.slice(0, 10).map((file: any) => (
                  <div key={file.name} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted">
                    <div className="flex items-center">
                      <FileCode className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-muted-foreground">{file.type}</span>
                      {file.download_url && (
                        <Button variant="ghost" size="sm">
                          <Eye className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {repoFiles.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    ... and {repoFiles.length - 10} more files
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job Request Summary */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Job Request Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  What will happen when you submit this job?
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• The latest commit ({latestCommit?.sha?.substring(0, 7) || "unknown"}) will be used</li>
                  <li>• Your job will be queued for execution</li>
                  <li>• You'll receive notifications when the job starts and completes</li>
                  <li>• Results will be available for download once completed</li>
                </ul>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Link href={`/workspaces/${params.workspaceId}`}>
                  <Button variant="outline">Cancel</Button>
                </Link>
                <Button 
                  onClick={() => createJobMutation.mutate()} 
                  disabled={createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? "Submitting..." : "Submit Job Request"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}