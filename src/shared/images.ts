import type { Scene } from "./script/types.ts";

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
export function buildImagePrompt(scene: Pick<Scene, "description" | "lines">, artStyle: string): string {
  let subject = scene.description?.trim();
  if (!subject) {
    const words = scene.lines.map((l) => l.text).join(" ").split(/\s+/).filter(Boolean);
    subject = words.length ? `a moody scene illustrating: ${words.slice(0, 40).join(" ")}` : "an empty, dimly lit room";
  }
  const style = artStyle.trim().replace(/[.,\s]+$/, "");
  const scenePart = `${subject.replace(/[.\s]+$/, "")}, ${COMPOSITION}`;
  return (style ? `${style}. Scene: ${scenePart}` : scenePart).slice(0, MAX_PROMPT);
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
