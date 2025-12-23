import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitCommit, User, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/date-utils";
import type { JobRequest } from "@shared/schema";

interface CommitInfoCardProps {
  jobRequest: JobRequest;
}

export function CommitInfoCard({ jobRequest }: CommitInfoCardProps) {
  // Handle both snake_case (API) and camelCase (normalized) field names
  const commitSha = jobRequest.commitSha || jobRequest.commit_hash;
  const commitMessage = jobRequest.commitMessage;
  const commitAuthor = jobRequest.commitAuthor;
  const commitDate = jobRequest.commitDate || jobRequest.commit_time;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Commit Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
              <GitCommit className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <Badge variant="outline">{commitSha?.substring(0, 7)}</Badge>
              <span className="text-sm text-muted-foreground">on main</span>
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">
              {commitMessage || "No commit message"}
            </h3>
            <div className="flex items-center space-x-4 mt-3 text-sm text-muted-foreground">
              <div className="flex items-center">
                <User className="mr-1 h-4 w-4" />
                <span>{commitAuthor || "Unknown"}</span>
              </div>
              <div className="flex items-center">
                <Clock className="mr-1 h-4 w-4" />
                <span>
                  {commitDate ? formatDateTime(commitDate) : "Unknown"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
