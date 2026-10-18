import { randomBytes } from "node:crypto";
import { parseScript } from "../shared/script/parse.ts";
import { estimateStorySec } from "../shared/timing.ts";
import { DEFAULT_STYLE, type JobFile, type StyleSettings } from "../shared/job.ts";
import { storyStatusOf, type JobStatus, type StoryStatus } from "../shared/status.ts";
import type { ObjectStore } from "./storage/types.ts";

/** Storage layout. Everything about one story lives under jobs/{id}/. */
export const keys = {
  jobsPrefix: "jobs/",
  jobDir: (id: string) => `jobs/${id}/`,
  job: (id: string) => `jobs/${id}/job.json`,
  status: (id: string) => `jobs/${id}/status.json`,
  style: "settings/style.json",
  musicPrefix: "settings/music/",
};

const ID_RE = /^[a-z0-9-]{6,40}$/;

export class NotFoundError extends Error {}

export function assertJobId(id: string): void {
  if (!ID_RE.test(id)) throw new NotFoundError(`Invalid story id: ${id}`);
}

/** Sortable, readable id like "20261018-k3x9qa". */
export function newJobId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = [...randomBytes(6)].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `${day}-${rand}`;
}

async function getJson<T>(store: ObjectStore, key: string): Promise<T | null> {
  const text = await store.getText(key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Corrupt JSON in storage at ${key}`);
  }
}

const putJson = (store: ObjectStore, key: string, value: unknown) =>
  store.putText(key, JSON.stringify(value, null, 2));

export interface StorySummary {
  id: string;
  title: string;
  status: StoryStatus;
  updatedAt: string;
  sceneCount: number;
  lineCount: number;
  estimateSec: number;
  firstLine: string | null;
}

export function summarize(job: JobFile, status: JobStatus | null): StorySummary {
  const parsed = parseScript(job.script);
  const lines = parsed.scenes.flatMap((s) => s.lines);
  return {
    id: job.jobId,
    title: job.title,
    status: storyStatusOf(job, status),
    updatedAt: job.updatedAt,
    sceneCount: parsed.scenes.length,
    lineCount: lines.length,
    estimateSec: estimateStorySec(parsed.scenes),
    firstLine: lines[0]?.text ?? null,
  };
}

export async function listStories(store: ObjectStore): Promise<StorySummary[]> {
  const { prefixes } = await store.list(keys.jobsPrefix, { delimiter: "/" });
  const ids = prefixes.map((p) => p.slice(keys.jobsPrefix.length, -1)).filter((id) => ID_RE.test(id));
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [job, status] = await Promise.all([
        getJson<JobFile>(store, keys.job(id)),
        getJson<JobStatus>(store, keys.status(id)),
      ]);
      return job ? summarize(job, status) : null;
    }),
  );
  return rows
    .filter((r): r is StorySummary => r !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface StoryDetail {
  job: JobFile;
  status: JobStatus | null;
  storyStatus: StoryStatus;
}

export async function getStory(store: ObjectStore, id: string): Promise<StoryDetail | null> {
  assertJobId(id);
  const [job, status] = await Promise.all([
    getJson<JobFile>(store, keys.job(id)),
    getJson<JobStatus>(store, keys.status(id)),
  ]);
  if (!job) return null;
  return { job, status, storyStatus: storyStatusOf(job, status) };
}

export async function createStory(store: ObjectStore, script = "", now = new Date()): Promise<JobFile> {
  const id = newJobId(now);
  const job: JobFile = {
    version: 1,
    jobId: id,
    title: parseScript(script).title,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    script,
    voices: {},
  };
  await putJson(store, keys.job(id), job);
  return job;
}

export interface StoryPatch {
  script?: string;
  voices?: Record<string, string>;
  /** Channel style snapshot taken when generation starts, so later style edits don't change this video. */
  style?: StyleSettings;
  /** Null clears it (a new run makes the story "ready" again). */
  downloadedAt?: string | null;
}

export async function getStatus(store: ObjectStore, id: string): Promise<JobStatus | null> {
  assertJobId(id);
  return getJson<JobStatus>(store, keys.status(id));
}

export async function putStatus(store: ObjectStore, id: string, status: JobStatus): Promise<void> {
  assertJobId(id);
  await putJson(store, keys.status(id), status);
}

export async function updateStory(store: ObjectStore, id: string, patch: StoryPatch): Promise<JobFile> {
  assertJobId(id);
  const job = await getJson<JobFile>(store, keys.job(id));
  if (!job) throw new NotFoundError(`Story ${id} not found`);
  // Drop undefined fields so a partial patch never wipes stored values.
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const next: JobFile = { ...job, ...defined, updatedAt: new Date().toISOString() };
  if (patch.script !== undefined) next.title = parseScript(patch.script).title;
  if (patch.downloadedAt === null) delete next.downloadedAt;
  await putJson(store, keys.job(id), next);
  return next;
}

export async function deleteStory(store: ObjectStore, id: string): Promise<number> {
  assertJobId(id);
  return store.deletePrefix(keys.jobDir(id));
}

/** Folders holding a story's large generated files. The script (job.json) is always kept. */
export const MEDIA_FOLDERS = ["audio/", "images/", "output/"] as const;

/** Delete a story's voices, images and videos but keep its script and settings. Returns files deleted. */
export async function freeStorySpace(store: ObjectStore, id: string): Promise<number> {
  assertJobId(id);
  let deleted = 0;
  for (const folder of MEDIA_FOLDERS) deleted += await store.deletePrefix(`${keys.jobDir(id)}${folder}`);
  // Progress from a finished run refers to files that no longer exist.
  await store.delete(keys.status(id));
  return deleted;
}

export interface MediaGroup {
  kind: "videos" | "images" | "voices";
  /** Files a person would count: videos, pictures, voice clips (not the small records beside them). */
  files: number;
  bytes: number;
}

/** What freeing a story's space would delete, for the confirmation dialog. */
export interface StoryMedia {
  groups: MediaGroup[];
  totalBytes: number;
  /** Images the owner uploaded: they can't be remade, only uploaded again. */
  uploadedImages: number;
}

const MEDIA_KIND: Record<(typeof MEDIA_FOLDERS)[number], MediaGroup["kind"]> = {
  "output/": "videos",
  "images/": "images",
  "audio/": "voices",
};

export async function storyMedia(store: ObjectStore, id: string): Promise<StoryMedia> {
  assertJobId(id);
  const dir = keys.jobDir(id);
  const objects = await store.listObjects(dir);
  const groups = new Map<MediaGroup["kind"], MediaGroup>();
  let uploadedImages = 0;
  const records: string[] = [];
  for (const { key, size } of objects) {
    const rest = key.slice(dir.length);
    const folder = MEDIA_FOLDERS.find((f) => rest.startsWith(f));
    if (!folder) continue;
    const kind = MEDIA_KIND[folder];
    const g = groups.get(kind) ?? { kind, files: 0, bytes: 0 };
    g.bytes += size;
    if (rest.endsWith(".json")) {
      if (kind === "images") records.push(key);
    } else {
      g.files++;
    }
    groups.set(kind, g);
  }
  await Promise.all(
    records.map(async (key) => {
      const text = await store.getText(key);
      try {
        if (text && (JSON.parse(text) as { source?: string }).source === "upload") uploadedImages++;
      } catch {
        // A damaged record is deleted with the rest.
      }
    }),
  );
  const order: MediaGroup["kind"][] = ["videos", "images", "voices"];
  const list = order.map((k) => groups.get(k)).filter((g): g is MediaGroup => g !== undefined);
  return { groups: list, totalBytes: list.reduce((n, g) => n + g.bytes, 0), uploadedImages };
}

/**
 * The owner has the videos on their computer: delete the story's large files
 * and mark it downloaded. Refused while a run is using those files.
 */
export async function markDownloaded(store: ObjectStore, id: string, now = new Date()): Promise<number> {
  const status = await getStatus(store, id);
  if (status && (status.state === "queued" || status.state === "running")) {
    throw new Error("This story is being generated. Wait for it to finish first.");
  }
  const deleted = await freeStorySpace(store, id);
  await updateStory(store, id, { downloadedAt: now.toISOString() });
  return deleted;
}

export async function getStyle(store: ObjectStore): Promise<StyleSettings> {
  const saved = await getJson<Partial<StyleSettings>>(store, keys.style);
  // Merge so settings saved by older versions pick up new fields.
  return {
    ...DEFAULT_STYLE,
    ...saved,
    music: { ...DEFAULT_STYLE.music, ...saved?.music },
    captions: { ...DEFAULT_STYLE.captions, ...saved?.captions },
  };
}

export async function saveStyle(store: ObjectStore, style: StyleSettings): Promise<void> {
  await putJson(store, keys.style, style);
}

export const MUSIC_TYPES: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};
export const MAX_MUSIC_BYTES = 25 * 1024 * 1024;

/** Safe storage name from a user's file name, e.g. "Dark Ambience (1).MP3" -> "dark-ambience-1.mp3". */
export function musicKey(fileName: string, contentType: string): string {
  const ext = MUSIC_TYPES[contentType] ?? ".mp3";
  const base =
    fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "music";
  return `${keys.musicPrefix}${base}${ext}`;
}
