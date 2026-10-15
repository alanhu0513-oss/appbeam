import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Per-visitor app state for hosted (multi-user) instances.
 *
 * Each browser generates a UUID (localStorage) and sends it as the
 * `x-appbeam-session` header / `?session=` query param. The last generated
 * App.tsx for that session is kept on the server so the patch loop and the
 * export zip can resolve "the visitor's current app" without reading the
 * shared simulator template. TTL-pruned; no accounts, no cookies.
 */

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CODE_BYTES = 1_500_000;

function sessionsDir(): string {
  return join(tmpdir(), "appbeam-sessions");
}

function fileFor(id: string): string {
  return join(sessionsDir(), `${id}.tsx`);
}

/** Lenient validation — invalid ids are treated as "no session". */
export function parseSessionId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const id = raw.trim();
  return ID_RE.test(id) ? id : null;
}

async function pruneExpired(dir: string): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const now = Date.now();
  await Promise.all(
    entries.map(async (name) => {
      const path = join(dir, name);
      try {
        const info = await stat(path);
        if (now - info.mtimeMs > TTL_MS) await unlink(path);
      } catch {
        /* raced with another worker — fine */
      }
    }),
  );
}

export async function saveSessionCode(
  id: string,
  code: string,
): Promise<void> {
  if (!ID_RE.test(id) || code.length === 0) return;
  if (code.length > MAX_CODE_BYTES) return;
  const dir = sessionsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(fileFor(id), code, "utf8");
  await pruneExpired(dir);
}

export async function readSessionCode(id: string): Promise<string | null> {
  if (!ID_RE.test(id)) return null;
  const path = fileFor(id);
  try {
    const [code, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    if (Date.now() - info.mtimeMs > TTL_MS) {
      await unlink(path).catch(() => undefined);
      return null;
    }
    return code.length > 0 ? code : null;
  } catch {
    return null;
  }
}
