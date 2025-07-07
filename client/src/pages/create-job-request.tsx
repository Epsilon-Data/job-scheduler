import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, GitCommit, User, Calendar, Code, FileCode, Eye, File, Folder, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Workspace } from "@shared/schema";
import { useState } from "react";

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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [folderContents, setFolderContents] = useState<{ [key: string]: any[] }>({});

  const { data: workspace, isLoading } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${params.workspaceId}`],
    enabled: user?.approvalStatus === "approved",
  });

  const { data: latestCommit } = useQuery({
    queryKey: [`/api/github/repos/${workspace?.githubRepo}/commits/${workspace?.githubBranch}`],
    enabled: !!workspace?.githubRepo && !!workspace?.githubBranch,
  });

  const { data: repoFiles } = useQuery({
    queryKey: [`/api/github/repos/${workspace?.githubRepo}/contents${currentPath ? `/${currentPath}` : ""}`],
    enabled: !!workspace?.githubRepo,
  });

  const { data: fileContent } = useQuery({
    queryKey: [`/api/github/repos/${workspace?.githubRepo}/contents/${currentPath ? `${currentPath}/` : ""}${selectedFile}`],
    enabled: !!workspace?.githubRepo && !!selectedFile,
  });

  const handleFileClick = (file: any) => {
    if (file.type === 'dir') {
      const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      setCurrentPath(newPath);
      setSelectedFile(null);
    } else {
      setSelectedFile(file.name);
    }
  };

  const handleBackClick = () => {
    const pathParts = currentPath.split('/');
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
    setSelectedFile(null);
  };

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
                  <div className="space-y-2 flex-1">
                    <p className="text-lg font-medium text-foreground">
                      {latestCommit.message || latestCommit.commit?.message || "No commit message"}
                    </p>
                    <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <User className="mr-2 h-4 w-4" />
                        <span className="font-medium">
                          {latestCommit.author || latestCommit.commit?.author?.name || "Unknown Author"}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <Calendar className="mr-2 h-4 w-4" />
                        <span>
                          {latestCommit.date ? 
                            new Date(latestCommit.date).toLocaleString() :
                            latestCommit.commit?.author?.date ? 
                              new Date(latestCommit.commit.author.date).toLocaleString() : 
                              "Unknown date"
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-mono bg-muted px-3 py-2 rounded-lg border">
                    {(latestCommit.sha || latestCommit.commit?.sha || "Unknown").substring(0, 7)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Repository Files Browser */}
        {repoFiles && Array.isArray(repoFiles) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Code className="mr-2 h-5 w-5" />
                Repository Files
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t">
                {/* File Browser */}
                <div className="border-r border-border">
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm flex items-center">
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Files ({repoFiles?.length || 0})
                      </h3>
                      {currentPath && (
                        <Button variant="ghost" size="sm" onClick={handleBackClick} className="h-6 px-2">
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          Back
                        </Button>
                      )}
                    </div>
                    {currentPath && (
                      <div className="mt-2 text-xs text-muted-foreground font-mono">
                        /{currentPath}
                      </div>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {repoFiles?.map((file: any) => (
                      <div 
                        key={file.name} 
                        className={`flex items-center p-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 transition-colors ${
                          selectedFile === file.name && file.type === 'file' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500' : ''
                        }`}
                        onClick={() => handleFileClick(file)}
                      >
                        {file.type === "dir" ? (
                          <Folder className="mr-3 h-4 w-4 text-blue-500" />
                        ) : (
                          <File className="mr-3 h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.type === "dir" ? "Directory" : 
                             file.size ? `${(file.size / 1024).toFixed(1)} KB` : "File"}
                          </p>
                        </div>
                        {file.type === "dir" ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {selectedFile === file.name ? (
                              <Badge variant="secondary" className="text-xs">Selected</Badge>
                            ) : (
                              <Eye className="h-4 w-4 opacity-50" />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Code Viewer */}
                <div className="flex flex-col">
                  <div className="p-4 border-b bg-muted/30">
                    <h3 className="font-semibold text-sm flex items-center">
                      <FileCode className="mr-2 h-4 w-4" />
                      {selectedFile || "Select a file to view"}
                    </h3>
                  </div>
                  <div className="flex-1 max-h-96 overflow-y-auto">
                    {selectedFile && fileContent ? (
                      <div className="p-0">
                        {fileContent.type === "file" && fileContent.content ? (
                          <div className="relative">
                            <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-900 p-4 overflow-x-auto border-0 rounded-none">
                              {atob(fileContent.content).split('\n').map((line, index) => (
                                <div key={index} className="flex">
                                  <span className="text-slate-400 dark:text-slate-500 select-none pr-4 text-right min-w-[3rem] border-r border-slate-200 dark:border-slate-700 mr-4">
                                    {index + 1}
                                  </span>
                                  <code className="text-slate-800 dark:text-slate-200 flex-1">
                                    {line}
                                  </code>
                                </div>
                              ))}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Cannot preview this file type</p>
                          </div>
                        )}
                      </div>
                    ) : selectedFile ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">Select a file from the list to view its contents</p>
                        <p className="text-xs mt-2">Click on any file to preview the source code</p>
                      </div>
                    )}
                  </div>
                </div>
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