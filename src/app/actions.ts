"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getStore } from "@/server/storage";
import {
  createStory,
  deleteStory,
  freeStorySpace,
  getStory,
  getStyle,
  keys,
  MAX_MUSIC_BYTES,
  MUSIC_TYPES,
  musicKey,
  saveStyle,
  updateStory,
} from "@/server/jobs";
import {
  generateSceneImage,
  recordUpload,
  removeSceneImage,
  sceneImageView,
  type JobFiles,
  type SceneImageView,
} from "@/server/scene-images";
import { fastImageProviders } from "@/server/images";
import { recordImage } from "@/server/usage/ledger";
import { storageByStory, type StorageBreakdown } from "@/server/usage/storage-breakdown";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/shared/images";
import { parseScript } from "@/shared/script/parse";
import * as v from "@/server/validate";
import { requireSession } from "@/server/session";
import { startGeneration } from "@/server/generation";

type Result<T> = T | { error: string };

/** Load a story and one of its scenes, as the editor currently has it saved. */
async function loadScene(id: string, sceneNo: number) {
  const store = getStore();
  const story = await getStory(store, v.str(id, "Story id", 40));
  if (!story) throw new v.ValidationError("Story not found");
  const scene = parseScript(story.job.script).scenes.find((s) => s.index === v.sceneNo(sceneNo));
  if (!scene) throw new v.ValidationError(`Scene ${sceneNo} no longer exists. Save the script and try again.`);
  const files: JobFiles = { store, prefix: keys.jobDir(id) };
  return { story, scene, files };
}

const errorOf = (err: unknown) => ({ error: err instanceof Error ? err.message : "Something went wrong." });

export async function createStoryAction(initialScript?: string) {
  await requireSession();
  const job = await createStory(getStore(), initialScript === undefined ? "" : v.script(initialScript));
  redirect(`/stories/${job.jobId}`);
}

export async function saveStoryAction(id: string, patch: { script?: string; voices?: Record<string, string> }) {
  await requireSession();
  const job = await updateStory(getStore(), v.str(id, "Story id", 40), {
    script: patch.script === undefined ? undefined : v.script(patch.script),
    voices: patch.voices === undefined ? undefined : v.voices(patch.voices),
  });
  return { title: job.title, updatedAt: job.updatedAt };
}

export async function deleteStoryAction(id: string) {
  await requireSession();
  await deleteStory(getStore(), v.str(id, "Story id", 40));
  redirect("/");
}

/** One-time move of stories saved in the browser by the first UI version. */
export async function importStoriesAction(items: { script: string; voices: Record<string, string> }[]) {
  await requireSession();
  if (!Array.isArray(items) || items.length > 200) throw new v.ValidationError("Invalid import");
  const store = getStore();
  for (const item of items) {
    const job = await createStory(store, v.script(item.script));
    if (item.voices && Object.keys(item.voices).length) {
      await updateStory(store, job.jobId, { voices: v.voices(item.voices) });
    }
  }
  refresh();
  return items.length;
}

export async function saveStyleAction(style: unknown) {
  await requireSession();
  await saveStyle(getStore(), v.style(style));
}

// Returns the error instead of throwing: production builds hide thrown messages from the browser.
export async function createMusicUploadAction(
  file: { name: string; type: string; size: number },
): Promise<{ key: string; url: string } | { error: string }> {
  await requireSession();
  if (!MUSIC_TYPES[file?.type]) return { error: "Choose an MP3, WAV, OGG or M4A file." };
  if (typeof file.size !== "number" || file.size > MAX_MUSIC_BYTES) {
    return { error: `That file is too large. The limit is ${MAX_MUSIC_BYTES / 1024 / 1024} MB.` };
  }
  const key = musicKey(v.str(file.name, "File name", 200), file.type);
  return { key, url: await getStore().presignPut(key, file.type) };
}

export async function musicPreviewUrlAction(key: string) {
  await requireSession();
  if (!v.str(key, "Music file", 200).startsWith("settings/music/")) throw new v.ValidationError("Invalid music file");
  return getStore().presignGet(key);
}

export async function generateSceneImageAction(
  id: string,
  sceneNo: number,
  newVariant: boolean,
): Promise<Result<SceneImageView>> {
  await requireSession();
  try {
    const { scene, files } = await loadScene(id, sceneNo);
    const style = await getStyle(files.store);
    const entry = await generateSceneImage(files, {
      jobId: id,
      scene,
      artStyle: style.artStyle,
      providers: fastImageProviders(),
      newVariant: Boolean(newVariant),
    });
    if (entry.provider) await recordImage(files.store, entry.provider);
    return await sceneImageView(files, sceneNo, entry);
  } catch (err) {
    return errorOf(err);
  }
}

export async function createSceneImageUploadAction(
  id: string,
  sceneNo: number,
  file: { type: string; size: number },
): Promise<Result<{ url: string; ext: string }>> {
  await requireSession();
  const ext = IMAGE_TYPES[file?.type];
  if (!ext) return { error: "Choose a PNG, JPG or WebP image." };
  if (typeof file.size !== "number" || file.size > MAX_IMAGE_BYTES) {
    return { error: `That image is too large. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` };
  }
  try {
    const { files } = await loadScene(id, sceneNo);
    const key = `${files.prefix}images/scene-${String(sceneNo).padStart(2, "0")}.${ext}`;
    return { url: await files.store.presignPut(key, file.type), ext };
  } catch (err) {
    return errorOf(err);
  }
}

export async function confirmSceneImageUploadAction(
  id: string,
  sceneNo: number,
  ext: string,
): Promise<Result<SceneImageView>> {
  await requireSession();
  if (!Object.values(IMAGE_TYPES).includes(ext)) return { error: "Invalid image type" };
  try {
    const { scene, files } = await loadScene(id, sceneNo);
    const entry = await recordUpload(files, scene, ext);
    return await sceneImageView(files, sceneNo, entry);
  } catch (err) {
    return errorOf(err);
  }
}

export async function removeSceneImageAction(id: string, sceneNo: number): Promise<Result<{ ok: true }>> {
  await requireSession();
  try {
    const store = getStore();
    await getStory(store, v.str(id, "Story id", 40));
    await removeSceneImage({ store, prefix: keys.jobDir(id) }, v.sceneNo(sceneNo));
    return { ok: true };
  } catch (err) {
    return errorOf(err);
  }
}

export async function storageBreakdownAction(): Promise<Result<StorageBreakdown>> {
  await requireSession();
  try {
    return await storageByStory(getStore());
  } catch (err) {
    return errorOf(err);
  }
}

/** Delete a story's voices, images and videos; keep its script. */
export async function freeStorySpaceAction(id: string): Promise<Result<{ deleted: number }>> {
  await requireSession();
  try {
    const deleted = await freeStorySpace(getStore(), v.str(id, "Story id", 40));
    refresh();
    return { deleted };
  } catch (err) {
    return errorOf(err);
  }
}

/** Delete a whole story from a list (no redirect, unlike deleteStoryAction). */
export async function deleteStoryFromListAction(id: string): Promise<Result<{ deleted: number }>> {
  await requireSession();
  try {
    const deleted = await deleteStory(getStore(), v.str(id, "Story id", 40));
    refresh();
    return { deleted };
  } catch (err) {
    return errorOf(err);
  }
}

/** Start the cloud run (voices, images, both video formats) for a story. */
export async function generateVideoAction(id: string): Promise<Result<{ ok: true }>> {
  await requireSession();
  try {
    await startGeneration(getStore(), v.str(id, "Story id", 40));
    refresh();
    return { ok: true };
  } catch (err) {
    return errorOf(err);
  }
}
