import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getStore } from "@/server/storage";
import { LocalStore } from "@/server/storage/local";
import { requireSession } from "@/server/session";

// Stands in for R2 presigned URLs when developing with the local folder store.
// Returns 404 whenever R2 is configured (and therefore always on Vercel).

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

async function localStore(): Promise<LocalStore | null> {
  try {
    await requireSession();
  } catch {
    return null;
  }
  const store = getStore();
  return store instanceof LocalStore ? store : null;
}

export async function GET(req: Request, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  const store = await localStore();
  if (!store) return new Response("Not found", { status: 404 });
  const { key } = await ctx.params;
  let file: string;
  try {
    file = store.resolve(key.join("/"));
    await stat(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const download = new URL(req.url).searchParams.get("download");
  const headers: Record<string, string> = {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  };
  if (download) headers["Content-Disposition"] = `attachment; filename="${download.replace(/"/g, "")}"`;
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  const store = await localStore();
  if (!store) return new Response("Not found", { status: 404 });
  const { key } = await ctx.params;
  let file: string;
  try {
    file = store.resolve(key.join("/"));
  } catch {
    return new Response("Invalid key", { status: 400 });
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await req.arrayBuffer()));
  return new Response(null, { status: 200 });
}
