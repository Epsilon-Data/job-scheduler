import { Badge } from "@/components/ui/badge";
import { ATTESTATION_STATUS_BADGES, getReleaseStatusBadge } from "@/lib/status-utils";
import type { ReleaseDecision } from "@shared/schema";
import type { AttestationStatus } from "@/types/job";

export function ReleaseStatusBadge({ status }: { status: string | null | undefined }) {
  const badge = getReleaseStatusBadge(status);
  if (!badge) return null;

  return <Badge className={badge.className}>{badge.label}</Badge>;
}

export function ReleaseDecisionBadge({ decision }: { decision: ReleaseDecision["decision"] }) {
  return decision === "approve"
    ? <Badge className="bg-green-100 text-green-800">Approved</Badge>
    : <Badge className="bg-slate-200 text-slate-800">Rejected</Badge>;
}

export function AttestationStatusBadge({ status }: { status: AttestationStatus }) {
  const badge = ATTESTATION_STATUS_BADGES[status];
  return <Badge variant="outline" className={`text-xs whitespace-nowrap ${badge.className}`}>{badge.label}</Badge>;
}
