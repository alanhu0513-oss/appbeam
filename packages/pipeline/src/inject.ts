import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PipelineConfig } from "./config.js";

const ENTRY_CANDIDATES = ["App.tsx", "App.ts", "App.jsx", "App.js"];
const STAGE_IGNORE = new Set([
  "node_modules",
  ".git",
  ".expo",
  ".next",
  "dist",
  "coverage",
  ".appbeam",
  ".turbo",
]);

export function resolveEntryFile(templateDir: string): string {
  const fromEnv = process.env.SIMULATOR_ENTRY_FILE;
  if (fromEnv) return join(templateDir, fromEnv);
  for (const candidate of ENTRY_CANDIDATES) {
    if (existsSync(join(templateDir, candidate))) return candidate;
  }
  return "App.tsx";
}

function assertValidGeneratedCode(code: string): void {
  if (code.length < 80) {
    throw new Error(
      `Inference produced implausibly small output (${code.length} chars) — refusing to inject.`,
    );
  }
  if (!/export\s+default/.test(code) && !/registerRootComponent|AppRegistry/.test(code)) {
    throw new Error(
      "Inference output has no `export default` — refusing to inject a non-component file.",
    );
  }
}

export interface InjectionResult {
  entryFile: string;
  bytes: number;
  /** Directory to deploy; equals templateDir unless PIPELINE_STAGING=1. */
  sourceDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Stage 3 — Code Injection. Overwrite the simulator template's App entry file
 * with Gemini's raw output (in place by default, optionally into a per-run
 * staging copy so concurrent runs never race on the shared template).
 */
export async function injectCode(
  code: string,
  config: PipelineConfig,
): Promise<InjectionResult> {
  assertValidGeneratedCode(code);

  const entryFile = resolveEntryFile(config.templateDir);
  const noop = () => Promise.resolve();

  if (config.staging) {
    const stagingRoot = join(tmpdir(), "appbeam");
    await mkdir(stagingRoot, { recursive: true });
    const sourceDir = await mkdtemp(join(stagingRoot, "sim-"));
    await cp(config.templateDir, sourceDir, {
      recursive: true,
      filter: (src) => !STAGE_IGNORE.has(src.split(/[/\\]/).pop() ?? ""),
    });
    const target = join(sourceDir, entryFile);
    await writeFile(target, code, "utf8");
    return {
      entryFile,
      bytes: Buffer.byteLength(code, "utf8"),
      sourceDir,
      cleanup: () => rm(sourceDir, { recursive: true, force: true }),
    };
  }

  const target = join(config.templateDir, entryFile);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, code, "utf8");
  return {
    entryFile,
    bytes: Buffer.byteLength(code, "utf8"),
    sourceDir: config.templateDir,
    cleanup: noop,
  };
}
