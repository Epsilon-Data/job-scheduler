// Output files a real-data run writes: the same name rule and type table as the enclave and the coordinator

// A file's name is its path under outputs/: 1 to 5 segments joined by "/", each segment as below
export const OUTPUT_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}){0,4}$/;
export const OUTPUT_FILE_NAME_MAX_LENGTH = 255;

export const isValidOutputFileName = (name: string) =>
  name.length <= OUTPUT_FILE_NAME_MAX_LENGTH && OUTPUT_FILE_NAME.test(name);

export const OUTPUT_FILE_DEFAULT_TYPE = "application/octet-stream";

export const OUTPUT_FILE_TYPES: Readonly<Record<string, string>> = {
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  json: "application/json",
  txt: "text/plain",
  pdf: "application/pdf",
};

// The last segment of a name: the file name a download is saved under
export const outputFileBasename = (name: string) => name.slice(name.lastIndexOf("/") + 1);

// The type a file name maps to by the extension of its last segment; anything else is application/octet-stream
export function outputFileType(name: string): string {
  const base = outputFileBasename(name);
  const dot = base.lastIndexOf(".");
  if (dot < 0) return OUTPUT_FILE_DEFAULT_TYPE;
  const ext = base.slice(dot + 1).toLowerCase();
  // Own keys only, so "constructor" and friends are not types
  return Object.prototype.hasOwnProperty.call(OUTPUT_FILE_TYPES, ext) ? OUTPUT_FILE_TYPES[ext] : OUTPUT_FILE_DEFAULT_TYPE;
}

// A name as a URL path: each segment encoded on its own, the slashes kept as path separators
export const outputFileUrlPath = (name: string) => name.split("/").map(encodeURIComponent).join("/");

export const isImageType = (type: string) => type === "image/png" || type === "image/jpeg";

export type OutputFilePreview = "image" | "csv" | "text" | null;

// How the review page previews a type; null means download only
export function outputFilePreview(type: string): OutputFilePreview {
  if (isImageType(type)) return "image";
  if (type === "text/csv") return "csv";
  if (type === "application/json" || type === "text/plain") return "text";
  return null;
}

export interface ManifestEntry {
  name: string;
  size: number;
  sha256: string;
  type: string;
}

// A held or released file as the API lists it: its manifest entry
export type OutputFileSummary = ManifestEntry;

// Python's json.dumps escapes everything outside ASCII (ensure_ascii=True) as lowercase \uXXXX
const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * The canonical manifest bytes the enclave attests, as text: entries sorted by name, keys in sorted order,
 * no spaces; byte-for-byte json.dumps(manifest, sort_keys=True, separators=(",", ":")).
 */
export function canonicalManifestJson(entries: ManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const items = sorted.map(
    (entry) =>
      `{"name":${asciiJson(entry.name)},"sha256":${asciiJson(entry.sha256)},` +
      `"size":${asciiJson(entry.size)},"type":${asciiJson(entry.type)}}`,
  );
  return `[${items.join(",")}]`;
}
