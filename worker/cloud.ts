#!/usr/bin/env node
// The cloud worker: one full generation run for a story stored in R2.
//
//   node worker/cloud.ts <jobId> [--formats 16x9,9x16]
//
// Runs in GitHub Actions (see .github/workflows/render.yml), but works anywhere
// with the R2 and Cloudflare variables set, e.g. on a laptop as a fallback.
// Progress goes to jobs/{id}/status.json, which the app polls.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { createStore } from "../src/server/storage/index.ts";
import { assertJobId, getStyle, keys } from "../src/server/jobs.ts";
import { ensureSceneImages } from "../src/server/scene-images.ts";
import { imageProviders } from "../src/server/images/index.ts";
import { VIDEO_FORMATS, outputName, type JobFile, type VideoFormat } from "../src/shared/job.ts";
import type { JobStage, JobStatus, OutputInfo, SceneStatus } from "../src/shared/status.ts";
import type { ObjectStore } from "../src/server/storage/types.ts";
import { voiceJob } from "./lib/voices.ts";
import { renderVideo } from "./lib/render.ts";
import { defaultProviders } from "./tts/index.ts";
import { downloadPrefix, mirrorDir } from "./lib/sync.ts";
import { FfmpegError } from "./lib/ffmpeg.ts";

/** Publishes status.json to storage; progress updates at most every few seconds (each one is an upload). */
function cloudStatus(store: ObjectStore, jobId: string) {
  const startedAt = new Date().toISOString();
  let current: Omit<JobStatus, "updatedAt"> = { state: "running", stage: null, progress: 0, startedAt };
  let lastWrite = 0;
  let chain = Promise.resolve();
  const publish = (force = false) => {
    if (!force && Date.now() - lastWrite < 4000) return chain;
    lastWrite = Date.now();
    const body = JSON.stringify({ ...current, updatedAt: new Date().toISOString() }, null, 2);
    chain = chain.then(() => store.putText(keys.status(jobId), body)).catch((e) => console.warn("status write failed:", e));
    return chain;
  };
  return {
    stage(stage: JobStage, message: string) {
      current = { ...current, stage, progress: 0, message };
      return publish(true);
    },
    progress(progress: number, message?: string) {
      current = { ...current, progress, message: message ?? current.message };
      void publish();
    },
    set(patch: Partial<JobStatus>) {
      current = { ...current, ...patch };
    },
    done(outputs: OutputInfo[], warnings: string[]) {
      current = { ...current, state: "done", progress: 1, outputs, warnings, message: "Videos ready", finishedAt: new Date().toISOString() };
      return publish(true);
    },
    failed(error: string, detail?: string, scenes?: SceneStatus[]) {
      current = { ...current, state: "failed", error, detail, scenes, finishedAt: new Date().toISOString() };
      return publish(true);
    },
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { formats: { type: "string", default: "16x9,9x16" } },
  });
  const jobId = positionals[0] ?? "";
  assertJobId(jobId);
  const formats = values.formats.split(",").map((f) => f.trim()) as VideoFormat[];
  if (!formats.length || formats.some((f) => !VIDEO_FORMATS.includes(f))) throw new Error(`Invalid --formats ${values.formats}`);

  const store = createStore();
  if (store.kind !== "r2") throw new Error("The cloud worker needs the R2_* variables.");
  const prefix = keys.jobDir(jobId);
  const status = cloudStatus(store, jobId);
  const work = await mkdtemp(path.join(tmpdir(), `story-${jobId}-`));
  const warnings: string[] = [];
  const t0 = Date.now();
  const lap = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

  try {
    // 1. Story, style snapshot and music
    await status.stage("voices", "Preparing");
    const jobText = await store.getText(keys.job(jobId));
    if (!jobText) throw new Error(`Story ${jobId} not found in storage`);
    const job = JSON.parse(jobText) as JobFile;
    const style = job.style ?? (await getStyle(store));
    const localJob: JobFile = { ...job, style: { ...style, music: { ...style.music } } };
    if (style.music.file?.startsWith("settings/music/")) {
      const name = style.music.file.split("/").pop()!;
      await store.getToFile(style.music.file, path.join(work, "music", name));
      localJob.style!.music.file = `music/${name}`;
    }
    await writeFile(path.join(work, "job.json"), JSON.stringify(localJob, null, 2));
    lap("story downloaded");

    // 2. Voices (unchanged lines are reused from the clips already in storage)
    await downloadPrefix(store, `${prefix}audio/`, path.join(work, "audio"));
    const voices = await voiceJob({
      jobDir: work,
      providers: defaultProviders(),
      onLog: (m) => console.log(`  ${m}`),
      onProgress: (done, total, message) => status.progress(done / total, message),
    });
    warnings.push(...voices.warnings);
    await mirrorDir(store, path.join(work, "audio"), `${prefix}audio/`);
    lap(`voices: ${voices.synthesized} new, ${voices.reused} reused (${voices.provider})`);

    // 3. Images, straight into storage; then fetch them for rendering
    await status.stage("images", "Drawing scenes");
    const results = await ensureSceneImages({ store, prefix }, localJob, imageProviders(), {
      onProgress: (done, total, message) => status.progress(done / total, message),
    });
    const scenes: SceneStatus[] = results.map((r) => ({
      index: r.scene,
      state: r.result === "failed" ? "failed" : "ok",
      error: r.error,
    }));
    status.set({ scenes });
    const failed = results.filter((r) => r.result === "failed");
    if (failed.length) {
      throw Object.assign(new Error(`${failed.length} scene image(s) failed. Retry, or upload images for those scenes.`), { scenes });
    }
    await downloadPrefix(store, `${prefix}images/`, path.join(work, "images"));
    lap(`images: ${results.filter((r) => r.result === "generated").length} new, ${results.length} total`);

    // 4. Render each format and upload it
    await status.stage("render", `Rendering ${formats.join(" and ")}`);
    const outputs: OutputInfo[] = [];
    for (const [i, format] of formats.entries()) {
      const result = await renderVideo({
        jobDir: work,
        format,
        onProgress: (f) => status.progress((i + f) / formats.length, `Rendering ${format}`),
      });
      warnings.push(...result.warnings);
      const file = outputName(format);
      await store.putFile(`${prefix}${file}`, result.outputPath, "video/mp4");
      outputs.push({ file, format, bytes: result.bytes, durationSec: result.durationSec, renderSec: result.renderSec });
      lap(`rendered ${format}: ${(result.bytes / 1e6).toFixed(1)} MB in ${result.renderSec.toFixed(1)} s`);
    }

    await status.done(outputs, warnings);
    lap("done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = err instanceof FfmpegError ? err.stderrTail : undefined;
    const scenes = (err as { scenes?: SceneStatus[] }).scenes;
    await status.failed(message, detail, scenes);
    throw err;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(`\nCloud run failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof FfmpegError) console.error(err.stderrTail);
  process.exit(1);
});
