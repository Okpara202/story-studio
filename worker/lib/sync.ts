import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ObjectStore } from "../../src/server/storage/types.ts";

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export const contentTypeFor = (file: string) => TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/** Download every object under `prefix` into `dir`, keeping relative paths. Returns the count. */
export async function downloadPrefix(store: ObjectStore, prefix: string, dir: string): Promise<number> {
  const { keys } = await store.list(prefix);
  for (const key of keys) await store.getToFile(key, path.join(dir, ...key.slice(prefix.length).split("/")));
  return keys.length;
}

/**
 * Make `prefix` in storage match local folder `dir`: upload every local file,
 * delete remote files that no longer exist locally. Hidden files are skipped.
 */
export async function mirrorDir(store: ObjectStore, dir: string, prefix: string): Promise<{ uploaded: number; deleted: number }> {
  const local = await listFiles(dir);
  for (const rel of local) await store.putFile(prefix + rel, path.join(dir, ...rel.split("/")), contentTypeFor(rel));
  const keep = new Set(local.map((rel) => prefix + rel));
  const { keys } = await store.list(prefix);
  const stale = keys.filter((k) => !keep.has(k));
  for (const key of stale) await store.delete(key);
  return { uploaded: local.length, deleted: stale.length };
}

async function listFiles(dir: string, base = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}
