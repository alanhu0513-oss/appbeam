import { extractCredentialOverrides, runPatchPipeline } from "@appbeam/pipeline";
import type { PatchPipelineResult } from "@appbeam/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_CAP = 4_000;
const CODE_CAP = 1_500_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * POST /api/patch-code — prompt-to-patch loop.
 *
 * Body: { code?: string, request: string }
 *   code:    the existing App.tsx source (falls back to the template entry)
 *   request: natural-language modification ("make the theme dark mode")
 *
 * Credentials arrive via headers (x-gemini-key / x-vercel-token) and take
 * precedence over server .env. Responds with the patched source plus the
 * redeploy outcome; the dashboard refreshes its <iframe> when deployed.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { code?: unknown; request?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected a JSON body: { code, request }" }, 400);
  }

  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (!request) {
    return json({ error: "Missing modification request" }, 400);
  }
  if (request.length > REQUEST_CAP) {
    return json(
      { error: `Modification request exceeds ${REQUEST_CAP} characters` },
      413,
    );
  }

  let code: string | undefined;
  if (body.code !== undefined && body.code !== null) {
    if (typeof body.code !== "string") {
      return json({ error: "`code` must be a string" }, 400);
    }
    if (body.code.length > CODE_CAP) {
      return json({ error: `App code exceeds ${CODE_CAP} characters` }, 413);
    }
    code = body.code.trim() ? body.code : undefined;
  }

  try {
    const result: PatchPipelineResult = await runPatchPipeline({
      code,
      request,
      config: extractCredentialOverrides(req.headers),
    });
    return json(result);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}
