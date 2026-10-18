import type { CharacterLook, Scene } from "./script/types.ts";

export type ImageSource = "generated" | "upload";

/** images/scene-NN.json, stored next to the image (one file per scene, so parallel edits never clash). */
export interface SceneImageEntry {
  /** File name inside images/, e.g. "scene-03.jpg". */
  file: string;
  source: ImageSource;
  /** Provider name for generated images, e.g. "cloudflare". */
  provider?: string;
  /** Prompt the image was generated from; for uploads, the scene description at upload time. */
  prompt: string;
  seed?: number;
  /** Bumped by "New image" so the same prompt gives a different picture. */
  variant: number;
  createdAt: string;
}

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function contentTypeOf(ext: string): string {
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** Keeps the subject where both the 16:9 and the 9:16 crop can see it. */
const COMPOSITION = "centred composition, main subject in the middle third of the frame, empty space around it";
const MAX_PROMPT = 1500;

/**
 * Image prompt for a scene: the channel's art style first (FLUX weighs early
 * words most, so this keeps every scene in one look), then the scene's
 * [scene: ...] description, or the gist of its lines when there is none.
 */
export function buildImagePrompt(
  scene: Pick<Scene, "description" | "lines"> & { characters?: string[] },
  artStyle: string,
  looks: CharacterLook[] = [],
): string {
  let subject = scene.description?.trim();
  if (!subject) {
    const words = scene.lines.map((l) => l.text).join(" ").split(/\s+/).filter(Boolean);
    subject = words.length ? `a moody scene illustrating: ${words.slice(0, 40).join(" ")}` : "an empty, dimly lit room";
  }
  const style = artStyle.trim().replace(/[.,\s]+$/, "");
  const scenePart = `${subject.replace(/[.\s]+$/, "")}, ${COMPOSITION}`;
  // Each named character: their description, and the reference portrait sent with the request (image 0, 1, ...).
  const people = sceneLooks(scene, looks)
    .map((l, i) => `${l.name} is ${l.look.replace(/[.\s]+$/, "")}, the same person as in image ${i}`)
    .join(". ");
  const prompt = style ? `${style}. Scene: ${scenePart}` : scenePart;
  return (people ? `${prompt}. ${people}` : prompt).slice(0, MAX_PROMPT);
}

/** The described characters a scene names, in order (matches the order of reference images). */
export function sceneLooks(scene: { characters?: string[] }, looks: CharacterLook[]): CharacterLook[] {
  return (scene.characters ?? []).map((id) => looks.find((l) => l.id === id)).filter((l): l is CharacterLook => !!l);
}

/** Prompt for a character's reference portrait: plain and evenly lit, so it transfers well into scenes. */
export function portraitPrompt(look: Pick<CharacterLook, "look">, artStyle: string): string {
  const style = artStyle.trim().replace(/[.,\s]+$/, "");
  const subject = `character reference portrait of ${look.look.replace(/[.\s]+$/, "")}, head and shoulders, facing the viewer, plain dark background, soft even light`;
  return (style ? `${style}. ${subject}` : subject).slice(0, MAX_PROMPT);
}

/** characters/{slug}.json: a reference portrait record, like a scene image's plus the look it shows. */
export type PortraitEntry = SceneImageEntry & { look: string };

/** Generated portraits go stale when their prompt changes; uploads when the character's description does. */
export function portraitState(entry: PortraitEntry | undefined, look: Pick<CharacterLook, "look">, artStyle: string): SceneImageState {
  if (!entry) return "missing";
  if (entry.source === "upload") return entry.look === look.look ? "ok" : "outdated";
  return entry.prompt === portraitPrompt(look, artStyle) ? "ok" : "outdated";
}

/** Storage-safe name for a character, e.g. "DR HALE" -> "dr-hale". */
export function characterSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "character";
}

/** Stable seed per story, scene and variant, so regenerating is reproducible. */
export function sceneSeed(jobId: string, sceneNo: number, variant: number): number {
  let h = 2166136261;
  for (const ch of `${jobId}:${sceneNo}:${variant}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2_000_000_000;
}

export type SceneImageState = "ok" | "missing" | "outdated";

/**
 * Whether a scene's image still matches the script. Generated images go
 * stale when the prompt changes; uploads are kept but flagged if the scene
 * description changed since the upload.
 */
export function sceneImageState(entry: SceneImageEntry | undefined, currentPrompt: string, description: string | null): SceneImageState {
  if (!entry) return "missing";
  if (entry.source === "upload") return entry.prompt === (description ?? "") ? "ok" : "outdated";
  return entry.prompt === currentPrompt ? "ok" : "outdated";
}
