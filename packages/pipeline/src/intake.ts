import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import type { PipelineConfig } from "./config.js";
import type { IntakeResult } from "./types.js";

const MOCK_PAYLOAD = `# REA evidence (fixture mode)

Target: uploaded artifact
Provider: mock (PIPELINE_MODE=auto / REA_MODE=mock)

## Observed behavior

- **App shell**: a bottom-tab navigator with three surfaces — Home, Search, Settings.
- **Home**: pull-to-refresh feed; cards render {id, title, thumbnail, meta}; tapping a card pushes a detail screen with a hero image and a sticky action bar.
- **Search**: debounced query (250ms) against a local JSON index; results are grouped by kind (people / places / notes); empty state offers three suggested queries.
- **Settings**: toggle rows for notifications and appearance (system / light / dark), plus an account row that opens a modal sign-in form (email + password, optimistic session).
- **State**: session token held in AsyncStorage; feed cache keyed by page cursor; mutations optimistic with rollback on failure.
- **Networking**: GET /api/feed?page=, GET /api/search?q=, POST /api/session; JSON envelopes {data, error}.
- **Edge cases**: offline banner when the network probe fails; 401 clears the session and redirects to sign-in; pagination stops at hasMore=false.

## Extracted UI structure

| Region | Element | Notes |
| --- | --- | --- |
| Header | app title + avatar | avatar opens Settings |
| Body | flat list of cards | 16px gutters, 12px gaps |
| Detail | hero (16:9), title, body, CTA | sticky CTA above safe area |
| Tab bar | 3 icons + labels | active tint follows theme |

## Evidence pointers

- navigator route table recovered from the bundle router config.
- fetch wrappers found around the three endpoints above.
- styles reference a spacing scale of 4/8/12/16/24.
`;

function splitCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0] ?? "rea";
  return { cmd, args: parts.slice(1) };
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, code });
    });
  });
}

async function runCli(target: string, config: PipelineConfig): Promise<string> {
  const { cmd, args } = splitCommand(config.reaCommand);
  const argv = [...args, "analyze", target, ...config.reaArgs];
  const { stdout, stderr, code } = await runProcess(cmd, argv, {
    timeoutMs: config.reaTimeoutMs,
  });

  if (code !== 0) {
    throw new Error(
      `REA CLI exited with code ${code}: ${(stderr || stdout).slice(0, 2000)}`,
    );
  }
  const payload = stdout.trim();
  if (!payload) {
    throw new Error(
      `REA CLI produced no output. stderr: ${stderr.slice(0, 2000)}`,
    );
  }
  return payload;
}

interface McpContent {
  type?: string;
  text?: string;
}

async function runMcp(target: string, config: PipelineConfig): Promise<string> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const { cmd, args } = splitCommand(config.reaCommand);
  const transport = new StdioClientTransport({
    command: cmd,
    args: [...args, "mcp"],
    env: process.env as Record<string, string>,
    stderr: "ignore",
  });
  const client = new Client({ name: "appbeam-pipeline", version: "0.1.0" });

  const timer = setTimeout(() => {
    void client.close().catch(() => undefined);
  }, config.reaTimeoutMs);

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    if (!tools.length) throw new Error("REA MCP server advertised no tools");

    const preferred =
      tools.find((t) => /analyze/i.test(t.name)) ??
      tools.find((t) => /overview|inspect|examine/i.test(t.name)) ??
      tools[0]!;

    const schema = preferred.inputSchema as
      | { properties?: Record<string, unknown>; required?: string[] }
      | undefined;
    const propertyNames = Object.keys(schema?.properties ?? {});
    const pathProperty =
      propertyNames.find((n) => /^(target|path|file|url|input)$/i.test(n)) ??
      propertyNames.find((n) => /path|target|file|url/i.test(n));

    const toolArgs: Record<string, unknown> = {};
    if (pathProperty) toolArgs[pathProperty] = resolve(target);
    if (schema?.required?.includes("provider") && !("provider" in toolArgs)) {
      toolArgs.provider = "auto";
    }

    const result = await client.callTool({
      name: preferred.name,
      arguments: toolArgs,
    });
    const content = (result.content ?? []) as McpContent[];
    const text = content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n")
      .trim();
    if (!text) {
      throw new Error(`REA MCP tool ${preferred.name} returned no text content`);
    }
    return text;
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => undefined);
  }
}

/**
 * Stage 1 — Intake. Feed a binary/URL to morluto/rea (CLI or its local MCP
 * server) and collect the reverse-engineered evidence payload.
 */
export async function runIntake(
  target: string,
  config: PipelineConfig,
): Promise<IntakeResult> {
  const startedAt = Date.now();

  if (config.reaMode === "mock" || config.mode === "mock") {
    return {
      source: "mock",
      payload: MOCK_PAYLOAD,
      durationMs: Date.now() - startedAt,
    };
  }

  // `analyze` expects an existing local path; URLs are passed through as-is.
  if (!/^https?:\/\//i.test(target)) {
    const absolute = resolve(target);
    await access(absolute, constants.R_OK).catch((err: unknown) => {
      throw new Error(
        `Intake target is not readable: ${absolute} (${(err as Error).message})`,
      );
    });
    target = absolute;
  }

  try {
    const payload =
      config.reaMode === "mcp"
        ? await runMcp(target, config)
        : await runCli(target, config);
    return {
      source: config.reaMode === "mcp" ? "rea-mcp" : "rea-cli",
      payload,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    if (config.mode === "real") throw err;
    // auto/mock: degrade to the fixture payload so the demo still completes.
    return {
      source: "mock",
      payload: MOCK_PAYLOAD,
      durationMs: Date.now() - startedAt,
    };
  }
}
