import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadConfig, type PipelineConfig } from "./config.js";
import { callGeminiModel } from "./gemini.js";
import { extractCode } from "./inference.js";
import { injectCode, resolveEntryFile } from "./inject.js";
import { deployToVercel } from "./vercel.js";
import type { PatchPipelineResult, PatchResult } from "./types.js";

export const PATCH_SYSTEM_PROMPT = [
  "You are patching a single-file Expo React Native Web app (App.tsx).",
  "",
  "Patch contract:",
  "- Reply with exactly ONE fenced TypeScript code block containing the COMPLETE updated App.tsx — never a diff, a snippet, or a partial file.",
  "- Apply exactly the requested modification; preserve everything else (structure, state, styling, comments) unless the change requires touching it.",
  "- The output must compile standalone: export default component, only react/react-native/expo-compatible imports, no local file imports, target iOS and web (react-native-web), safe-area padding, no native-only modules.",
  "- Preserve the API mock layer: every external fetch/axios/XHR endpoint stays intercepted by the in-file mock handler and inline fixtures — no request may ever leave for a real backend.",
  "- Never write prose outside the code block.",
].join("\n");

const REQUEST_CAP = 4_000;
const CODE_CAP = 1_500_000;

/**
 * Offline stand-in for a real patch: stamps the request into the file header
 * so the loop (inject → deploy → iframe refresh) stays demonstrable without
 * a Gemini key. The response reports model "mock" and the UI surfaces it.
 */
function mockPatch(code: string, request: string): string {
  const note = request.replace(/\s+/g, " ").trim().slice(0, 160);
  const stamp =
    `// [appbeam mock patch] request: "${note}"\n` +
    "// set GEMINI_API_KEY on the server or x-gemini-key header for real edits\n";
  return stamp + code;
}

/**
 * Stage — Patch inference. Send the current full file plus the user's
 * natural-language request to Gemini with a patch contract system prompt;
 * returns the complete updated, compilable App.tsx.
 */
export async function runPatch(
  code: string,
  request: string,
  config: PipelineConfig,
): Promise<PatchResult> {
  const startedAt = Date.now();
  const trimmed = request.trim();

  if (!trimmed) {
    throw new Error("Modification request is empty");
  }
  if (trimmed.length > REQUEST_CAP) {
    throw new Error(`Modification request exceeds ${REQUEST_CAP} characters`);
  }
  if (!code.trim()) {
    throw new Error("Nothing to patch — run the pipeline first to generate an app");
  }
  if (code.length > CODE_CAP) {
    throw new Error(
      `Current app code exceeds the ${CODE_CAP} char patch limit — regenerate with a smaller output`,
    );
  }

  if (config.mode === "mock" || !config.geminiApiKey) {
    if (config.mode === "real" && !config.geminiApiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Create one at https://aistudio.google.com/apikey",
      );
    }
    return {
      code: mockPatch(code, trimmed),
      model: "mock",
      durationMs: Date.now() - startedAt,
    };
  }

  const raw = await callGeminiModel({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    systemInstruction: PATCH_SYSTEM_PROMPT,
    temperature: 0.25,
    contents: [
      "Current App.tsx:",
      "",
      "```tsx",
      code,
      "```",
      "",
      "Modification request:",
      trimmed,
    ].join("\n"),
  });

  const patched = extractCode(raw);
  if (!/export\s+default|registerRootComponent|AppRegistry/.test(patched)) {
    throw new Error(
      "Patch output has no `export default` — keeping the previous code",
    );
  }

  return {
    code: patched,
    model: config.geminiModel,
    durationMs: Date.now() - startedAt,
  };
}

export interface PatchPipelineOptions {
  /** Current app source; falls back to the template's entry file when omitted. */
  code?: string;
  request: string;
  config?: Partial<PipelineConfig>;
  onProgress?: (message: string) => void;
}

/** Same policy as `runPipeline`: deploy only with a token and mock mode off. */
function deployEnabled(cfg: PipelineConfig): boolean {
  return cfg.mode !== "mock" && cfg.vercelToken !== null;
}

async function readCurrentCode(config: PipelineConfig): Promise<string> {
  const entry = resolveEntryFile(config.templateDir);
  try {
    return await readFile(join(config.templateDir, entry), "utf8");
  } catch {
    throw new Error(
      `Could not read the current app (${entry}) — run the pipeline first`,
    );
  }
}

/**
 * Prompt-to-patch loop: infer the full updated file, inject it into the
 * simulator template, then redeploy the existing Vercel project so the
 * dashboard iframe can refresh against the same live URL.
 */
export async function runPatchPipeline(
  options: PatchPipelineOptions,
): Promise<PatchPipelineResult> {
  const startedAt = Date.now();
  const progress = options.onProgress ?? (() => undefined);
  const config = loadConfig(options.config);

  const current = options.code?.trim()
    ? options.code
    : await readCurrentCode(config);

  progress(
    `patching with ${config.geminiApiKey ? config.geminiModel : "mock inference"}`,
  );
  const patch = await runPatch(current, options.request, config);

  progress("injecting patched code into the simulator template");
  const injection = await injectCode(patch.code, config);

  try {
    if (!deployEnabled(config)) {
      progress(
        "mock deploy — patch applied locally (set VERCEL_TOKEN or x-vercel-token to redeploy)",
      );
      return {
        code: patch.code,
        model: patch.model,
        deployed: false,
        url: "",
        deploymentId: "mock",
        projectName: config.vercelProjectName,
        entryFile: injection.entryFile,
        durationMs: Date.now() - startedAt,
      };
    }

    progress(`redeploying project "${config.vercelProjectName}"`);
    const deployment = await deployToVercel({
      sourceDir: injection.sourceDir,
      projectName: config.vercelProjectName,
      token: config.vercelToken!,
      teamId: config.vercelTeamId,
      timeoutMs: config.vercelDeployTimeoutMs,
      artifactDir: null,
      onLog: progress,
    });

    return {
      code: patch.code,
      model: patch.model,
      deployed: true,
      url: deployment.url,
      deploymentId: deployment.deploymentId,
      projectName: deployment.projectName,
      entryFile: injection.entryFile,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await injection.cleanup();
  }
}
