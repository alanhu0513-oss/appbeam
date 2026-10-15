import type { PipelineConfig } from "./config.js";

/**
 * Request headers the dashboard sends so users can bring their own
 * credentials instead of relying on server-side `.env` secrets.
 */
export const GEMINI_KEY_HEADER = "x-gemini-key";
export const VERCEL_TOKEN_HEADER = "x-vercel-token";
export const VERCEL_TEAM_HEADER = "x-vercel-team-id";

interface HeaderSource {
  get(name: string): string | null;
}

function isHeaderSource(
  source: unknown,
): source is HeaderSource {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as HeaderSource).get === "function"
  );
}

function readHeader(
  headers: HeaderSource | Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  if (isHeaderSource(headers)) {
    const value = headers.get(name);
    return value && value.trim() !== "" ? value.trim() : null;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record[name] ?? record[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.trim() !== "" ? value.trim() : null;
}

/**
 * Extract per-request credential overrides from HTTP headers.
 *
 * Only present, non-empty headers become overrides — an absent header
 * leaves `loadConfig()` to fall back to server `process.env` values, so
 * the pipeline works with client keys, server keys, or a mix of both.
 * Returned values are never logged; treat them as secrets.
 */
export function extractCredentialOverrides(
  headers: HeaderSource | Record<string, string | string[] | undefined>,
): Partial<PipelineConfig> {
  const overrides: Partial<PipelineConfig> = {};

  const geminiApiKey = readHeader(headers, GEMINI_KEY_HEADER);
  if (geminiApiKey) overrides.geminiApiKey = geminiApiKey;

  const vercelToken = readHeader(headers, VERCEL_TOKEN_HEADER);
  if (vercelToken) overrides.vercelToken = vercelToken;

  const vercelTeamId = readHeader(headers, VERCEL_TEAM_HEADER);
  if (vercelTeamId) overrides.vercelTeamId = vercelTeamId;

  return overrides;
}
