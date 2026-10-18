import type { JobFile, VideoFormat } from "./job.ts";

export type JobState = "queued" | "running" | "done" | "failed";
export type JobStage = "voices" | "images" | "render";

export interface OutputInfo {
  /** Path inside the job folder, e.g. "output/full-16x9.mp4". */
  file: string;
  format: VideoFormat;
  bytes: number;
  durationSec: number;
  renderSec?: number;
}

export interface SceneStatus {
  index: number;
  state: "ok" | "failed";
  error?: string;
}

/** jobs/{jobId}/status.json, written by the worker and polled by the UI. */
export interface JobStatus {
  state: JobState;
  stage: JobStage | null;
  /** 0..1 within the current stage. */
  progress: number;
  message?: string;
  error?: string;
  /** Technical detail for errors, e.g. the end of ffmpeg's log. */
  detail?: string;
  warnings?: string[];
  /** Per-scene results for stages that can fail scene by scene (images). */
  scenes?: SceneStatus[];
  outputs?: OutputInfo[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export type StoryStatus = "draft" | "generating" | "ready" | "failed" | "downloaded";

export function storyStatusOf(job: Pick<JobFile, "downloadedAt">, status: JobStatus | null): StoryStatus {
  if (job.downloadedAt) return "downloaded";
  if (!status) return "draft";
  if (status.state === "failed") return "failed";
  if (status.state === "done") return "ready";
  return "generating";
}
