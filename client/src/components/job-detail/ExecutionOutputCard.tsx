import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import type { JobRequest } from "@shared/schema";

interface ExecutionOutputCardProps {
  jobRequest: JobRequest;
}

export function ExecutionOutputCard({ jobRequest }: ExecutionOutputCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get execution output - handle both snake_case and camelCase
  const executionOutput = jobRequest.execution_output || jobRequest.executionOutput;

  if (!executionOutput) {
    return null;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(executionOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Count lines for display
  const lineCount = executionOutput.split('\n').length;

  return (
    <Card className="mb-8">
      <CardHeader>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <span className="text-lg">🖥️</span>
            <CardTitle>Execution Output</CardTitle>
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
              {lineCount} lines
            </Badge>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground flex items-center justify-between">
              <span>Program stdout output</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy Output
                  </>
                )}
              </button>
            </div>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap">{executionOutput}</pre>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
