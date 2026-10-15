export interface StoredCredentials {
  geminiKey: string;
  vercelToken: string;
}

const GEMINI_KEY = "appbeam.gemini_api_key";
const VERCEL_TOKEN = "appbeam.vercel_token";
const SESSION_KEY = "appbeam.session_id";

/** Fired after credentials change so dependent panels can refresh. */
export const CREDENTIALS_EVENT = "appbeam:credentials-change";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Stable per-browser session id — scopes "the visitor's current app" on the
 * server (patch loop + export) so hosted multi-user instances never mix
 * generated code between visitors.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY) ?? "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = randomId();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function sessionHeader(): Record<string, string> {
  const id = getSessionId();
  return id ? { "x-appbeam-session": id } : {};
}

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
