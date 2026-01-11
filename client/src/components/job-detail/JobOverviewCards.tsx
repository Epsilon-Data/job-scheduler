import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatDateTime } from "@/lib/date-utils";
import type { JobRequest } from "@shared/schema";

interface JobOverviewCardsProps {
  jobRequest: JobRequest;
}

export function JobOverviewCards({ jobRequest }: JobOverviewCardsProps) {
  return (
    <>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Job ID</h3>
            <p className="text-lg font-semibold text-foreground">{jobRequest.jobId}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Duration</h3>
            <p className="text-lg font-semibold text-foreground">
              {formatDuration(jobRequest.duration_seconds || jobRequest.durationSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Submitted</h3>
            <p className="text-lg font-semibold text-foreground">
              {formatDateTime(jobRequest.createdAt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Completed</h3>
            <p className="text-lg font-semibold text-foreground">
              {(jobRequest.completed_at || jobRequest.completedAt)
                ? formatDateTime(jobRequest.completed_at || jobRequest.completedAt)
                : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Execution Details Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Exit Code</h3>
            <p className="text-lg font-semibold text-foreground">
              {jobRequest.exitCode !== null && jobRequest.exitCode !== undefined
                ? jobRequest.exitCode
                : "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Execution Method</h3>
            <p className="text-lg font-semibold text-foreground">
              {jobRequest.executionMethod || "Unknown"}
            </p>
          </CardContent>
        </Card>

        {jobRequest.validationStatus && (
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Validation Status</h3>
              <Badge className={jobRequest.validationStatus === 'validated'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'}>
                {jobRequest.validationStatus}
              </Badge>
            </CardContent>
          </Card>
        )}

        {jobRequest.validationDecision && (
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Validation Decision</h3>
              <Badge className={jobRequest.validationDecision === 'approved'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'}>
                {jobRequest.validationDecision}
              </Badge>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
