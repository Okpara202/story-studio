import { parseScript } from "../shared/script/parse.ts";
import type { CharacterLook, Scene } from "../shared/script/types.ts";
import { prunePortraits, sceneReferences, type PortraitEntry } from "./characters.ts";
import { sceneImageBase, type JobFile } from "../shared/job.ts";
import {
  buildImagePrompt,
  contentTypeOf,
  IMAGE_EXTS,
  sceneImageState,
  sceneLooks,
  sceneSeed,
  type SceneImageEntry,
  type SceneImageState,
} from "../shared/images.ts";
import { ConfigError, QuotaError, type ImageProvider } from "./images/types.ts";
import type { ObjectStore } from "./storage/types.ts";

/**
 * Scene images for one job. `prefix` is where the job lives in the store:
 * "jobs/{id}/" in R2, or "" when the store is a local job folder (worker CLI).
 */
export interface JobFiles {
  store: ObjectStore;
  prefix: string;
}

const imageKey = (j: JobFiles, sceneNo: number, ext: string) => `${j.prefix}images/${sceneImageBase(sceneNo)}.${ext}`;
const metaKey = (j: JobFiles, sceneNo: number) => `${j.prefix}images/${sceneImageBase(sceneNo)}.json`;

export async function readSceneImage(j: JobFiles, sceneNo: number): Promise<SceneImageEntry | null> {
  const text = await j.store.getText(metaKey(j, sceneNo));
  return text ? (JSON.parse(text) as SceneImageEntry) : null;
}

/** All scene image records, keyed by scene number. */
export async function listSceneImages(j: JobFiles): Promise<Map<number, SceneImageEntry>> {
  const { keys } = await j.store.list(`${j.prefix}images/`);
  const result = new Map<number, SceneImageEntry>();
  await Promise.all(
    keys
      .map((k) => /scene-(\d+)\.json$/.exec(k))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(async (m) => {
        const entry = await readSceneImage(j, Number(m[1]));
        if (entry) result.set(Number(m[1]), entry);
      }),
  );
  return result;
}

/** Store image bytes + record, removing the scene's image in any other format. */
async function saveSceneImage(j: JobFiles, sceneNo: number, data: Buffer | null, ext: string, entry: SceneImageEntry) {
  if (data) await j.store.putBuffer(imageKey(j, sceneNo, ext), data, contentTypeOf(ext));
  await removeImageFiles(j, sceneNo, ext);
  await j.store.putText(metaKey(j, sceneNo), JSON.stringify(entry, null, 2));
}

async function removeImageFiles(j: JobFiles, sceneNo: number, keepExt?: string) {
  await Promise.all(IMAGE_EXTS.filter((e) => e !== keepExt).map((e) => j.store.delete(imageKey(j, sceneNo, e))));
}

export async function removeSceneImage(j: JobFiles, sceneNo: number): Promise<void> {
  await removeImageFiles(j, sceneNo);
  await j.store.delete(metaKey(j, sceneNo));
}

/** Record an image the owner uploaded straight to storage (presigned PUT). */
export async function recordUpload(j: JobFiles, scene: Pick<Scene, "index" | "description">, ext: string) {
  const previous = await readSceneImage(j, scene.index);
  const entry: SceneImageEntry = {
    file: `${sceneImageBase(scene.index)}.${ext}`,
    source: "upload",
    prompt: scene.description ?? "",
    variant: (previous?.variant ?? 0) + 1,
    createdAt: new Date().toISOString(),
  };
  await saveSceneImage(j, scene.index, null, ext, entry);
  return entry;
}

export interface GenerateOptions {
  jobId: string;
  scene: Pick<Scene, "index" | "description" | "lines"> & { characters?: string[] };
  artStyle: string;
  providers: ImageProvider[];
  /** Described characters of the story; the scene's own are picked by name. */
  looks?: CharacterLook[];
  /** Pick a new seed ("New image") instead of reproducing the current one. */
  newVariant?: boolean;
  /** Providers already known to be out of quota for this run. */
  exhausted?: Set<string>;
  /** Called for each character portrait drawn on the way. */
  onPortrait?: (entry: PortraitEntry) => void;
}

/** Generate one scene's image, trying providers in order. */
export async function generateSceneImage(j: JobFiles, opts: GenerateOptions): Promise<SceneImageEntry> {
  if (opts.providers.length === 0) {
    throw new ConfigError("No image generator is set up. Add a Cloudflare Workers AI token (see README), or upload an image.");
  }
  const previous = await readSceneImage(j, opts.scene.index);
  const variant = (previous?.variant ?? 0) + (opts.newVariant || !previous ? 1 : 0);
  const looks = opts.looks ?? [];
  const prompt = buildImagePrompt(opts.scene, opts.artStyle, looks);
  const seed = sceneSeed(opts.jobId, opts.scene.index, variant);
  const errors: string[] = [];
  const references = await sceneReferences(j, {
    jobId: opts.jobId,
    looks: sceneLooks(opts.scene, looks),
    artStyle: opts.artStyle,
    providers: opts.providers,
    exhausted: opts.exhausted,
    onPortrait: opts.onPortrait,
  });

  for (const provider of opts.providers) {
    if (opts.exhausted?.has(provider.name)) continue;
    try {
      const image = await provider.generate(prompt, { seed, references });
      const entry: SceneImageEntry = {
        file: `${sceneImageBase(opts.scene.index)}.${image.ext}`,
        source: "generated",
        provider: provider.name,
        prompt,
        seed,
        variant,
        createdAt: new Date().toISOString(),
      };
      await saveSceneImage(j, opts.scene.index, image.data, image.ext, entry);
      return entry;
    } catch (err) {
      if (err instanceof QuotaError) opts.exhausted?.add(provider.name);
      errors.push(err instanceof Error ? err.message : String(err));
      if (err instanceof ConfigError && opts.providers.length === 1) break;
    }
  }
  throw new Error(errors.join(" | ") || "All image generators are out of quota for today.");
}

/**
 * Delete image files nothing points at: images of scenes that were removed
 * from the script, and stray files left by an interrupted upload (a file
 * whose name differs from the one in the scene's record). Returns keys deleted.
 */
export async function pruneSceneImages(j: JobFiles, sceneNumbers: number[]): Promise<string[]> {
  const keep = new Set(sceneNumbers);
  const entries = await listSceneImages(j);
  const folder = `${j.prefix}images/`;
  const { keys } = await j.store.list(folder);
  const stale = keys.filter((key) => {
    const name = key.slice(folder.length);
    const m = /^scene-(\d+)\.(\w+)$/.exec(name);
    if (!m) return false;
    const n = Number(m[1]);
    if (!keep.has(n)) return true;
    if (m[2] === "json") return false;
    const entry = entries.get(n);
    return entry !== undefined && name !== entry.file;
  });
  await Promise.all(stale.map((k) => j.store.delete(k)));
  return stale;
}

export interface SceneImageResult {
  scene: number;
  result: "kept" | "generated" | "kept-upload" | "failed";
  error?: string;
}

/**
 * Make sure every scene has an up-to-date image (worker). Uploads are never
 * replaced; generated images are redone only when their prompt changed.
 * A failed scene does not stop the others; each gets its own result.
 */
export async function ensureSceneImages(
  j: JobFiles,
  job: JobFile,
  providers: ImageProvider[],
  opts: { force?: boolean; only?: number; onProgress?: (done: number, total: number, message: string) => void } = {},
): Promise<SceneImageResult[]> {
  const story = parseScript(job.script);
  const allScenes = story.scenes;
  if (!opts.only) {
    await pruneSceneImages(j, allScenes.map((s) => s.index));
    await prunePortraits(j, story.looks);
  }
  const scenes = allScenes.filter((s) => !opts.only || s.index === opts.only);
  const artStyle = job.style?.artStyle ?? "";
  const existing = await listSceneImages(j);
  const exhausted = new Set<string>();
  const results: SceneImageResult[] = [];

  for (const [i, scene] of scenes.entries()) {
    const entry = existing.get(scene.index);
    const state = sceneImageState(entry, buildImagePrompt(scene, artStyle, story.looks), scene.description);
    if (entry?.source === "upload") {
      results.push({ scene: scene.index, result: "kept-upload" });
      continue;
    }
    if (state === "ok" && !opts.force) {
      results.push({ scene: scene.index, result: "kept" });
      continue;
    }
    opts.onProgress?.(i, scenes.length, `Drawing scene ${scene.index} of ${scenes.length}`);
    try {
      await generateSceneImage(j, {
        jobId: job.jobId,
        scene,
        artStyle,
        providers,
        looks: story.looks,
        exhausted,
        newVariant: opts.force && !!entry,
      });
      results.push({ scene: scene.index, result: "generated" });
    } catch (err) {
      results.push({ scene: scene.index, result: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }
  const ok = results.filter((r) => r.result !== "failed").length;
  opts.onProgress?.(scenes.length, scenes.length, `${ok} of ${scenes.length} scene images ready`);
  return results;
}

/** A scene image record plus a short-lived URL the browser can display. */
export interface SceneImageView {
  url: string;
  entry: SceneImageEntry;
}

export async function sceneImageView(j: JobFiles, sceneNo: number, entry: SceneImageEntry): Promise<SceneImageView> {
  const url = await j.store.presignGet(`${j.prefix}images/${entry.file}`);
  // The local dev store returns the same URL for a replaced image; bust the browser cache.
  const bust = `${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(entry.createdAt)}`;
  return { url: j.store.kind === "local" ? url + bust : url, entry };
}

/** Views for every scene that has an image, keyed by scene number. */
export async function sceneImageViews(j: JobFiles): Promise<Record<number, SceneImageView>> {
  const entries = await listSceneImages(j);
  const views = await Promise.all([...entries].map(async ([n, e]) => [n, await sceneImageView(j, n, e)] as const));
  return Object.fromEntries(views);
}

/** Image state per scene for the editor. */
export function describeSceneImages(
  scenes: (Pick<Scene, "index" | "description" | "lines"> & { characters?: string[] })[],
  entries: Map<number, SceneImageEntry>,
  artStyle: string,
  looks: CharacterLook[] = [],
): Map<number, SceneImageState> {
  return new Map(
    scenes.map((s) => [s.index, sceneImageState(entries.get(s.index), buildImagePrompt(s, artStyle, looks), s.description)]),
  );
}
