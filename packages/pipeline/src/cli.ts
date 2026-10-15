#!/usr/bin/env node
import { runPipeline } from "./pipeline.js";
import { PipelineError, type PipelineEvent } from "./types.js";

const USAGE = `appbeam pipeline

Usage:
  pnpm run pipeline simulate <binary-or-url> [flags]

Flags:
  --mode <auto|real|mock>   Override PIPELINE_MODE (default: auto)
  --project <name>          Override VERCEL_PROJECT_NAME
  --staging                 Inject into a temp copy of the simulator template
  --json                    Emit JSON lines instead of formatted events

Examples:
  pnpm run pipeline simulate ./sample.apk
  pnpm run pipeline simulate https://example.com/app --mode real
`;

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function formatEvent(event: PipelineEvent): string {
  const icon =
    event.status === "done"
      ? "✓"
      : event.status === "error"
        ? "✗"
        : event.status === "warning"
          ? "!"
          : "…";
  return `${icon} [${event.stage.padEnd(10)}] ${event.message}`;
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === "help" || flags.help) {
    process.stdout.write(USAGE);
    process.exit(command ? 0 : 1);
  }
  if (command !== "simulate") {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    process.exit(1);
  }
  const target = positional[1];
  if (!target) {
    process.stderr.write(`Missing <binary-or-url>.\n\n${USAGE}`);
    process.exit(1);
  }

  const json = flags.json === true;
  const result = await runPipeline({
    target,
    config: {
      ...(typeof flags.mode === "string"
        ? { mode: flags.mode as "auto" | "real" | "mock" }
        : {}),
      ...(typeof flags.project === "string"
        ? { vercelProjectName: flags.project }
        : {}),
      ...(flags.staging === true ? { staging: true } : {}),
    },
    onEvent: (event) => {
      process.stdout.write(
        (json ? JSON.stringify(event) : formatEvent(event)) + "\n",
      );
    },
  });

  if (json) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else {
    process.stdout.write(
      `\nentry:  ${result.entryFile}\n` +
        `model:  ${result.inference.model}\n` +
        `mode:   ${result.effectiveMode}\n` +
        `url:    ${result.url || "(mock — no deployment)"}\n` +
        `took:   ${(result.durationMs / 1000).toFixed(1)}s\n`,
    );
  }
}

main().catch((err: unknown) => {
  if (err instanceof PipelineError) {
    process.stderr.write(`\n[${err.stage}] ${err.message}\n`);
    if (err.cause instanceof Error && err.cause.message !== err.message) {
      process.stderr.write(`  caused by: ${err.cause.message}\n`);
    }
  } else {
    process.stderr.write(`\n${err instanceof Error ? err.stack : String(err)}\n`);
  }
  process.exit(1);
});
