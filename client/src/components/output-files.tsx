import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ChevronDown, ChevronRight, Download, FileText, X } from "lucide-react";
import { formatBytes } from "@/lib/job-utils";
import { parseCsv } from "@/lib/csv";
import { outputFileBasename, outputFilePreview, outputFileUrlPath, type OutputFilePreview } from "@shared/outputFiles";
import type { OutputFileSummary } from "@/types/job";

const CSV_PREVIEW_ROWS = 100;
const TEXT_PREVIEW_CHARS = 100_000;

async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  // crypto.subtle exists only in secure contexts; the server has already checked the hash
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetches a file with the session cookie and checks its bytes against the listed SHA-256 before use
 */
async function fetchFile(url: string, file: OutputFileSummary): Promise<Blob> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).message ?? message;
    } catch {}
    throw new Error(message || `Download failed (${res.status})`);
  }
  const bytes = await res.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (hash !== null && hash !== file.sha256) {
    throw new Error("The downloaded file does not match its SHA-256");
  }
  return new Blob([bytes], { type: file.type });
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface OutputFilesCardProps {
  files: OutputFileSummary[];
  manifestSha256: string | null;
  // Base of the download route, e.g. /api/review/jobs/JOB-1/files
  filesUrl: string;
  title: string;
  description?: string;
  preview?: boolean; // reviewers preview files in the page
  manifestMatches?: boolean | null;
}

export function OutputFilesCard({
  files,
  manifestSha256,
  filesUrl,
  title,
  description,
  preview = false,
  manifestMatches,
}: OutputFilesCardProps) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {files.length} {files.length === 1 ? "file" : "files"}, {formatBytes(files.reduce((sum, f) => sum + f.size, 0))}
          </span>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted rounded-lg p-4">The run wrote no files.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {files.map((file) => (
              <OutputFileRow
                key={file.name}
                file={file}
                url={`${filesUrl}/${outputFileUrlPath(file.name)}`}
                preview={preview}
              />
            ))}
          </div>
        )}
        {manifestSha256 && (
          <div className="space-y-2 pt-2 border-t">
            {manifestMatches === true && (
              <Badge variant="outline" className="text-green-700 border-green-300 text-xs gap-1">
                <CheckCircle className="h-3 w-3" /> The files match the recorded manifest
              </Badge>
            )}
            {manifestMatches === false && (
              <Badge variant="outline" className="text-red-700 border-red-300 text-xs gap-1">
                <X className="h-3 w-3" /> The files do not match the recorded manifest
              </Badge>
            )}
            <p className="text-xs text-muted-foreground">
              Files manifest SHA-256 <span className="font-mono break-all">{manifestSha256}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutputFileRow({ file, url, preview }: { file: OutputFileSummary; url: string; preview: boolean }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewKind = outputFilePreview(file.type);
  const canPreview = preview && previewKind !== null;

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      saveBlob(await fetchFile(url, file), outputFileBasename(file.name));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-left disabled:cursor-default"
            onClick={() => setOpen(!open)}
            disabled={!canPreview}
          >
            {canPreview ? (
              open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="break-all">{file.name}</span>
          </button>
          <p className="text-xs text-muted-foreground mt-0.5">
            {file.type}, {formatBytes(file.size)}
          </p>
          <p className="text-xs text-muted-foreground">
            SHA-256 <span className="font-mono break-all">{file.sha256}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
          <Download className="h-3.5 w-3.5 mr-1" />
          {downloading ? "Downloading..." : "Download"}
        </Button>
      </div>
      {preview && previewKind === null && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded px-3 py-1.5">
          This file type cannot be previewed — download and inspect it with care before approving.
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 rounded px-3 py-1.5">{error}</p>}
      {canPreview && open && previewKind && <FilePreview file={file} url={url} kind={previewKind} />}
    </div>
  );
}

type PreviewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "image"; src: string }
  | { kind: "csv"; rows: string[][]; truncated: boolean }
  | { kind: "text"; text: string; truncated: boolean };

function FilePreview({ file, url, kind }: { file: OutputFileSummary; url: string; kind: NonNullable<OutputFilePreview> }) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      const image = kind === "image";
      const blob = await fetchFile(image ? `${url}?inline=1` : url, file);
      if (cancelled) return;
      if (image) {
        objectUrl = URL.createObjectURL(blob);
        setState({ kind: "image", src: objectUrl });
        return;
      }
      const text = await blob.text();
      if (cancelled) return;
      if (kind === "csv") {
        setState({ kind: "csv", ...parseCsv(text, CSV_PREVIEW_ROWS) });
        return;
      }
      let shown = text;
      if (file.type === "application/json") {
        try {
          shown = JSON.stringify(JSON.parse(text), null, 2);
        } catch {}
      }
      setState({ kind: "text", text: shown.slice(0, TEXT_PREVIEW_CHARS), truncated: shown.length > TEXT_PREVIEW_CHARS });
    })().catch((e: Error) => {
      if (!cancelled) setState({ kind: "error", message: e.message });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, file.sha256, kind]);

  switch (state.kind) {
    case "loading":
      return <p className="text-xs text-muted-foreground">Loading preview...</p>;
    case "error":
      return <p className="text-xs text-red-700 bg-red-50 rounded px-3 py-1.5">{state.message}</p>;
    case "image":
      return (
        <div className="bg-muted rounded-lg p-2">
          <img src={state.src} alt={file.name} className="max-h-[32rem] max-w-full mx-auto" />
        </div>
      );
    case "csv":
      return (
        <div className="space-y-1">
          <div className="overflow-auto max-h-[32rem] border rounded-lg">
            <table className="text-xs font-mono">
              <tbody>
                {state.rows.map((row, r) => (
                  <tr key={r} className={r === 0 ? "bg-muted font-semibold" : "border-t"}>
                    {row.map((cell, c) => (
                      <td key={c} className="px-2 py-1 whitespace-pre align-top">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.truncated && (
            <p className="text-xs text-muted-foreground">
              First {CSV_PREVIEW_ROWS} rows shown; download the file to see all of it.
            </p>
          )}
        </div>
      );
    case "text":
      return (
        <div className="space-y-1">
          <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-auto max-h-[32rem] whitespace-pre">
            {state.text}
          </pre>
          {state.truncated && (
            <p className="text-xs text-muted-foreground">Preview truncated; download the file to see all of it.</p>
          )}
        </div>
      );
  }
}
