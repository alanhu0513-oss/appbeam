import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

import {
  extractCredentialOverrides,
  loadConfig,
  runPipeline,
} from "@appbeam/pipeline";
import type { PipelineEvent, PipelineResult } from "@appbeam/pipeline/types";
import {
  parseSessionId,
  saveSessionCode,
} from "@/lib/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upper bound for uploaded binaries (Bytes). */
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

type ServerEvent =
  | { type: "event"; event: PipelineEvent }
  | { type: "done"; result: PipelineResult }
  | { type: "error"; message: string };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * GET /api/simulate — configuration presence (booleans only, never secrets).
 * The dashboard forwards x-gemini-key / x-vercel-token headers, so the
 * reported presence reflects the effective credentials (client or server).
 */
export async function GET(req: Request): Promise<Response> {
  const config = loadConfig(extractCredentialOverrides(req.headers));
  return json({
    mode: config.mode,
    reaMode: config.reaMode,
    model: config.geminiModel,
    projectName: config.vercelProjectName,
    hasGeminiKey: config.geminiApiKey !== null,
    hasVercelToken: config.vercelToken !== null,
    staging: config.staging,
  });
}

/**
 * POST /api/simulate — accepts multipart form data:
 *   file: a binary to hand to REA, or
 *   url:  an app/website URL to investigate.
 *
 * Responds with an SSE stream of pipeline events; the final `done` event
 * carries the live Vercel URL loaded by the dashboard <iframe>.
 */
export async function POST(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json({ error: "Expected multipart form data (file or url field)" }, 400);
  }

  const urlField = formData.get("url");
  const fileField = formData.get("file");
  let target: string | null = null;

  if (typeof urlField === "string" && urlField.trim() !== "") {
    target = urlField.trim();
  } else if (fileField instanceof File && fileField.size > 0) {
    if (fileField.size > MAX_UPLOAD_BYTES) {
      return json({ error: "File exceeds the 80MB upload limit" }, 413);
    }
    const safeName =
      basename(fileField.name).replace(/[^\w.\-]/g, "_").slice(0, 120) ||
      "upload.bin";
    const dir = join(tmpdir(), "appbeam-uploads", randomUUID());
    await mkdir(dir, { recursive: true });
    target = join(dir, safeName);
    await writeFile(target, Buffer.from(await fileField.arrayBuffer()));
  }

  if (!target) {
    return json({ error: "Provide a binary file or an app URL" }, 400);
  }

  // Session-scoped visitors: keep their generated code server-side so the
  // patch loop + export resolve their app, and always deploy from a staged
  // per-run copy so concurrent users never touch the shared template.
  const sessionId = parseSessionId(req.headers.get("x-appbeam-session"));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: ServerEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const result = await runPipeline({
          target: target!,
          config: {
            ...extractCredentialOverrides(req.headers),
            ...(sessionId ? { staging: true } : {}),
          },
          onEvent: (event) => send({ type: "event", event }),
        });
        if (sessionId) {
          await saveSessionCode(sessionId, result.inference.code).catch(
            () => undefined,
          );
        }
        send({ type: "done", result });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
