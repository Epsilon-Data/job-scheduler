import { useEffect, useState } from "react";
import { useAuth, useReviewAccessCheck } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { LoadingSpinner } from "@/components/loading-spinner";
import { AttestationStatusBadge, ReleaseDecisionBadge } from "@/components/release-status-badge";
import { getJobStatusColor } from "@/lib/status-utils";
import { formatDateTimeShort } from "@/lib/date-utils";
import { formatBytes, shortProjectId } from "@/lib/job-utils";
import { isReviewAccessLost, parseApiError, reviewErrorMessage } from "@/lib/api-utils";
import { NO_PROJECTS_MESSAGE, OWN_JOB_REVIEW_MESSAGE, REVIEWER_NOT_APPROVED_MESSAGE } from "@/lib/constants";
import type { ReviewerAssignments, ReviewQueueJob } from "@/types/job";

type QueueTab = "pending" | "decided";

export default function ReviewQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<QueueTab>("pending");
  const isReviewer = user?.role === "reviewer" && user.approvalStatus === "approved";

  // Redirect accounts that are not reviewers; an unapproved reviewer account stays and is told why
  useEffect(() => {
    if (!user) {
      setLocation("/auth");
    } else if (user.role !== "reviewer") {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const assignments = useQuery<ReviewerAssignments>({
    queryKey: ["/api/review/me"],
    enabled: isReviewer,
    refetchInterval: 30_000,
  });

  const pending = useQuery<ReviewQueueJob[]>({
    queryKey: ["/api/review/jobs", { status: "pending" }],
    enabled: isReviewer,
    refetchInterval: 30_000,
  });

  const decided = useQuery<ReviewQueueJob[]>({
    queryKey: ["/api/review/jobs", { status: "decided" }],
    enabled: isReviewer,
  });

  useReviewAccessCheck(assignments.error, pending.error, decided.error);

  // Re-checks the reviewer's projects with Keycloak now, not at the next periodic check
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/review/me?refresh=1");
      return (await response.json()) as ReviewerAssignments;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["/api/review/me"], result);
      queryClient.invalidateQueries({ queryKey: ["/api/review/jobs"] });
    },
    onError: (error: Error) => {
      const apiError = parseApiError(error);
      toast({
        title: "Projects not refreshed",
        description: reviewErrorMessage(apiError),
        variant: "destructive",
      });
      if (isReviewAccessLost(apiError)) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    },
  });

  if (user?.role !== "reviewer") {
    return null;
  }

  if (!isReviewer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">Not approved</h2>
            <p className="text-muted-foreground">{REVIEWER_NOT_APPROVED_MESSAGE}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pending.isLoading || assignments.isLoading) {
    return <LoadingSpinner message="Loading review queue..." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Output Review</h1>
          <p className="mt-2 text-muted-foreground">
            Results and error text from real-data runs reach the researcher only after a reviewer approves them.
          </p>
        </div>

        {assignments.data?.projects.length === 0 ? (
          <NoProjectsCard
            syncedAt={assignments.data.synced_at}
            isRefreshing={refreshMutation.isPending}
            onRefresh={() => refreshMutation.mutate()}
          />
        ) : (
          <Tabs value={tab} onValueChange={(value) => setTab(value as QueueTab)}>
            <TabsList>
              <TabsTrigger value="pending">Pending{pending.data ? ` (${pending.data.length})` : ""}</TabsTrigger>
              <TabsTrigger value="decided">Decided{decided.data ? ` (${decided.data.length})` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <ReviewJobsCard
                jobs={pending.data}
                isLoading={pending.isLoading}
                error={pending.error}
                emptyMessage="No jobs are waiting for review."
              />
            </TabsContent>

            <TabsContent value="decided">
              <ReviewJobsCard
                jobs={decided.data}
                isLoading={decided.isLoading}
                error={decided.error}
                emptyMessage="No release decisions yet."
                showDecision
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function NoProjectsCard({ syncedAt, isRefreshing, onRefresh }: {
  syncedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-3">
        <p className="text-foreground">{NO_PROJECTS_MESSAGE}</p>
        <p className="text-sm text-muted-foreground">
          Last synced: {syncedAt ? formatDateTimeShort(syncedAt) : "not yet"}
        </p>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ReviewJobsCardProps {
  jobs: ReviewQueueJob[] | undefined;
  isLoading: boolean;
  error: Error | null;
  emptyMessage: string;
  showDecision?: boolean;
}

function ReviewJobsCard({ jobs = [], isLoading, error, emptyMessage, showDecision = false }: ReviewJobsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        {isLoading ? (
          <LoadingSpinner message="Loading jobs..." fullScreen={false} />
        ) : error ? (
          <p className="text-sm text-red-600 text-center">{reviewErrorMessage(parseApiError(error))}</p>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground text-center">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Job
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Project
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Submitted by
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Workspace
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Completed
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Output
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    {showDecision ? "Decision" : "AI advisory"}
                  </th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.job_id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-4 px-6">
                      <div className="text-sm font-medium text-foreground">{job.job_id}</div>
                      <Badge className={`mt-1 ${getJobStatusColor(job.status)}`}>{job.status}</Badge>
                    </td>
                    <td className="py-4 px-6">
                      {job.project_id ? (
                        <div className="text-sm font-mono text-foreground" title={job.project_id}>
                          {shortProjectId(job.project_id)}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                      {job.archetype_id && (
                        <div className="text-xs text-muted-foreground max-w-[12rem] truncate" title={job.archetype_id}>
                          {job.archetype_id}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground">
                      {job.submitted_by.full_name || job.submitted_by.username}
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm text-foreground">{job.workspace.name}</div>
                      <div className="text-xs text-muted-foreground">{job.workspace.github_repo}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {formatDateTimeShort(job.completed_at)}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground whitespace-nowrap">
                      {job.output_kind
                        ? `${job.output_kind === "error" ? "Error" : "Result"}${job.output_size === null ? "" : `, ${formatBytes(job.output_size)}`}`
                        : "-"}
                      {job.attestation_status && (
                        <div className="mt-1">
                          <AttestationStatusBadge status={job.attestation_status} />
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {showDecision ? (
                        job.decision && (
                          <>
                            <ReleaseDecisionBadge decision={job.decision.decision} />
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDateTimeShort(job.decision.decided_at)}
                              {job.decision.reviewer && (
                                <> by {job.decision.reviewer.full_name || job.decision.reviewer.username}</>
                              )}
                            </div>
                          </>
                        )
                      ) : job.ai_decision ? (
                        <Badge variant="outline" className="text-xs">{job.ai_decision.replace(/_/g, " ")}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {job.own_job ? (
                        <Badge variant="secondary" title={OWN_JOB_REVIEW_MESSAGE}>Your job</Badge>
                      ) : (
                        <Link href={`/review/${job.job_id}`}>
                          <Button size="sm" variant="outline">{showDecision ? "View" : "Review"}</Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
