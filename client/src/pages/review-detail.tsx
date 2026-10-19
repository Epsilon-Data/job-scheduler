import { useEffect, useState } from "react";
import { useAuth, useReviewAccessCheck } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Bot, CheckCircle, Info, ShieldCheck, ShieldX, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { LoadingSpinner } from "@/components/loading-spinner";
import { OutputFilesCard } from "@/components/output-files";
import { ReleaseDecisionBadge, ReleaseStatusBadge } from "@/components/release-status-badge";
import { getJobStatusColor } from "@/lib/status-utils";
import { formatDateTime } from "@/lib/date-utils";
import { formatBytes } from "@/lib/job-utils";
import { isReviewAccessLost, parseApiError, reviewErrorMessage } from "@/lib/api-utils";
import { AI_ADVISORY_LABEL, OWN_JOB_REVIEW_MESSAGE } from "@/lib/constants";
import type { AttestationStatus, ReviewDecision, ReviewDecisionResult, ReviewJobDetail } from "@/types/job";
import { AI_REVIEW_UNAVAILABLE } from "@shared/aiReview";

interface ReviewDetailProps {
  params: { jobId: string };
}

type Decision = ReviewDecision["decision"];

export default function ReviewDetail({ params }: ReviewDetailProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [decision, setDecision] = useState<Decision>("approve");
  const [reason, setReason] = useState("");
  const isReviewer = user?.role === "reviewer" && user.approvalStatus === "approved";
  const detailKey = [`/api/review/jobs/${params.jobId}`];

  // Redirect if not an approved reviewer (same check as requireReviewer); the queue tells an unapproved
  // reviewer account why
  useEffect(() => {
    if (!user) {
      setLocation("/auth");
    } else if (user.role !== "reviewer") {
      setLocation("/dashboard");
    } else if (!isReviewer) {
      setLocation("/review");
    }
  }, [user, isReviewer, setLocation]);

  const { data: job, isLoading, error } = useQuery<ReviewJobDetail>({
    queryKey: detailKey,
    enabled: isReviewer,
  });

  useReviewAccessCheck(error);

  const refreshReviewQueries = () => {
    queryClient.invalidateQueries({ queryKey: detailKey });
    queryClient.invalidateQueries({ queryKey: ["/api/review/jobs"] });
  };

  const decisionMutation = useMutation({
    mutationFn: async (body: {
      decision: Decision;
      reason: string | null;
      output_sha256: string;
      files_manifest_sha256: string | null;
    }) => {
      const response = await apiRequest("POST", `/api/review/jobs/${params.jobId}/decision`, body);
      return (await response.json()) as ReviewDecisionResult;
    },
    onSuccess: (result) => {
      setDialogOpen(false);
      setReason("");
      queryClient.setQueryData<ReviewJobDetail>(detailKey, (current) =>
        current && { ...current, release_status: result.release_status, decision: result.decision },
      );
      refreshReviewQueries();
      toast({
        title: result.decision.decision === "approve" ? "Output released" : "Output withheld",
        description: "The decision has been recorded.",
      });
    },
    onError: (error: Error) => {
      const apiError = parseApiError(error);
      setDialogOpen(false);
      toast({
        title: "Decision not recorded",
        description: reviewErrorMessage(apiError),
        variant: "destructive",
      });
      if (isReviewAccessLost(apiError)) {
        // Signed out, or no longer a reviewer
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } else if (apiError.status === 409 || apiError.status === 404) {
        // Already decided, the held output or the assignment changed, or the job left the reviewer's projects
        refreshReviewQueries();
      }
    },
  });

  const openDialog = (next: Decision) => {
    if (next !== decision) setReason("");
    setDecision(next);
    setDialogOpen(true);
  };

  const confirmDecision = () => {
    if (!job) return;
    decisionMutation.mutate({
      decision,
      reason: reason.trim() || null,
      // Binds the decision to the exact content and files shown on this page
      output_sha256: job.output.content_sha256,
      files_manifest_sha256: job.files_manifest_sha256,
    });
  };

  if (!isReviewer) {
    return null;
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading job for review..." />;
  }

  if (error) {
    const apiError = parseApiError(error);
    if (apiError.code === "OWN_JOB") {
      return <RefusalState title={OWN_JOB_REVIEW_MESSAGE} message="Another reviewer has to decide on its release." />;
    }
    if (apiError.status === 404) {
      return <RefusalState title="Nothing to review" message={reviewErrorMessage(apiError)} />;
    }
    return <RefusalState title="Error loading job" message={reviewErrorMessage(apiError)} />;
  }

  if (!job) {
    return <RefusalState title="Nothing to review" message={`Job ID: ${params.jobId}`} />;
  }

  const isReject = decision === "reject";
  const hasFiles = job.files.length > 0;
  const released = job.release_status === "released";
  const canDecide = job.release_status === "pending" && !job.decision;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <Link href="/review" className="hover:text-primary">Review</Link>
            <span>{">"}</span>
            <span className="text-foreground">{job.job_id}</span>
          </nav>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{job.job_id}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Completed {formatDateTime(job.completed_at)}</p>
            </div>
            <div className="flex items-center space-x-3">
              <Badge className={getJobStatusColor(job.status)}>{job.status}</Badge>
              <ReleaseStatusBadge status={job.release_status} />
            </div>
          </div>
        </div>

        {/* Decision Record */}
        {job.decision && <DecisionRecordCard decision={job.decision} />}

        {/* Job Metadata */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Submitted by</span>
                <p className="text-foreground">
                  {job.submitted_by.full_name || job.submitted_by.username}
                  <span className="text-muted-foreground"> @{job.submitted_by.username}</span>
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Workspace</span>
                <p className="text-foreground">
                  {job.workspace.name}
                  <span className="text-muted-foreground"> ({job.workspace.github_repo})</span>
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Project</span>
                <p className="font-mono text-xs break-all">{job.project_id ?? "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Archetype</span>
                <p className="text-foreground break-all">{job.archetype_id ?? "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Commit</span>
                <p className="font-mono text-xs">{job.commit_sha}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Output</span>
                <p className="text-foreground">
                  {job.output.kind === "error" ? "Error text" : "Result"}, {formatBytes(job.output.size_bytes)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Output */}
        <OutputCard
          output={job.output}
          attestationStatus={job.attestation_status}
          released={released}
        />

        {/* Output Files */}
        {(hasFiles || job.files_manifest_sha256) && (
          <OutputFilesCard
            files={job.files}
            manifestSha256={job.files_manifest_sha256}
            manifestMatches={job.files_manifest_matches}
            filesUrl={`/api/review/jobs/${encodeURIComponent(job.job_id)}/files`}
            title={`${released ? "Released" : "Held"} Files`}
            description="Released or withheld together with the output above."
            preview
          />
        )}

        {/* AI Advisory */}
        <AIAdvisoryCard ai={job.ai} />

        {/* Attestation Verification */}
        <VerificationReceiptCard receipt={job.verification_receipt} />

        {/* Release Decision */}
        {canDecide && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Release Decision</CardTitle>
              <CardDescription>
                Approving releases the output above{hasFiles ? " and all of its files" : ""}, exactly as shown, to
                the researcher. Rejecting keeps {hasFiles ? "them" : "it"} withheld and shows the researcher your reason.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {/* The server says when Approve is refused (e.g. the result does not match the attested hash) */}
                <Button onClick={() => openDialog("approve")} disabled={!!job.approve_blocked_reason}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approve release
                </Button>
                <Button variant="destructive" onClick={() => openDialog("reject")}>
                  <ShieldX className="mr-2 h-4 w-4" />
                  Reject release
                </Button>
              </div>
              {job.approve_blocked_reason && (
                <p className="mt-3 text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
                  {job.approve_blocked_reason}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <AlertDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!decisionMutation.isPending) setDialogOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isReject ? "Reject the release of this output?" : "Release this output to the researcher?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isReject
                  ? "The output stays withheld and the researcher sees your reason."
                  : `The researcher will see the output${hasFiles ? ` and its ${job.files.length} ${job.files.length === 1 ? "file" : "files"}` : ""} exactly as shown on this page.`}{" "}
                The decision is recorded and can't be changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="decision-reason">
                {isReject ? "Reason (required, shown to the researcher)" : "Note (optional, shown to the researcher)"}
              </Label>
              <Textarea
                id="decision-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder={isReject ? "Why can't this output be released?" : ""}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={decisionMutation.isPending}>Cancel</AlertDialogCancel>
              <Button
                variant={isReject ? "destructive" : "default"}
                onClick={confirmDecision}
                disabled={decisionMutation.isPending || (isReject && !reason.trim())}
              >
                {decisionMutation.isPending ? "Saving..." : isReject ? "Reject release" : "Approve release"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

/* ── Output ──────────────────────────────────────────────────── */

function OutputCard({ output, attestationStatus, released }: {
  output: ReviewJobDetail["output"];
  attestationStatus: AttestationStatus;
  released: boolean;
}) {
  const title = `${released ? "Released" : "Held"} ${output.kind === "error" ? "Error Text" : "Output"}`;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">{formatBytes(output.size_bytes)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {output.content ? (
          <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-auto max-h-[32rem] whitespace-pre">
            {output.content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted rounded-lg p-4">The output is empty.</p>
        )}
        <div className="space-y-2 pt-2 border-t">
          <AttestationMatch status={attestationStatus} />
          <p className="text-xs text-muted-foreground">
            Content SHA-256 <span className="font-mono break-all">{output.content_sha256}</span>
          </p>
          {output.attested_output_hash && (
            <p className="text-xs text-muted-foreground">
              Attested output hash <span className="font-mono break-all">{output.attested_output_hash}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AttestationMatch({ status }: { status: AttestationStatus }) {
  if (status === "not_attested") {
    return (
      <Badge variant="outline" className="text-muted-foreground text-xs gap-1">
        <Info className="h-3 w-3" /> No attested output hash to compare
      </Badge>
    );
  }

  return status === "matches" ? (
    <Badge variant="outline" className="text-green-700 border-green-300 text-xs gap-1">
      <CheckCircle className="h-3 w-3" /> Matches the attested output hash
    </Badge>
  ) : (
    <Badge variant="outline" className="text-red-700 border-red-300 text-xs gap-1">
      <X className="h-3 w-3" /> Does not match the attested output hash
    </Badge>
  );
}

/* ── AI Advisory ─────────────────────────────────────────────── */

function AIAdvisoryCard({ ai }: { ai: ReviewJobDetail["ai"] }) {
  const hasReview = ai.decision !== null || ai.confidence !== null || !!ai.reasoning;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI Review
        </CardTitle>
        <CardDescription>{AI_ADVISORY_LABEL}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!hasReview ? (
          <p className="text-muted-foreground">No AI review was recorded for this job.</p>
        ) : ai.unavailable ? (
          <>
            <Badge variant="outline" className="text-xs text-muted-foreground">{AI_REVIEW_UNAVAILABLE}</Badge>
            <p className="text-muted-foreground">
              The AI review did not complete, so it says nothing about this job.
            </p>
            {ai.reasoning && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ai.reasoning}</p>}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {ai.decision && <Badge variant="outline" className="text-xs">{ai.decision.replace(/_/g, " ")}</Badge>}
              {ai.confidence !== null && (
                <span className="text-xs text-muted-foreground">Confidence: {Math.round(ai.confidence * 100)}%</span>
              )}
            </div>
            {ai.reasoning && <p className="text-muted-foreground whitespace-pre-wrap">{ai.reasoning}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Attestation Verification ────────────────────────────────── */

function VerificationReceiptCard({ receipt }: { receipt: Record<string, unknown> | null }) {
  if (!receipt) return null;

  const checks = receipt.checks && typeof receipt.checks === "object"
    ? Object.entries(receipt.checks as Record<string, unknown>)
    : [];

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Attestation Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {checks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {checks.map(([check, passed]) => (
              <div key={check} className="flex items-center gap-1.5">
                {passed ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <X className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className="text-xs">{check.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">The verification receipt lists no checks.</p>
        )}
        {typeof receipt.error === "string" && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">{receipt.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Decision Record ─────────────────────────────────────────── */

function DecisionRecordCard({ decision }: { decision: ReviewDecision }) {
  const approved = decision.decision === "approve";

  return (
    <Card className={`mb-6 ${approved ? "border-green-200" : "border-slate-300"}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Decision Record</CardTitle>
          <ReleaseDecisionBadge decision={decision.decision} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {decision.reason && (
          <p className="whitespace-pre-wrap">
            <span className="text-muted-foreground">{approved ? "Note: " : "Reason: "}</span>
            {decision.reason}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          {decision.reviewer && (
            <p>Reviewer: {decision.reviewer.full_name || decision.reviewer.username}</p>
          )}
          <p>Decided {formatDateTime(decision.decided_at)}</p>
          <p>Decision ID <span className="font-mono break-all">{decision.id}</span></p>
          <p>Output SHA-256 <span className="font-mono break-all">{decision.output_sha256}</span></p>
          {decision.files_manifest_sha256 && (
            <p>Files manifest SHA-256 <span className="font-mono break-all">{decision.files_manifest_sha256}</span></p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Refusal/Error States ────────────────────────────────────── */

function RefusalState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <p className="text-muted-foreground">{message}</p>
        <Link href="/review"><Button className="mt-4">Back to Review</Button></Link>
      </div>
    </div>
  );
}
