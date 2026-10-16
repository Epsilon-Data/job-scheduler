import { Badge } from "@/components/ui/badge";
import { getReleaseStatusBadge } from "@/lib/status-utils";
import type { ReleaseDecision } from "@shared/schema";

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
