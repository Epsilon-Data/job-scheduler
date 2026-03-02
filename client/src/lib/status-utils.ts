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
