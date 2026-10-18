import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ListResult, ObjectStore } from "./types.ts";

/** URL prefix of the dev-only route that serves this store to the browser. */
export const LOCAL_FILES_ROUTE = "/api/dev-storage";

/**
 * Stores objects as files under a folder. For local development and tests
 * only: Vercel's filesystem is read-only, and "presigned" URLs here are plain
 * links to a dev route that is disabled in production.
 */
export class LocalStore implements ObjectStore {
  readonly kind = "local";
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Map a key to a path inside root, rejecting anything that escapes it. */
  resolve(key: string): string {
    if (!key || key.includes("\\") || key.split("/").some((p) => p === ".." || p === "")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const full = path.resolve(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async getText(key: string): Promise<string | null> {
    try {
      return await readFile(this.resolve(key), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async putText(key: string, body: string) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async putBuffer(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async getToFile(key: string, filePath: string) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await copyFile(this.resolve(key), filePath);
  }

  async putFile(key: string, filePath: string) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await copyFile(filePath, file);
  }

  async list(prefix: string, opts: { delimiter?: string } = {}): Promise<ListResult> {
    const all = await this.walk(this.root);
    const keys: string[] = [];
    const prefixes = new Set<string>();
    for (const key of all.filter((k) => k.startsWith(prefix)).sort()) {
      const rest = key.slice(prefix.length);
      const cut = opts.delimiter ? rest.indexOf(opts.delimiter) : -1;
      if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1));
      else keys.push(key);
    }
    return { keys, prefixes: [...prefixes] };
  }

  private async walk(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await this.walk(full)));
      else out.push(path.relative(this.root, full).split(path.sep).join("/"));
    }
    return out;
  }

  async listObjects(prefix: string) {
    const { keys } = await this.list(prefix);
    return Promise.all(keys.map(async (key) => ({ key, size: (await stat(this.resolve(key))).size })));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith("/")) throw new Error(`Refusing to delete a prefix without a trailing slash: ${prefix}`);
    const { keys } = await this.list(prefix);
    await rm(this.resolve(prefix.slice(0, -1)), { recursive: true, force: true });
    return keys.length;
  }

  async presignGet(key: string, opts: { downloadName?: string } = {}) {
    const q = opts.downloadName ? `?download=${encodeURIComponent(opts.downloadName)}` : "";
    return `${LOCAL_FILES_ROUTE}/${key}${q}`;
  }

  async presignPut(key: string) {
    return `${LOCAL_FILES_ROUTE}/${key}`;
  }
}
