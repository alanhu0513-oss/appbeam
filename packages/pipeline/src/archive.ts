import { ZipArchive } from "archiver";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ArchiveFile {
  file: string;
  data: Buffer;
}

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  ".next",
  ".turbo",
  ".appbeam",
  "dist",
  "coverage",
]);

export const SKIP_FILES = new Set([".DS_Store", ".env", ".env.local"]);

/**
 * Recursively collect a directory's files (relative POSIX paths), skipping
 * build output, VCS metadata, and secret-bearing `.env*` files. Single
 * source of truth for everything zipped — Vercel artifacts and exports.
 */
export async function walkFiles(
  root: string,
  prefix = "",
): Promise<ArchiveFile[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: ArchiveFile[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walkFiles(root, rel)));
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      files.push({ file: rel, data: await readFile(join(root, rel)) });
    }
  }
  return files;
}

/** Serialize a file set into a standard DEFLATE zip buffer. */
export function zipFiles(files: ArchiveFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", () => undefined);
    archive.on("error", (err) => reject(err));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    for (const file of files) {
      archive.append(file.data, { name: file.file });
    }
    void archive.finalize();
  });
}

/** Convenience: zip a directory tree in one call. */
export async function zipDirectory(root: string): Promise<Buffer> {
  return zipFiles(await walkFiles(root));
}
