import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineMode, ReaMode } from "./types.js";

function loadRootEnv(): void {
  const root = findRepoRoot();
  if (!root) return;
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function hasMarker(dir: string): boolean {
  return (
    existsSync(join(dir, "pnpm-workspace.yaml")) ||
    existsSync(join(dir, "apps", "simulator-template"))
  );
}

function walkUp(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (hasMarker(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function findRepoRoot(): string | null {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return walkUp(moduleDir) ?? walkUp(process.cwd());
}

export function findTemplateDir(): string {
  const fromEnv = process.env.SIMULATOR_TEMPLATE_DIR;
  if (fromEnv) return resolve(fromEnv);
  const root = findRepoRoot();
  if (root) {
    const candidate = join(root, "apps", "simulator-template");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Could not locate apps/simulator-template. Set SIMULATOR_TEMPLATE_DIR to an absolute path.",
  );
}

function str(value: string | undefined, fallback: string): string {
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface PipelineConfig {
  mode: PipelineMode;
  geminiApiKey: string | null;
  geminiModel: string;
  geminiMaxPayloadChars: number;
  vercelToken: string | null;
  vercelTeamId: string | null;
  vercelProjectName: string;
  vercelDeployTimeoutMs: number;
  reaMode: ReaMode;
  reaCommand: string;
  reaArgs: string[];
  reaTimeoutMs: number;
  templateDir: string;
  staging: boolean;
}

loadRootEnv();

export function loadConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const mode = (str(process.env.PIPELINE_MODE, "auto") as PipelineMode) ?? "auto";
  const configuredRea = str(process.env.REA_MODE, "cli");
  const reaMode: ReaMode =
    configuredRea === "mcp" || configuredRea === "mock" ? configuredRea : "cli";

  return {
    mode,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    geminiModel: str(process.env.GEMINI_MODEL, "gemini-1.5-pro"),
    geminiMaxPayloadChars: int(process.env.GEMINI_MAX_PAYLOAD_CHARS, 400_000),
    vercelToken: process.env.VERCEL_TOKEN?.trim() || null,
    vercelTeamId: process.env.VERCEL_TEAM_ID?.trim() || null,
    vercelProjectName: str(process.env.VERCEL_PROJECT_NAME, "appbeam-preview"),
    vercelDeployTimeoutMs: int(process.env.VERCEL_DEPLOY_TIMEOUT_MS, 600_000),
    reaMode,
    reaCommand: str(process.env.REA_COMMAND, "npx -y rea-agents@latest"),
    reaArgs: (process.env.REA_ARGS ?? "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
    reaTimeoutMs: int(process.env.REA_TIMEOUT_MS, 600_000),
    templateDir: findTemplateDir(),
    staging: process.env.PIPELINE_STAGING === "1",
    ...overrides,
  };
}

export function isAbsolutePath(p: string): boolean {
  return isAbsolute(p);
}
