import sharp from "sharp";
import type { CharacterLook } from "../shared/script/types.ts";
import {
  characterSlug,
  contentTypeOf,
  IMAGE_EXTS,
  portraitPrompt,
  portraitState,
  sceneSeed,
  type PortraitEntry,
} from "../shared/images.ts";
import { ConfigError, QuotaError, type ImageProvider } from "./images/types.ts";
import type { JobFiles } from "./scene-images.ts";

/**
 * Reference portraits for described characters: characters/{slug}.{ext} plus a
 * characters/{slug}.json record, the same shape as scene images. A portrait is
 * sent with every scene image that names the character, so they look the same.
 */
export type { PortraitEntry } from "../shared/images.ts";

const folder = (j: JobFiles) => `${j.prefix}characters/`;
const imageKey = (j: JobFiles, slug: string, ext: string) => `${folder(j)}${slug}.${ext}`;
const metaKey = (j: JobFiles, slug: string) => `${folder(j)}${slug}.json`;

/** Portraits are square and small: cheap to make, and close to the 512px reference limit. */
const PORTRAIT_SIZE = { width: 512, height: 512 };
/** Reference pictures must be under 512x512. */
const REFERENCE_MAX = 496;

export async function readPortrait(j: JobFiles, id: string): Promise<PortraitEntry | null> {
  const text = await j.store.getText(metaKey(j, characterSlug(id)));
  return text ? (JSON.parse(text) as PortraitEntry) : null;
}

/** Portrait records keyed by character id, for the given looks. */
export async function listPortraits(j: JobFiles, looks: CharacterLook[]): Promise<Map<string, PortraitEntry>> {
  const entries = await Promise.all(looks.map(async (l) => [l.id, await readPortrait(j, l.id)] as const));
  return new Map(entries.filter((e): e is readonly [string, PortraitEntry] => e[1] !== null));
}

async function savePortrait(j: JobFiles, slug: string, data: Buffer | null, ext: string, entry: PortraitEntry) {
  if (data) await j.store.putBuffer(imageKey(j, slug, ext), data, contentTypeOf(ext));
  await Promise.all(IMAGE_EXTS.filter((e) => e !== ext).map((e) => j.store.delete(imageKey(j, slug, e))));
  await j.store.putText(metaKey(j, slug), JSON.stringify(entry, null, 2));
}

export async function generatePortrait(
  j: JobFiles,
  opts: { jobId: string; look: CharacterLook; artStyle: string; providers: ImageProvider[]; newVariant?: boolean; exhausted?: Set<string> },
): Promise<PortraitEntry> {
  if (opts.providers.length === 0) {
    throw new ConfigError("No image generator is set up. Add a Cloudflare Workers AI token (see README), or upload a portrait.");
  }
  const slug = characterSlug(opts.look.id);
  const previous = await readPortrait(j, opts.look.id);
  const variant = (previous?.variant ?? 0) + (opts.newVariant || !previous ? 1 : 0);
  const prompt = portraitPrompt(opts.look, opts.artStyle);
  // Scene numbers start at 1, so 0 keeps portrait seeds apart from scene seeds.
  const seed = sceneSeed(`${opts.jobId}:${slug}`, 0, variant);
  const errors: string[] = [];
  for (const provider of opts.providers) {
    if (opts.exhausted?.has(provider.name)) continue;
    try {
      const image = await provider.generate(prompt, { seed, size: PORTRAIT_SIZE });
      const entry: PortraitEntry = {
        file: `${slug}.${image.ext}`,
        source: "generated",
        provider: provider.name,
        prompt,
        look: opts.look.look,
        seed,
        variant,
        createdAt: new Date().toISOString(),
      };
      await savePortrait(j, slug, image.data, image.ext, entry);
      return entry;
    } catch (err) {
      if (err instanceof QuotaError) opts.exhausted?.add(provider.name);
      errors.push(err instanceof Error ? err.message : String(err));
      if (err instanceof ConfigError && opts.providers.length === 1) break;
    }
  }
  throw new Error(errors.join(" | ") || "All image generators are out of quota for today.");
}

/** Record a portrait the owner uploaded straight to storage (presigned PUT). */
export async function recordPortraitUpload(j: JobFiles, look: CharacterLook, ext: string): Promise<PortraitEntry> {
  const slug = characterSlug(look.id);
  const previous = await readPortrait(j, look.id);
  const entry: PortraitEntry = {
    file: `${slug}.${ext}`,
    source: "upload",
    prompt: "",
    look: look.look,
    variant: (previous?.variant ?? 0) + 1,
    createdAt: new Date().toISOString(),
  };
  await savePortrait(j, slug, null, ext, entry);
  return entry;
}

export async function removePortrait(j: JobFiles, id: string): Promise<void> {
  const slug = characterSlug(id);
  await Promise.all(IMAGE_EXTS.map((e) => j.store.delete(imageKey(j, slug, e))));
  await j.store.delete(metaKey(j, slug));
}

/** Delete portraits of characters no longer described in the script. Returns keys deleted. */
export async function prunePortraits(j: JobFiles, looks: CharacterLook[]): Promise<string[]> {
  const keep = new Set(looks.map((l) => characterSlug(l.id)));
  const { keys } = await j.store.list(folder(j));
  const stale = keys.filter((k) => !keep.has(k.slice(folder(j).length).replace(/\.[^.]+$/, "")));
  await Promise.all(stale.map((k) => j.store.delete(k)));
  return stale;
}

/**
 * The portrait as a reference picture: JPEG, under 512x512. Reads the stored
 * file, so it works for generated and uploaded portraits alike.
 */
export async function referenceImage(j: JobFiles, entry: PortraitEntry): Promise<Buffer | null> {
  const key = `${folder(j)}${entry.file}`;
  const { tmpdir } = await import("node:os");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = await mkdtemp(path.join(tmpdir(), "ref-"));
  try {
    const file = path.join(dir, entry.file);
    await j.store.getToFile(key, file);
    const data = await readFile(file);
    return await sharp(data)
      .rotate()
      .resize(REFERENCE_MAX, REFERENCE_MAX, { fit: "cover", position: "attention" })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Reference pictures for a scene's characters, in the order the prompt names
 * them ("image 0", "image 1"...). Missing or outdated AI portraits are drawn
 * first. All or nothing: a gap would shift the numbering and swap faces.
 */
export async function sceneReferences(
  j: JobFiles,
  opts: {
    jobId: string;
    looks: CharacterLook[];
    artStyle: string;
    providers: ImageProvider[];
    exhausted?: Set<string>;
    /** Called for each portrait drawn here (for the usage tally). */
    onPortrait?: (entry: PortraitEntry) => void;
  },
): Promise<Buffer[]> {
  const refs: Buffer[] = [];
  for (const look of opts.looks) {
    let entry = await readPortrait(j, look.id);
    const state = portraitState(entry ?? undefined, look, opts.artStyle);
    if (!entry || (state === "outdated" && entry.source === "generated")) {
      try {
        entry = await generatePortrait(j, { jobId: opts.jobId, look, artStyle: opts.artStyle, providers: opts.providers, exhausted: opts.exhausted });
      } catch (err) {
        throw new Error(`Couldn't draw ${look.name}'s reference portrait first: ${err instanceof Error ? err.message : String(err)}`);
      }
      opts.onPortrait?.(entry);
    }
    const ref = await referenceImage(j, entry);
    if (!ref) throw new Error(`${look.name}'s portrait couldn't be read. Redraw or upload it in the Characters list.`);
    refs.push(ref);
  }
  return refs;
}

/** A portrait record plus a short-lived URL the browser can display. */
export interface PortraitView {
  url: string;
  entry: PortraitEntry;
}

export async function portraitView(j: JobFiles, entry: PortraitEntry): Promise<PortraitView> {
  const url = await j.store.presignGet(`${folder(j)}${entry.file}`);
  const bust = `${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(entry.createdAt)}`;
  return { url: j.store.kind === "local" ? url + bust : url, entry };
}

/** Views for every described character that has a portrait, keyed by character id. */
export async function portraitViews(j: JobFiles, looks: CharacterLook[]): Promise<Record<string, PortraitView>> {
  const entries = await listPortraits(j, looks);
  const views = await Promise.all([...entries].map(async ([id, e]) => [id, await portraitView(j, e)] as const));
  return Object.fromEntries(views);
}

/** Portrait key prefix and object key for an upload, for the presigned PUT. */
export function portraitUploadKey(j: JobFiles, id: string, ext: string): string {
  return imageKey(j, characterSlug(id), ext);
}
