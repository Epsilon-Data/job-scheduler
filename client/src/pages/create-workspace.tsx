import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Info } from "lucide-react";
import { useLocation } from "wouter";
import { insertWorkspaceSchema, type InsertWorkspace } from "@shared/schema";
import { z } from "zod";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
  };
}

const createWorkspaceSchema = insertWorkspaceSchema.pick({
  name: true,
  description: true,
  githubRepo: true,
  githubBranch: true,
});

type CreateWorkspaceForm = z.infer<typeof createWorkspaceSchema>;

export default function CreateWorkspace() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateWorkspaceForm>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: "",
      description: "",
      githubRepo: "",
      githubBranch: "",
    },
  });

  const selectedRepo = watch("githubRepo");

  const { data: repos = [] } = useQuery<GitHubRepo[]>({
    queryKey: ["/api/github/repos"],
    enabled: user?.approvalStatus === "approved",
  });

  const { data: branches = [] } = useQuery<GitHubBranch[]>({
    queryKey: [`/api/github/repos/${selectedRepo}/branches`],
    enabled: !!selectedRepo,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateWorkspaceForm) => {
      const response = await apiRequest("POST", "/api/workspaces", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Workspace created",
        description: "Your workspace has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Create New Workspace</h1>
          <p className="mt-2 text-muted-foreground">
            Set up a new research workspace with GitHub integration
          </p>
        </div>

        <Card>
          <CardContent className="p-8">
            <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Workspace Name</Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="Enter workspace name"
                />
                {errors.name && (
                  <p className="text-sm text-error">{errors.name.message}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Choose a descriptive name for your research workspace
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Describe your research project..."
                  rows={3}
                />
                {errors.description && (
                  <p className="text-sm text-error">{errors.description.message}</p>
                )}
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">GitHub Integration</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="githubRepo">Repository</Label>
                    <Controller
                      name="githubRepo"
                      control={control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a repository" />
                          </SelectTrigger>
                          <SelectContent>
                            {repos.map((repo) => (
                              <SelectItem key={repo.id} value={repo.full_name}>
                                {repo.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.githubRepo && (
                      <p className="text-sm text-error">{errors.githubRepo.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="githubBranch">Branch</Label>
                    <Controller
                      name="githubBranch"
                      control={control}
                      render={({ field }) => (
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!selectedRepo}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map((branch) => (
                              <SelectItem key={branch.name} value={branch.name}>
                                {branch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.githubBranch && (
                      <p className="text-sm text-error">{errors.githubBranch.message}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 p-4 bg-blue-50 rounded-md">
                  <div className="flex items-center">
                    <Info className="h-4 w-4 text-blue-400 mr-2" />
                    <span className="text-sm text-blue-800">
                      Job requests will automatically pull from the latest commit of the selected branch
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6">
                <Button type="button" variant="outline" onClick={() => setLocation("/dashboard")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Workspace"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
