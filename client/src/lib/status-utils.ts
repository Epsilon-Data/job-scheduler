import type { JobRelease, ReleaseStatus } from "@shared/schema";
import type { AttestationStatus } from "@/types/job";

export type JobStatus =
  | "success"
  | "running"
  | "failed"
  | "queued"
  | "pending"
  | "ai_analyzing"
  | "ai_approved"
  | "ai_rejected";

export type ApprovalStatus = "approved" | "pending" | "rejected";

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  success: "bg-green-100 text-green-800",
  running: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-yellow-100 text-yellow-800",
  pending: "bg-yellow-100 text-yellow-800",
  ai_analyzing: "bg-cyan-100 text-cyan-800",
  ai_approved: "bg-green-100 text-green-800",
  ai_rejected: "bg-red-100 text-red-800",
} as const;

export const JOB_STATUS_DOT_COLORS: Record<string, string> = {
  success: "bg-green-500",
  running: "bg-blue-500",
  failed: "bg-red-500",
  queued: "bg-yellow-500",
  pending: "bg-yellow-500",
} as const;

export function getJobStatusColor(status: string): string {
  return JOB_STATUS_COLORS[status as JobStatus] || "bg-gray-100 text-gray-800";
}

export function getJobStatusDotColor(status: string): string {
  return JOB_STATUS_DOT_COLORS[status] || "bg-gray-500";
}

// Output-release gate: only held states get a badge
export const RELEASE_STATUS_BADGES: Partial<Record<ReleaseStatus, { label: string; className: string }>> = {
  pending: { label: "Awaiting review", className: "bg-amber-100 text-amber-800" },
  withheld: { label: "Withheld", className: "bg-slate-200 text-slate-800" },
};

export function getReleaseStatusBadge(status: string | null | undefined) {
  return (status && RELEASE_STATUS_BADGES[status as ReleaseStatus]) || null;
}

// Review queue: the held output against the output hash the enclave signed
export const ATTESTATION_STATUS_BADGES: Record<AttestationStatus, { label: string; className: string }> = {
  matches: { label: "Attested", className: "text-green-700 border-green-300" },
  mismatch: { label: "Hash mismatch", className: "text-red-700 border-red-300" },
  not_attested: { label: "Not attested", className: "text-muted-foreground" },
};

// Job responses carry the release status as release_status, releaseStatus or release.status
export function getReleaseStatus(job: {
  release_status?: ReleaseStatus | null;
  releaseStatus?: ReleaseStatus | null;
  release?: Pick<JobRelease, "status"> | null;
}): ReleaseStatus | null {
  return job.release_status ?? job.releaseStatus ?? job.release?.status ?? null;
}

export function getApprovalStatusVariant(status: ApprovalStatus): "default" | "secondary" | "destructive" {
  switch (status) {
    case "approved":
      return "default";
    case "pending":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}
