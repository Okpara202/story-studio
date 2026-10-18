import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobStage, JobStatus } from "../../src/shared/status.ts";
import { FfmpegError } from "./ffmpeg.ts";

export interface StatusWriter {
  running(progress: number, message?: string): void;
  done(extra?: Partial<JobStatus>): Promise<void>;
  failed(err: unknown, extra?: Partial<JobStatus>): Promise<void>;
}

/**
 * Writes jobs/{id}/status.json for one stage. Progress updates are throttled
 * because in the cloud worker every write becomes an upload.
 */
export function statusWriter(jobDir: string, stage: JobStage, opts: { enabled?: boolean; throttleMs?: number } = {}) {
  const file = path.join(jobDir, "status.json");
  const enabled = opts.enabled ?? true;
  const throttleMs = opts.throttleMs ?? 5000;
  const startedAt = new Date().toISOString();
  let progress = 0;
  let message: string | undefined;
  let lastWrite = 0;
  let chain = Promise.resolve();

  const write = (s: Omit<JobStatus, "updatedAt" | "startedAt" | "stage">) => {
    if (!enabled) return Promise.resolve();
    const status: JobStatus = { stage, startedAt, ...s, updatedAt: new Date().toISOString() };
    // Serialise writes so a slow early write never lands after a later one.
    chain = chain.then(() => writeFile(file, JSON.stringify(status, null, 2))).catch(() => {});
    return chain;
  };

  const writer: StatusWriter = {
    running(p, m) {
      progress = p;
      message = m ?? message;
      if (Date.now() - lastWrite < throttleMs && p < 1) return;
      lastWrite = Date.now();
      void write({ state: "running", progress, message });
    },
    done: (extra = {}) =>
      write({ state: "done", progress: 1, message, finishedAt: new Date().toISOString(), ...extra }),
    failed: (err, extra = {}) =>
      write({
        state: "failed",
        progress,
        message,
        error: err instanceof Error ? err.message : String(err),
        detail: err instanceof FfmpegError ? err.stderrTail : undefined,
        finishedAt: new Date().toISOString(),
        ...extra,
      }),
  };
  void write({ state: "running", progress: 0 });
  lastWrite = Date.now();
  return writer;
}
