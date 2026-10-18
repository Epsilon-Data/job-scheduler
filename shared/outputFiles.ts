// Output files a real-data run writes: the same name rule and type table as the enclave and the coordinator

export const OUTPUT_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export const OUTPUT_FILE_TYPES: Readonly<Record<string, string>> = {
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  json: "application/json",
  txt: "text/plain",
  pdf: "application/pdf",
};

// The type a file name maps to, or null when its extension is not allowed
export function outputFileType(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return OUTPUT_FILE_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

export const isImageType = (type: string) => type === "image/png" || type === "image/jpeg";

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
