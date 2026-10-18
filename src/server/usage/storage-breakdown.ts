import type { JobFile } from "../../shared/job.ts";
import type { ObjectStore } from "../storage/types.ts";
import { keys } from "../jobs.ts";

export interface StoryStorage {
  id: string;
  title: string;
  bytes: number;
  files: number;
  /** Bytes per kind of file, so it's clear what "Free space" removes. */
  parts: { images: number; voices: number; videos: number; other: number };
}

export interface StorageBreakdown {
  stories: StoryStorage[];
  /** Channel files outside stories: music, settings, usage tally. */
  shared: { bytes: number; files: number };
  totalBytes: number;
}

function partOf(rest: string): keyof StoryStorage["parts"] {
  if (rest.startsWith("images/") || rest.startsWith("characters/")) return "images";
  if (rest.startsWith("audio/")) return "voices";
  if (rest.startsWith("output/")) return "videos";
  return "other";
}

/** One bucket listing (per 1,000 files) plus one small read per story for its title. Largest first. */
export async function storageByStory(store: ObjectStore): Promise<StorageBreakdown> {
  const objects = await store.listObjects("");
  const byStory = new Map<string, StoryStorage>();
  const shared = { bytes: 0, files: 0 };

  for (const { key, size } of objects) {
    const m = /^jobs\/([^/]+)\/(.+)$/.exec(key);
    if (!m) {
      shared.bytes += size;
      shared.files++;
      continue;
    }
    const [, id, rest] = m;
    const s = byStory.get(id) ?? {
      id,
      title: "",
      bytes: 0,
      files: 0,
      parts: { images: 0, voices: 0, videos: 0, other: 0 },
    };
    s.bytes += size;
    s.files++;
    s.parts[partOf(rest)] += size;
    byStory.set(id, s);
  }

  await Promise.all(
    [...byStory.values()].map(async (s) => {
      const text = await store.getText(keys.job(s.id)).catch(() => null);
      try {
        s.title = text ? ((JSON.parse(text) as JobFile).title ?? "") : "";
      } catch {
        s.title = "";
      }
    }),
  );

  const stories = [...byStory.values()].sort((a, b) => b.bytes - a.bytes);
  return { stories, shared, totalBytes: objects.reduce((sum, o) => sum + o.size, 0) };
}
