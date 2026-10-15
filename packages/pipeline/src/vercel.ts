import { ZipArchive } from "archiver";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findRepoRoot } from "./config.js";

const API = "https://api.vercel.com";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  ".next",
  ".turbo",
  ".appbeam",
  "dist",
  "coverage",
]);
const SKIP_FILES = new Set([".DS_Store", ".env", ".env.local"]);

export interface DeployOptions {
  sourceDir: string;
  projectName: string;
  token: string;
  teamId?: string | null;
  installCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  target?: "production" | "staging";
  timeoutMs?: number;
  /** Write a local zip artifact of the mutated template (null to skip). */
  artifactDir?: string | null;
  onLog?: (message: string) => void;
}

export interface DeployOutcome {
  url: string;
  deploymentId: string;
  projectName: string;
  fileCount: number;
  artifactPath: string | null;
}

interface PushFile {
  file: string;
  data: Buffer;
  sha1: string;
  size: number;
}

/** Total raw bytes below which we inline files (base64 inflates ~4/3). */
const INLINE_LIMIT_BYTES = 2_500_000;

async function walk(root: string, prefix = ""): Promise<PushFile[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: PushFile[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(root, rel)));
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      const data = await readFile(join(root, rel));
      files.push({
        file: rel,
        data,
        sha1: createHash("sha1").update(data).digest("hex"),
        size: data.byteLength,
      });
    }
  }
  return files;
}

async function zipFiles(files: PushFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", () => undefined);
    archive.on("error", (err) => reject(err));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    for (const file of files) {
      archive.append(file.data, { name: file.file });
    }
    void archive.finalize();
  });
}

interface VercelError {
  error?: { code?: string; message?: string };
}

async function vercelFetch(
  path: string,
  opts: {
    token: string;
    teamId?: string | null;
    method?: string;
    body?: unknown;
    raw?: { data: Buffer; sha1: string };
  },
): Promise<Response> {
  const url = new URL(API + path);
  if (opts.teamId) url.searchParams.set("teamId", opts.teamId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  let body: string | Uint8Array | undefined;
  if (opts.raw) {
    headers["Content-Type"] = "application/octet-stream";
    headers["x-vercel-digest"] = opts.raw.sha1;
    headers["x-now-digest"] = opts.raw.sha1;
    headers["x-now-size"] = String(opts.raw.data.byteLength);
    body = new Uint8Array(opts.raw.data);
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method: opts.method ?? "POST", headers, body });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const payload = (await res.json()) as VercelError;
      if (payload.error?.message) detail = `${detail}: ${payload.error.message}`;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Vercel API ${opts.method ?? "POST"} ${path} failed — ${detail}`);
  }
  return res;
}

/**
 * Create the Vercel project if it does not exist yet (Projects API).
 */
export async function ensureProject(opts: {
  name: string;
  token: string;
  teamId?: string | null;
}): Promise<string> {
  try {
    const res = await vercelFetch("/v9/projects", {
      token: opts.token,
      teamId: opts.teamId,
      body: { name: opts.name },
    });
    const project = (await res.json()) as { id?: string };
    return project.id ?? opts.name;
  } catch (err) {
    // 409 = project already exists; fetch it instead.
    if (err instanceof Error && /failed — 409/.test(err.message)) {
      const res = await vercelFetch(`/v9/projects/${opts.name}`, {
        token: opts.token,
        teamId: opts.teamId,
        method: "GET",
      });
      const project = (await res.json()) as { id?: string };
      return project.id ?? opts.name;
    }
    throw err;
  }
}

interface DeploymentStatus {
  id?: string;
  readyState?: string;
  url?: string;
  errorMessage?: string | null;
  errorCode?: string | null;
}

async function waitForReady(
  deploymentId: string,
  opts: DeployOptions,
): Promise<DeploymentStatus> {
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const deadline = Date.now() + timeoutMs;
  let lastState = "";

  while (Date.now() < deadline) {
    const res = await vercelFetch(`/v13/deployments/${deploymentId}`, {
      token: opts.token,
      teamId: opts.teamId,
      method: "GET",
    });
    const status = (await res.json()) as DeploymentStatus;
    const state = status.readyState ?? "UNKNOWN";
    if (state !== lastState) {
      lastState = state;
      opts.onLog?.(`deployment ${state.toLowerCase()}`);
    }
    if (state === "READY") return status;
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(
        `Vercel deployment ${state}: ${status.errorMessage ?? status.errorCode ?? "unknown build failure"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(
    `Vercel deployment did not reach READY within ${timeoutMs}ms (last state: ${lastState || "unknown"})`,
  );
}

/**
 * Automated Vercel deployment:
 *  1. ensure the project exists (Projects API),
 *  2. zip the mutated template as a local artifact,
 *  3. push the file set (inline or via the /v2/files upload API),
 *  4. create a production deployment (POST /v13/deployments) and poll to READY,
 *  5. return the live static URL for the dashboard <iframe>.
 */
export async function deployToVercel(opts: DeployOptions): Promise<DeployOutcome> {
  const log = opts.onLog ?? (() => undefined);

  await ensureProject({
    name: opts.projectName,
    token: opts.token,
    teamId: opts.teamId,
  });
  log(`project "${opts.projectName}" ready`);

  const files = await walk(opts.sourceDir);
  if (files.length === 0) {
    throw new Error(`No deployable files found in ${opts.sourceDir}`);
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  let artifactPath: string | null = null;
  if (opts.artifactDir !== null) {
    const dir =
      opts.artifactDir ?? join(findRepoRoot() ?? opts.sourceDir, ".appbeam", "artifacts");
    await mkdir(dir, { recursive: true });
    const zip = await zipFiles(files);
    artifactPath = join(dir, `${opts.projectName}-${Date.now()}.zip`);
    await writeFile(artifactPath, zip);
    log(`zipped ${files.length} files -> ${artifactPath}`);
  }

  const fileEntries: Array<Record<string, unknown>> = [];
  if (totalBytes <= INLINE_LIMIT_BYTES) {
    for (const file of files) {
      fileEntries.push({
        file: file.file,
        data: file.data.toString("base64"),
        encoding: "base64",
      });
    }
    log(`inlining ${files.length} files (${totalBytes} bytes)`);
  } else {
    const CONCURRENCY = 6;
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      await Promise.all(
        files.slice(i, i + CONCURRENCY).map((file) =>
          vercelFetch("/v2/files", {
            token: opts.token,
            teamId: opts.teamId,
            raw: { data: file.data, sha1: file.sha1 },
          }),
        ),
      );
    }
    for (const file of files) {
      fileEntries.push({ file: file.file, sha: file.sha1, size: file.size });
    }
    log(`uploaded ${files.length} files to the Vercel file API`);
  }

  const createRes = await vercelFetch(
    `/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1`,
    {
      token: opts.token,
      teamId: opts.teamId,
      body: {
        name: opts.projectName,
        target: opts.target ?? "production",
        files: fileEntries,
        projectSettings: {
          rootDirectory: null,
          installCommand: opts.installCommand ?? "npm install",
          buildCommand: opts.buildCommand ?? "npx expo export --platform web",
          outputDirectory: opts.outputDirectory ?? "dist",
        },
      },
    },
  );
  const created = (await createRes.json()) as DeploymentStatus & { id?: string };
  if (!created.id) {
    throw new Error("Vercel create-deployment response contained no id");
  }
  log(`deployment ${created.id} created (${created.readyState ?? "QUEUED"})`);

  const ready = await waitForReady(created.id, opts);
  const host = (ready.url ?? created.url ?? "").replace(/^https?:\/\//, "");
  if (!host) {
    throw new Error("Vercel deployment is READY but returned no URL");
  }
  const url = `https://${host}`;
  log(`live at ${url}`);

  return {
    url,
    deploymentId: created.id,
    projectName: opts.projectName,
    fileCount: files.length,
    artifactPath,
  };
}
