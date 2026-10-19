import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import type { Server } from "http";
import * as h from "./helpers";
import {
  canonicalManifestJson,
  isValidOutputFileName,
  outputFileBasename,
  outputFilePreview,
  outputFileType,
  outputFileUrlPath,
} from "@shared/outputFiles";
import {
  OutputFileIntegrityError,
  localOutputFileStore,
  manifestSha256,
  outputFileStoreFromEnv,
  readVerifiedOutputFile,
  setOutputFileStore,
  sha256Hex,
  type OutputFileStore,
} from "../outputFiles";

const databaseUrl = inject("databaseUrl");

const CSV = Buffer.from("a,b\n1,2\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rw-output-files-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe("canonical file manifest", () => {
  // Known answers from the contract's Python: json.dumps(manifest, sort_keys=True, separators=(",", ":"))
  it("hashes an empty manifest as sha256 of []", () => {
    expect(canonicalManifestJson([])).toBe("[]");
    expect(manifestSha256([])).toBe("4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
  });

  it("sorts entries by name and keys alphabetically, without spaces", () => {
    const entries = [
      { name: "plot.png", size: PNG.length, sha256: sha256Hex(PNG), type: "image/png" },
      { name: "counts.csv", size: CSV.length, sha256: sha256Hex(CSV), type: "text/csv" },
    ];
    expect(canonicalManifestJson(entries)).toBe(
      '[{"name":"counts.csv","sha256":"492d5ea496056f1a6a6592241032fab764c321596317930b4fa0e1e8bc3b7470","size":8,"type":"text/csv"},' +
        '{"name":"plot.png","sha256":"4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6","size":8,"type":"image/png"}]',
    );
    expect(manifestSha256(entries)).toBe("42d0d3e01e0f68b214735feb113846107efb816e8676b97ea44cc1fbcee3e8f0");
  });

  it("escapes non-ASCII like Python's ensure_ascii", () => {
    expect(canonicalManifestJson([{ name: "é", size: 0, sha256: "x", type: "t" }])).toBe(
      '[{"name":"\\u00e9","sha256":"x","size":0,"type":"t"}]',
    );
  });

  it("hashes the subfolder and unknown-type vector, sorted by code point", () => {
    const files = [
      { name: "plots/fig.bin", bytes: Buffer.from([0x00, 0x01, 0x02]) },
      { name: "notes", bytes: Buffer.from("hi\n") },
      { name: "a.csv", bytes: Buffer.from("x,y\n1,2\n") },
    ];
    const entries = files.map((file) => ({
      name: file.name,
      size: file.bytes.length,
      sha256: sha256Hex(file.bytes),
      type: outputFileType(file.name),
    }));
    expect(canonicalManifestJson(entries)).toBe(
      '[{"name":"a.csv","sha256":"81bf9fa83c6f7f151bd491a98cd7d933de3965289e3ebd77c6c425f7eaa16392","size":8,"type":"text/csv"},' +
        '{"name":"notes","sha256":"98ea6e4f216f2fb4b69fff9b3a44842c38686ca685f3f55dc48c5d3fb1107be4","size":3,"type":"application/octet-stream"},' +
        '{"name":"plots/fig.bin","sha256":"ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc","size":3,"type":"application/octet-stream"}]',
    );
    expect(manifestSha256(entries)).toBe("49f15dcc85c70e4712ab20edd5e118eb3ea2526e264da93628522a3a6c456907");
  });

  it("sorts by code point, not locale: upper case before lower case", () => {
    const entry = (name: string) => ({ name, size: 0, sha256: "x", type: "t" });
    const names = JSON.parse(canonicalManifestJson([entry("b"), entry("a/b"), entry("B"), entry("a.b")]))
      .map((e: { name: string }) => e.name);
    expect(names).toEqual(["B", "a.b", "a/b", "b"]);
  });

  it("maps the last segment's extension with the contract's type table, anything else to octet-stream", () => {
    expect(outputFileType("a.CSV")).toBe("text/csv");
    expect(outputFileType("a.jpeg")).toBe("image/jpeg");
    expect(outputFileType("plots/fig.png")).toBe("image/png");
    expect(outputFileType("report.pdf")).toBe("application/pdf");
    expect(outputFileType("a.html")).toBe("application/octet-stream");
    expect(outputFileType("noext")).toBe("application/octet-stream");
    expect(outputFileType("data.csv/raw")).toBe("application/octet-stream");
    expect(outputFileType("x.constructor")).toBe("application/octet-stream");
  });

  it("previews only images, CSV, JSON and plain text", () => {
    expect(outputFilePreview("image/png")).toBe("image");
    expect(outputFilePreview("image/jpeg")).toBe("image");
    expect(outputFilePreview("text/csv")).toBe("csv");
    expect(outputFilePreview("application/json")).toBe("text");
    expect(outputFilePreview("text/plain")).toBe("text");
    expect(outputFilePreview("application/pdf")).toBeNull();
    expect(outputFilePreview("application/octet-stream")).toBeNull();
  });
});

describe("output file names", () => {
  it("accepts relative paths of up to 5 segments and 255 characters", () => {
    for (const name of ["a", "counts.csv", "plots/fig1.png", "a/b/c/d/e.txt", "A-1_x.y", `${"a".repeat(100)}/b`]) {
      expect(isValidOutputFileName(name), name).toBe(true);
    }
    expect(isValidOutputFileName(Array(3).fill("a".repeat(84)).join("/"))).toBe(true); // 254 characters
  });

  it("rejects dot segments, hidden files, empty segments, depth over 5 and length over 255", () => {
    for (const name of [
      "",
      ".",
      "..",
      "../a.csv",
      "a/../b",
      "a/./b",
      ".hidden",
      "plots/.hidden",
      "/abs",
      "a/",
      "a//b",
      "a\\b",
      "a b",
      "é.csv",
      "a/b/c/d/e/f",
      "a".repeat(101),
      Array(3).fill("a".repeat(100)).join("/"),
    ]) {
      expect(isValidOutputFileName(name), name).toBe(false);
    }
  });

  it("downloads under the basename and encodes each segment of the URL path", () => {
    expect(outputFileBasename("plots/fig1.png")).toBe("fig1.png");
    expect(outputFileBasename("notes")).toBe("notes");
    expect(outputFileUrlPath("plots/fig1.png")).toBe("plots/fig1.png");
    expect(outputFileUrlPath("a/b-c_d.e")).toBe("a/b-c_d.e");
  });
});

describe("output file store", () => {
  it("local store: round trip under OUTPUT_FILES_DIR, verified on read", async () => {
    const dir = tempDir();
    const store = outputFileStoreFromEnv({ OUTPUT_FILES_STORE: "local", OUTPUT_FILES_DIR: dir })!;
    const key = `jobs/JOB-1/${sha256Hex(CSV)}`;
    await store.put(key, CSV, "text/csv");

    expect(fs.readFileSync(path.join(dir, key))).toEqual(CSV);
    expect(await readVerifiedOutputFile(store, { storageKey: key, sha256: sha256Hex(CSV), size: CSV.length })).toEqual(CSV);
  });

  it("refuses bytes that do not match the recorded sha256 or size", async () => {
    const store = localOutputFileStore(tempDir());
    const key = `jobs/JOB-2/${sha256Hex(CSV)}`;
    await store.put(key, Buffer.from("tampered"), "text/csv");

    await expect(readVerifiedOutputFile(store, { storageKey: key, sha256: sha256Hex(CSV), size: CSV.length }))
      .rejects.toBeInstanceOf(OutputFileIntegrityError);
  });

  it("refuses keys that leave the store directory", async () => {
    const store = localOutputFileStore(tempDir());
    await expect(store.get("../outside")).rejects.toThrow(/escapes the store/);
  });

  it("is unconfigured without OUTPUT_FILES_STORE, a bucket or a directory", () => {
    expect(outputFileStoreFromEnv({})).toBeNull();
    expect(outputFileStoreFromEnv({ OUTPUT_FILES_STORE: "local" })).toBeNull();
    expect(outputFileStoreFromEnv({ OUTPUT_FILES_STORE: "s3" })).toBeNull();
    expect(outputFileStoreFromEnv({ OUTPUT_FILES_STORE: "s3", OUTPUT_FILES_BUCKET: "b", AWS_REGION: "ap-southeast-2" }))
      .not.toBeNull();
  });
});

describe.skipIf(!databaseUrl)("output files API (database tests, need TEST_DATABASE_URL)", () => {
  let server: Server;
  let reviewer: string;
  let store: OutputFileStore;
  let storeDir: string;

  beforeAll(async () => {
    await h.assertThrowawayDatabase();
    server = await h.listen(await h.createTestApp());
    reviewer = await h.createUser("reviewer");
    storeDir = tempDir();
    store = localOutputFileStore(storeDir);
  });

  afterEach(() => setOutputFileStore(store));

  afterAll(async () => {
    setOutputFileStore(undefined);
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await h.closeDatabase();
  });

  const get = (urlPath: string, userId: string) => request(server).get(urlPath).set(h.TEST_USER_HEADER, userId);
  // File bodies as raw bytes, whatever their type
  const download = (urlPath: string, userId: string) =>
    get(urlPath, userId)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
  const decide = (jobId: string, body: object, userId = reviewer) =>
    request(server).post(`/api/review/jobs/${jobId}/decision`).send(body).set(h.TEST_USER_HEADER, userId);

  // A held job whose run wrote a CSV and a PNG; file names carry a marker so their absence can be checked
  async function heldJobWithFiles() {
    const userId = await h.createUser("user");
    const workspaceId = await h.createWorkspace(userId);
    const jobId = await h.createJob({ userId, workspaceId });
    const tag = randomUUID().slice(0, 8);
    const files: h.HeldFile[] = [
      { name: `counts-${tag}.csv`, bytes: CSV, type: "text/csv" },
      { name: `plot-${tag}.png`, bytes: PNG, type: "image/png" },
    ];
    setOutputFileStore(store);
    const outputSha256 = await h.completeWithHeldOutput(jobId, { kind: "result", content: "n=8\n", files, store });
    return { userId, workspaceId, jobId, files, tag, outputSha256, manifest: h.fileManifestSha256(files) };
  }

  it("reviewer sees the file list and the manifest hash, and downloads verified bytes", async () => {
    const { jobId, files, manifest } = await heldJobWithFiles();

    const detail = await get(`/api/review/jobs/${jobId}`, reviewer);
    expect(detail.status).toBe(200);
    expect(detail.body.files_manifest_sha256).toBe(manifest);
    expect(detail.body.files_manifest_matches).toBe(true);
    expect(detail.body.files).toEqual(
      files.map((file) => ({ name: file.name, size: file.bytes.length, type: file.type, sha256: sha256Hex(file.bytes) })),
    );

    const csv = await download(`/api/review/jobs/${jobId}/files/${files[0].name}?inline=1`, reviewer);
    expect(csv.status).toBe(200);
    expect(csv.body).toEqual(CSV);
    expect(csv.headers["content-type"]).toMatch(/^text\/csv/);
    expect(csv.headers["x-content-type-options"]).toBe("nosniff");
    expect(csv.headers["content-security-policy"]).toBe("sandbox");
    // Only images are ever inline
    expect(csv.headers["content-disposition"]).toBe(`attachment; filename="${files[0].name}"`);

    const png = await download(`/api/review/jobs/${jobId}/files/${files[1].name}?inline=1`, reviewer);
    expect(png.status).toBe(200);
    expect(png.body).toEqual(PNG);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.headers["content-disposition"]).toBe(`inline; filename="${files[1].name}"`);

    const attachment = await download(`/api/review/jobs/${jobId}/files/${files[1].name}`, reviewer);
    expect(attachment.headers["content-disposition"]).toBe(`attachment; filename="${files[1].name}"`);

    expect((await get(`/api/review/jobs/${jobId}/files/missing.csv`, reviewer)).status).toBe(404);
  });

  it("a reviewer of another project gets 404, a reviewer's own job 403, on file download", async () => {
    const { jobId, files } = await heldJobWithFiles();
    const outsider = await h.createUser("reviewer", "approved", { projects: [randomUUID()] });
    const outside = await get(`/api/review/jobs/${jobId}/files/${files[0].name}`, outsider);
    expect(outside.status).toBe(404);
    expect(outside.body.code).toBe("NOT_FOUND");

    // A reviewer who submitted the job (the trigger stops them deciding it; the routes stop them reading it)
    const workspaceId = await h.createWorkspace(reviewer);
    const ownJob = await h.createJob({ userId: reviewer, workspaceId });
    await h.completeWithHeldOutput(ownJob, { kind: "result", content: "own\n", files, store });
    const own = await get(`/api/review/jobs/${ownJob}/files/${files[0].name}`, reviewer);
    expect(own.status).toBe(403);
    expect(own.body.code).toBe("OWN_JOB");
  });

  it("a decision must carry the manifest hash the reviewer saw (RG004)", async () => {
    const { jobId, outputSha256, manifest } = await heldJobWithFiles();

    const missing = await decide(jobId, { decision: "approve", output_sha256: outputSha256 });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe("STALE_OUTPUT");

    const wrong = await decide(jobId, { decision: "approve", output_sha256: outputSha256, files_manifest_sha256: "0".repeat(64) });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe("STALE_OUTPUT");

    // The trigger enforces it on its own, past the app's check
    await expect(
      h.query(
        `INSERT INTO release_decisions (job_id, decision, output_sha256, reviewer_id, files_manifest_sha256)
         VALUES ($1, 'approve', $2, $3, NULL)`,
        [jobId, outputSha256, reviewer],
      ),
    ).rejects.toMatchObject({ code: "RG004" });

    const right = await decide(jobId, { decision: "approve", output_sha256: outputSha256, files_manifest_sha256: manifest });
    expect(right.status).toBe(201);
    expect(right.body.decision.files_manifest_sha256).toBe(manifest);
    const { rows } = await h.query("SELECT files_manifest_sha256 FROM release_decisions WHERE job_id = $1", [jobId]);
    expect(rows[0].files_manifest_sha256).toBe(manifest);
  });

  it("file rows and the manifest hash are fixed once decided (RG010), replaceable before", async () => {
    const { jobId, outputSha256, manifest, files } = await heldJobWithFiles();
    const extraRow = (name: string) =>
      h.query(
        `INSERT INTO job_output_files (job_id, name, size, content_type, sha256, storage_key)
         VALUES ($1, $2, 1, 'text/plain', $3, 'k')`,
        [jobId, name, "a".repeat(64)],
      );

    // Undecided: a re-run may replace the files
    await extraRow("extra.txt");
    await h.query("DELETE FROM job_output_files WHERE job_id = $1 AND name = 'extra.txt'", [jobId]);

    expect((await decide(jobId, {
      decision: "reject",
      reason: "no",
      output_sha256: outputSha256,
      files_manifest_sha256: manifest,
    })).status).toBe(201);

    await expect(extraRow("late.txt")).rejects.toMatchObject({ code: "RG010" });
    await expect(h.query("UPDATE job_output_files SET size = 0 WHERE job_id = $1", [jobId]))
      .rejects.toMatchObject({ code: "RG010" });
    await expect(h.query("DELETE FROM job_output_files WHERE job_id = $1", [jobId]))
      .rejects.toMatchObject({ code: "RG010" });
    await expect(h.query("UPDATE job_outputs SET files_manifest_sha256 = NULL WHERE job_id = $1", [jobId]))
      .rejects.toMatchObject({ code: "RG010" });
    expect((await h.query("SELECT count(*)::int AS n FROM job_output_files WHERE job_id = $1", [jobId])).rows[0].n)
      .toBe(files.length);
  });

  it("researchers see nothing about files before release and can download them after", async () => {
    const { userId, workspaceId, jobId, files, tag, outputSha256, manifest } = await heldJobWithFiles();

    const bodies = await Promise.all([
      get(`/api/jobs/${jobId}`, userId),
      get("/api/jobs", userId),
      get("/api/user/jobs?limit=100", userId),
      get(`/api/workspaces/${workspaceId}/jobs`, userId),
    ]);
    for (const response of bodies) {
      expect(response.status).toBe(200);
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(tag);
      expect(text).not.toContain(manifest);
    }
    expect(bodies[0].body).not.toHaveProperty("files");
    expect(bodies[0].body).not.toHaveProperty("files_manifest_sha256");
    expect((await get(`/api/jobs/${jobId}/files/${files[0].name}`, userId)).status).toBe(404);

    expect((await decide(jobId, { decision: "approve", output_sha256: outputSha256, files_manifest_sha256: manifest })).status)
      .toBe(201);

    const detail = await get(`/api/jobs/${jobId}`, userId);
    expect(detail.body.files_manifest_sha256).toBe(manifest);
    expect(detail.body.files.map((file: { name: string }) => file.name)).toEqual(files.map((file) => file.name));

    const released = await download(`/api/jobs/${jobId}/files/${files[0].name}`, userId);
    expect(released.status).toBe(200);
    expect(released.body).toEqual(CSV);
    expect(released.headers["content-disposition"]).toBe(`attachment; filename="${files[0].name}"`);

    // Another researcher gets nothing
    const other = await h.createUser("user");
    expect((await get(`/api/jobs/${jobId}/files/${files[0].name}`, other)).status).toBe(403);
  });

  it("a withheld job's files stay unavailable to the researcher", async () => {
    const { userId, jobId, files, outputSha256, manifest } = await heldJobWithFiles();
    await decide(jobId, { decision: "reject", reason: "small cells", output_sha256: outputSha256, files_manifest_sha256: manifest });

    expect((await get(`/api/jobs/${jobId}`, userId)).body).not.toHaveProperty("files");
    expect((await get(`/api/jobs/${jobId}/files/${files[0].name}`, userId)).status).toBe(404);
  });

  it("refuses to serve bytes whose sha256 does not match, and answers 503 without a store", async () => {
    const { jobId, files } = await heldJobWithFiles();
    fs.writeFileSync(path.join(storeDir, `jobs/${jobId}/${sha256Hex(CSV)}`), "a,b\n6,6\n");

    const tampered = await get(`/api/review/jobs/${jobId}/files/${files[0].name}`, reviewer);
    expect(tampered.status).toBe(502);
    expect(tampered.body.code).toBe("FILE_INTEGRITY");
    expect(tampered.text).not.toContain("6,6");

    setOutputFileStore(null);
    const unconfigured = await get(`/api/review/jobs/${jobId}/files/${files[1].name}`, reviewer);
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.body.code).toBe("FILE_STORE_UNAVAILABLE");
  });

  // A held job whose files sit in subfolders and include types that are never previewed
  async function heldJobWithFolders() {
    const userId = await h.createUser("user");
    const jobId = await h.createJob({ userId, workspaceId: await h.createWorkspace(userId) });
    const files: h.HeldFile[] = [
      { name: "plots/2024/fig.png", bytes: PNG, type: "image/png" },
      { name: "tables/counts.csv", bytes: CSV, type: "text/csv" },
      { name: "model.bin", bytes: Buffer.from([0x00, 0x01, 0x02]), type: "application/octet-stream" },
      { name: "notes", bytes: Buffer.from("<script>alert(1)</script>"), type: "application/octet-stream" },
      { name: "report.pdf", bytes: Buffer.from("%PDF-1.4\n"), type: "application/pdf" },
    ];
    setOutputFileStore(store);
    const outputSha256 = await h.completeWithHeldOutput(jobId, { kind: "result", content: "n=8\n", files, store });
    return { userId, jobId, files, outputSha256, manifest: h.fileManifestSha256(files) };
  }

  it("reviewer downloads files in subfolders under their basename", async () => {
    const { jobId } = await heldJobWithFolders();

    const detail = await get(`/api/review/jobs/${jobId}`, reviewer);
    expect(detail.body.files.map((file: { name: string }) => file.name))
      .toEqual(["model.bin", "notes", "plots/2024/fig.png", "report.pdf", "tables/counts.csv"]);
    expect(detail.body.files_manifest_matches).toBe(true);

    const png = await download(`/api/review/jobs/${jobId}/files/plots/2024/fig.png?inline=1`, reviewer);
    expect(png.status).toBe(200);
    expect(png.body).toEqual(PNG);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.headers["content-disposition"]).toBe('inline; filename="fig.png"');

    // Encoded slashes name the same file
    const csv = await download(`/api/review/jobs/${jobId}/files/tables%2Fcounts.csv`, reviewer);
    expect(csv.status).toBe(200);
    expect(csv.body).toEqual(CSV);
    expect(csv.headers["content-disposition"]).toBe('attachment; filename="counts.csv"');
    expect(csv.headers["x-content-type-options"]).toBe("nosniff");
    expect(csv.headers["content-security-policy"]).toBe("sandbox");
    expect(csv.headers["cache-control"]).toBe("private, no-store");

    expect((await get(`/api/review/jobs/${jobId}/files/plots/missing.png`, reviewer)).status).toBe(404);
  });

  it("serves unknown types as octet-stream attachments and never shows a PDF inline", async () => {
    const { jobId } = await heldJobWithFolders();

    for (const name of ["model.bin", "notes"]) {
      const file = await download(`/api/review/jobs/${jobId}/files/${name}?inline=1`, reviewer);
      expect(file.status).toBe(200);
      expect(file.headers["content-type"]).toBe("application/octet-stream");
      expect(file.headers["content-disposition"]).toBe(`attachment; filename="${name}"`);
      expect(file.headers["x-content-type-options"]).toBe("nosniff");
      expect(file.headers["content-security-policy"]).toBe("sandbox");
    }

    const pdf = await download(`/api/review/jobs/${jobId}/files/report.pdf?inline=1`, reviewer);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe('attachment; filename="report.pdf"');
  });

  it("answers 400 to names that break the rule, before reading the database or the store", async () => {
    const { userId, jobId, outputSha256, manifest } = await heldJobWithFolders();
    expect((await decide(jobId, { decision: "approve", output_sha256: outputSha256, files_manifest_sha256: manifest })).status)
      .toBe(201);

    let reads = 0;
    setOutputFileStore({
      get: (key) => {
        reads += 1;
        return store.get(key);
      },
      put: (key, bytes, type) => store.put(key, bytes, type),
    });

    const bad = [
      "..",
      "%2E%2E",
      "plots/..",
      "plots/%2E%2E/report.pdf",
      ".hidden",
      "plots/.hidden",
      "a//b",
      "a/b/c/d/e/f",
      Array(3).fill("a".repeat(100)).join("/"),
      "a".repeat(101),
      "%00",
    ];
    for (const name of bad) {
      for (const [urlPath, user] of [
        [`/api/review/jobs/${jobId}/files/${name}`, reviewer],
        [`/api/jobs/${jobId}/files/${name}`, userId],
      ]) {
        const response = await get(urlPath, user);
        expect(response.status, urlPath).toBe(400);
        expect(response.headers["content-disposition"]).toBeUndefined();
      }
    }
    expect((await get(`/api/review/jobs/${jobId}/files/.hidden`, reviewer)).body.code).toBe("INVALID_FILE_NAME");
    expect(reads).toBe(0);
  });

  it("released researchers download files in subfolders", async () => {
    const { userId, jobId, outputSha256, manifest } = await heldJobWithFolders();
    expect((await get(`/api/jobs/${jobId}/files/plots/2024/fig.png`, userId)).status).toBe(404);

    expect((await decide(jobId, { decision: "approve", output_sha256: outputSha256, files_manifest_sha256: manifest })).status)
      .toBe(201);

    const png = await download(`/api/jobs/${jobId}/files/plots/2024/fig.png`, userId);
    expect(png.status).toBe(200);
    expect(png.body).toEqual(PNG);
    expect(png.headers["content-disposition"]).toBe('attachment; filename="fig.png"');

    const bin = await download(`/api/jobs/${jobId}/files/model.bin`, userId);
    expect(bin.body).toEqual(Buffer.from([0x00, 0x01, 0x02]));
    expect(bin.headers["content-type"]).toBe("application/octet-stream");
    expect(bin.headers["content-disposition"]).toBe('attachment; filename="model.bin"');
  });

  it("the database refuses names that break the rule", async () => {
    const { jobId } = await heldJobWithFolders();
    const insert = (name: string) =>
      h.query(
        `INSERT INTO job_output_files (job_id, name, size, content_type, sha256, storage_key)
         VALUES ($1, $2, 1, 'application/octet-stream', $3, 'k')`,
        [jobId, name, "a".repeat(64)],
      );
    await insert("a/b/c/d/e.bin");
    for (const name of ["../x", ".hidden", "a//b", "a/b/c/d/e/f", Array(3).fill("a".repeat(100)).join("/")]) {
      await expect(insert(name), name).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|22001)$/) });
    }
  });

  it("a job without files keeps a null manifest and is decided without one", async () => {
    const userId = await h.createUser("user");
    const jobId = await h.createJob({ userId, workspaceId: await h.createWorkspace(userId) });
    const outputSha256 = await h.completeWithHeldOutput(jobId, { kind: "result", content: "legacy\n" });

    const detail = await get(`/api/review/jobs/${jobId}`, reviewer);
    expect(detail.body).toMatchObject({ files: [], files_manifest_sha256: null, files_manifest_matches: null });
    expect((await decide(jobId, { decision: "approve", output_sha256: outputSha256, files_manifest_sha256: null })).status)
      .toBe(201);
  });
});
