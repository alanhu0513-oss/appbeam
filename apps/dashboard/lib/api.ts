export interface StoredCredentials {
  geminiKey: string;
  vercelToken: string;
}

const GEMINI_KEY = "appbeam.gemini_api_key";
const VERCEL_TOKEN = "appbeam.vercel_token";

/** Fired after credentials change so dependent panels can refresh. */
export const CREDENTIALS_EVENT = "appbeam:credentials-change";

export function getStoredCredentials(): StoredCredentials {
  if (typeof window === "undefined") return { geminiKey: "", vercelToken: "" };
  return {
    geminiKey: window.localStorage.getItem(GEMINI_KEY) ?? "",
    vercelToken: window.localStorage.getItem(VERCEL_TOKEN) ?? "",
  };
}

export function setStoredCredentials(next: StoredCredentials): void {
  if (typeof window === "undefined") return;
  const geminiKey = next.geminiKey.trim();
  const vercelToken = next.vercelToken.trim();
  if (geminiKey) window.localStorage.setItem(GEMINI_KEY, geminiKey);
  else window.localStorage.removeItem(GEMINI_KEY);
  if (vercelToken) window.localStorage.setItem(VERCEL_TOKEN, vercelToken);
  else window.localStorage.removeItem(VERCEL_TOKEN);
  window.dispatchEvent(new Event(CREDENTIALS_EVENT));
}

/**
 * Headers attached to every pipeline request so the server can use the
 * user's own Gemini/Vercel credentials (falling back to its .env).
 */
export function credentialHeaders(): Record<string, string> {
  const { geminiKey, vercelToken } = getStoredCredentials();
  const headers: Record<string, string> = {};
  if (geminiKey) headers["x-gemini-key"] = geminiKey;
  if (vercelToken) headers["x-vercel-token"] = vercelToken;
  return headers;
}
