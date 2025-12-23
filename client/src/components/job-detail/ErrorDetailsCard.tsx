import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { JobRequest } from "@shared/schema";

interface ErrorDetailsCardProps {
  jobRequest: JobRequest;
}

export function ErrorDetailsCard({ jobRequest }: ErrorDetailsCardProps) {
  // Handle both snake_case and camelCase field names
  const errorMessage = jobRequest.error_message || jobRequest.errorMessage;
  const executionError = jobRequest.execution_error || jobRequest.executionError;

  if (!errorMessage && !executionError) {
    return null;
  }

  return (
    <Card className="mb-8 border-red-200">
      <CardHeader className="bg-red-50">
        <CardTitle className="text-red-700 flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2" />
          Error Details
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-4">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
              <h4 className="font-medium text-red-800 mb-2 text-sm">Error Message:</h4>
              <p className="text-red-700 whitespace-pre-wrap font-mono text-sm bg-white p-3 rounded border border-red-100">
                {errorMessage}
              </p>
            </div>
          )}
          {executionError && (
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
              <h4 className="font-medium text-orange-800 mb-2 text-sm">Execution Error:</h4>
              <pre className="text-orange-700 text-sm bg-white p-3 rounded border border-orange-100 overflow-x-auto whitespace-pre-wrap font-mono">
                {executionError}
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
