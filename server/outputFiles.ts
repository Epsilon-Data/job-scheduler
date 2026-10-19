import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import type { Request, Response } from "express";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { JobOutputFile } from "@shared/schema";
import {
  canonicalManifestJson,
  isImageType,
  isValidOutputFileName,
  outputFileBasename,
  outputFileType,
  type ManifestEntry,
} from "@shared/outputFiles";

/**
 * Output files of real-data runs. The coordinator writes the bytes to the store (OUTPUT_FILES_STORE = s3 | local)
 * under job_output_files.storage_key; this server only reads them, and never serves bytes whose SHA-256 differs
 * from the recorded one.
 */

export const sha256Hex = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

// files_manifest_sha256 of a set of files: the hash the enclave attests
export const manifestSha256 = (entries: ManifestEntry[]) => sha256Hex(Buffer.from(canonicalManifestJson(entries), "utf8"));

export interface OutputFileStore {
  get(key: string): Promise<Buffer>;
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
}

export class OutputFileIntegrityError extends Error {
  constructor(key: string) {
    super(`Output file ${key} does not match its recorded SHA-256`);
    this.name = "OutputFileIntegrityError";
  }
}

export function localOutputFileStore(root: string): OutputFileStore {
  const base = path.resolve(root);
  const resolve = (key: string) => {
    const file = path.resolve(base, key);
    if (!file.startsWith(base + path.sep)) throw new Error(`Output file key escapes the store: ${key}`);
    return file;
  };
  return {
    async get(key) {
      return fs.readFile(resolve(key));
    },
    async put(key, bytes) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
    },
  };
}

export function s3OutputFileStore(options: { bucket: string; region?: string; kmsKeyId?: string; client?: S3Client }): OutputFileStore {
  // Credentials come from the default AWS chain (instance role in production)
  const client = options.client ?? new S3Client(options.region ? { region: options.region } : {});
  return {
    async get(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }));
      if (!object.Body) throw new Error(`Output file ${key} has no body`);
      return Buffer.from(await object.Body.transformToByteArray());
    },
    async put(key, bytes, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ...(options.kmsKeyId ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: options.kmsKeyId } : {}),
      }));
    },
  };
}

// null when no store is configured: files are then unavailable, never served from anywhere else
export function outputFileStoreFromEnv(env: NodeJS.ProcessEnv = process.env): OutputFileStore | null {
  switch (env.OUTPUT_FILES_STORE) {
    case "s3":
      if (!env.OUTPUT_FILES_BUCKET) return null;
      return s3OutputFileStore({
        bucket: env.OUTPUT_FILES_BUCKET,
        region: env.AWS_REGION || undefined,
        kmsKeyId: env.OUTPUT_FILES_KMS_KEY_ID || undefined,
      });
    case "local":
      return env.OUTPUT_FILES_DIR ? localOutputFileStore(env.OUTPUT_FILES_DIR) : null;
    default:
      return null;
  }
}

let configuredStore: OutputFileStore | null | undefined;

export function getOutputFileStore(): OutputFileStore | null {
  if (configuredStore === undefined) configuredStore = outputFileStoreFromEnv();
  return configuredStore;
}

// Tests swap the store; undefined goes back to the environment
export function setOutputFileStore(store: OutputFileStore | null | undefined) {
  configuredStore = store;
}

export async function readVerifiedOutputFile(
  store: OutputFileStore,
  file: Pick<JobOutputFile, "storageKey" | "sha256" | "size">,
): Promise<Buffer> {
  const bytes = await store.get(file.storageKey);
  if (bytes.length !== file.size || sha256Hex(bytes) !== file.sha256) {
    throw new OutputFileIntegrityError(file.storageKey);
  }
  return bytes;
}

export function toFileSummary(file: JobOutputFile) {
  return { name: file.name, size: file.size, type: file.contentType, sha256: file.sha256 };
}

/**
 * The file name of a download route (its wildcard, so names may hold "/"), or null after answering 400 when it
 * breaks the name rule: such a name is never looked up in the database or the store
 */
export function requestedOutputFileName(req: Request, res: Response): string | null {
  const name = (req.params as Record<string, string | undefined>)[0] ?? "";
  if (!isValidOutputFileName(name)) {
    res.status(400).json({ message: "Invalid file name", code: "INVALID_FILE_NAME" });
    return null;
  }
  return name;
}

/**
 * Sends one held or released file after checking its bytes against the recorded SHA-256. Only images may be
 * shown inline (for previews); everything else is a download, and nothing is sniffed or run as a page.
 */
export async function sendOutputFile(res: Response, file: JobOutputFile, inline: boolean): Promise<void> {
  const store = getOutputFileStore();
  if (!store) {
    res.status(503).json({ message: "Output files are not available on this server", code: "FILE_STORE_UNAVAILABLE" });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = await readVerifiedOutputFile(store, file);
  } catch (error) {
    console.error(`Output file ${file.jobId}/${file.name} not served:`, (error as Error).message);
    if (error instanceof OutputFileIntegrityError) {
      res.status(502).json({ message: "The stored file does not match its recorded SHA-256", code: "FILE_INTEGRITY" });
    } else {
      res.status(502).json({ message: "The file could not be read from storage", code: "FILE_UNAVAILABLE" });
    }
    return;
  }

  const type = outputFileType(file.name) === file.contentType ? file.contentType : "application/octet-stream";
  res.set({
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Cache-Control": "private, no-store",
    // Name segments are restricted to [A-Za-z0-9._-], so the basename needs no quoting beyond this
    "Content-Disposition": `${inline && isImageType(type) ? "inline" : "attachment"}; filename="${outputFileBasename(file.name)}"`,
  });
  res.send(bytes);
}
