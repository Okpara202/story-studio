#!/usr/bin/env node
// Standalone renderer CLI. Runs anywhere Node 22.18+ runs: GitHub Actions, a laptop, a VPS.
//
//   node worker/render.ts <jobDir> [--format 16x9|9x16] [--scenes 1-4] [--out file.mp4]
//                                  [--crf 23] [--preset veryfast] [--no-status]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseScript } from "../src/shared/script/parse.ts";
import { VIDEO_FORMATS, type JobFile, type VideoFormat } from "../src/shared/job.ts";
import { parseSceneRange, renderVideo, type SceneRange } from "./lib/render.ts";
import { FfmpegError } from "./lib/ffmpeg.ts";
import { statusWriter } from "./lib/status.ts";

const USAGE = `Usage: node worker/render.ts <jobDir> [--format 16x9|9x16] [--scenes a-b] [--out path] [--crf n] [--preset name] [--no-status]`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: "string", default: "16x9" },
      scenes: { type: "string" },
      out: { type: "string" },
      crf: { type: "string" },
      preset: { type: "string" },
      "no-status": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || positionals.length !== 1) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }
  const jobDir = path.resolve(positionals[0]);
  const format = values.format as VideoFormat;
  if (!VIDEO_FORMATS.includes(format)) {
    throw new Error(`Unknown --format "${values.format}". Use one of: ${VIDEO_FORMATS.join(", ")}.`);
  }

  let scenes: SceneRange | undefined;
  if (values.scenes) {
    const job = JSON.parse(await readFile(path.join(jobDir, "job.json"), "utf8")) as JobFile;
    scenes = parseSceneRange(values.scenes, parseScript(job.script).scenes.length);
  }

  const target = scenes ? `${format}, scenes ${scenes.from}-${scenes.to}` : format;
  const status = statusWriter(jobDir, "render", { enabled: !values["no-status"] });
  status.running(0, `Rendering ${target}`);

  let lastPct = -1;
  try {
    const result = await renderVideo({
      jobDir,
      format,
      scenes,
      out: values.out,
      crf: values.crf ? Number(values.crf) : undefined,
      preset: values.preset,
      onLog: (m) => console.log(m),
      onProgress: (f) => {
        const pct = Math.floor(f * 100);
        if (pct === lastPct) return;
        lastPct = pct;
        process.stdout.write(`\r  ${pct}%`);
        status.running(f);
      },
    });
    process.stdout.write("\n");
    for (const w of result.warnings) console.warn(`Warning: ${w}`);
    const mb = (result.bytes / 1024 / 1024).toFixed(1);
    console.log(
      `Done: ${result.outputPath}\n  ${result.durationSec.toFixed(1)} s video, ${mb} MB, rendered in ${result.renderSec.toFixed(1)} s`,
    );
    await status.done({
      message: `Rendered ${target}`,
      warnings: result.warnings,
      outputs: [
        {
          file: path.relative(jobDir, result.outputPath).replace(/\\/g, "/"),
          format,
          bytes: result.bytes,
          durationSec: result.durationSec,
          renderSec: result.renderSec,
        },
      ],
    });
  } catch (err) {
    await status.failed(err);
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(`\nRender failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof FfmpegError && err.stderrTail) console.error(err.stderrTail);
  process.exit(1);
});
