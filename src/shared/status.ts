import type { JobFile, Snippet, VideoFormat } from "./job.ts";

export type JobState = "queued" | "running" | "done" | "failed";
export type JobStage = "voices" | "images" | "render";

export interface OutputInfo {
  /** Path inside the job folder, e.g. "output/full-16x9.mp4". */
  file: string;
  format: VideoFormat;
  bytes: number;
  durationSec: number;
  renderSec?: number;
  /** Set on teaser clips: which snippet (as it was when rendered) this file is. */
  snippet?: Snippet;
}

/** Where each scene sits in the full video, measured from the real voice clips. */
export interface SceneTime {
  index: number;
  start: number;
  sec: number;
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
  /** Scene timings of the last full render; give exact snippet lengths and previews. */
  sceneTimes?: SceneTime[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

/** Rough share of a run's time per stage, so the overall percentage moves at an even pace. */
const STAGE_WEIGHTS: Record<JobStage, number> = { voices: 0.35, images: 0.2, render: 0.45 };
const STAGE_ORDER: JobStage[] = ["voices", "images", "render"];

/** Whole-run progress, 0..100: finished stages count in full, the current one by its own progress. */
export function overallPercent(status: Pick<JobStatus, "state" | "stage" | "progress">): number {
  if (status.state === "done") return 100;
  if (!status.stage) return 0;
  const i = STAGE_ORDER.indexOf(status.stage);
  const before = STAGE_ORDER.slice(0, i).reduce((n, s) => n + STAGE_WEIGHTS[s], 0);
  const within = Math.min(1, Math.max(0, status.progress)) * STAGE_WEIGHTS[status.stage];
  // Never show 100% before the run has really finished.
  return Math.min(99, Math.floor((before + within) * 100));
}

export type StoryStatus = "draft" | "generating" | "ready" | "failed" | "downloaded";

export function storyStatusOf(job: Pick<JobFile, "downloadedAt">, status: JobStatus | null): StoryStatus {
  if (job.downloadedAt) return "downloaded";
  if (!status) return "draft";
  if (status.state === "failed") return "failed";
  if (status.state === "done") return "ready";
  return "generating";
}
