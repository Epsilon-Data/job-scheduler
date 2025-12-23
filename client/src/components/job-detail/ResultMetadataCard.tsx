import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, GitBranch, GitCommit, Database, FolderOpen } from "lucide-react";
import type { JobRequest } from "@shared/schema";

interface ResultMetadataCardProps {
  jobRequest: JobRequest;
}

// Type for parsed result_metadata
interface ResultMetadata {
  remote_url?: string;
  branch?: string;
  commit_hash?: string;
  commit_message?: string;
  commit_author?: string;
  commit_date?: string;
  storage_info?: {
    base_path?: string;
    repositories_count?: number;
    total_size_mb?: number;
  };
  original_branch?: string;
  original_commit_sha?: string;
  cloned_branch?: string;
  cloned_commit_hash?: string;
}

export function ResultMetadataCard({ jobRequest }: ResultMetadataCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get result_metadata - handle both snake_case and camelCase
  const rawMetadata = jobRequest.result_metadata || jobRequest.resultMetadata;

  if (!rawMetadata) {
    return null;
  }

  // Parse the metadata
  let metadata: ResultMetadata | null = null;
  try {
    metadata = typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata;
  } catch {
    // If parsing fails, we'll show raw content
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <span className="text-lg">📊</span>
            <CardTitle>Result Metadata</CardTitle>
            <Badge variant="outline" className="text-xs">
              {metadata ? 'PARSED' : 'RAW'}
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
          {metadata ? (
            <ParsedMetadataDisplay metadata={metadata} />
          ) : (
            <RawMetadataDisplay rawMetadata={rawMetadata} />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ParsedMetadataDisplay({ metadata }: { metadata: ResultMetadata }) {
  return (
    <div className="space-y-4">
      {/* Repository Info */}
      {metadata.remote_url && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-3 flex items-center">
            <GitBranch className="h-4 w-4 mr-2" />
            Repository Information
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoItem label="Remote URL" value={metadata.remote_url} />
            <InfoItem label="Branch" value={metadata.branch || metadata.cloned_branch} />
          </div>
        </div>
      )}

      {/* Commit Info */}
      {(metadata.commit_hash || metadata.cloned_commit_hash) && (
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <h4 className="font-semibold text-purple-800 mb-3 flex items-center">
            <GitCommit className="h-4 w-4 mr-2" />
            Commit Information
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoItem
              label="Commit Hash"
              value={metadata.commit_hash || metadata.cloned_commit_hash}
              mono
            />
            <InfoItem label="Author" value={metadata.commit_author} />
            <InfoItem label="Date" value={metadata.commit_date} className="md:col-span-2" />
            {metadata.commit_message && (
              <div className="md:col-span-2">
                <span className="text-xs text-purple-600 font-medium">Message:</span>
                <p className="text-sm text-purple-900 mt-1 bg-white p-2 rounded border">
                  {metadata.commit_message}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Storage Info */}
      {metadata.storage_info && (
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h4 className="font-semibold text-green-800 mb-3 flex items-center">
            <Database className="h-4 w-4 mr-2" />
            Storage Information
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <InfoItem
              label="Base Path"
              value={metadata.storage_info.base_path}
              mono
            />
            <InfoItem
              label="Repositories"
              value={metadata.storage_info.repositories_count?.toString()}
            />
            <InfoItem
              label="Total Size"
              value={metadata.storage_info.total_size_mb !== undefined
                ? `${metadata.storage_info.total_size_mb.toFixed(2)} MB`
                : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Original vs Cloned comparison (if different) */}
      {metadata.original_commit_sha &&
       metadata.cloned_commit_hash &&
       metadata.original_commit_sha !== metadata.cloned_commit_hash && (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h4 className="font-semibold text-yellow-800 mb-3 flex items-center">
            <FolderOpen className="h-4 w-4 mr-2" />
            Clone Verification
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoItem
              label="Original SHA"
              value={metadata.original_commit_sha}
              mono
            />
            <InfoItem
              label="Cloned SHA"
              value={metadata.cloned_commit_hash}
              mono
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono = false,
  className = ""
}: {
  label: string;
  value?: string;
  mono?: boolean;
  className?: string;
}) {
  if (!value) return null;

  return (
    <div className={className}>
      <span className="text-xs text-gray-600 font-medium">{label}:</span>
      <p className={`text-sm text-gray-900 mt-0.5 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function RawMetadataDisplay({ rawMetadata }: { rawMetadata: string }) {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border">
      <h4 className="font-medium text-gray-700 mb-2">Raw Metadata:</h4>
      <pre className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap">
        {typeof rawMetadata === 'string' ? rawMetadata : JSON.stringify(rawMetadata, null, 2)}
      </pre>
    </div>
  );
}
