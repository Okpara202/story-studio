import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseScript } from "../../src/shared/script/parse.ts";
import type { Scene } from "../../src/shared/script/types.ts";
import { computeTimeline, DEFAULT_TIMING, scenePauses } from "../../src/shared/timing.ts";
import { emphasisPerWord, splitCaption, type CaptionEvent } from "../../src/shared/captions.ts";
import {
  lineAudioBase,
  outputName,
  sceneImageBase,
  DEFAULT_STYLE,
  type JobFile,
  type VideoFormat,
} from "../../src/shared/job.ts";
import type { SceneTime } from "../../src/shared/status.ts";
import { FORMATS } from "./formats.ts";
import { lerpExpr, planMotion } from "./motion.ts";
import { buildAss } from "./ass.ts";
import { probeDuration, probeImageSize, runFfmpeg } from "./ffmpeg.ts";

export interface SceneRange {
  from: number;
  to: number;
}

export interface RenderOptions {
  jobDir: string;
  format: VideoFormat;
  /** 1-based inclusive scene range; whole story when omitted. */
  scenes?: SceneRange;
  /** Output path relative to jobDir; defaults to the standard layout. */
  out?: string;
  /** x264 quality, 18 (big, sharp) .. 28 (small, soft). */
  crf?: number;
  preset?: string;
  onProgress?: (fraction: number) => void;
  onLog?: (message: string) => void;
}

export interface RenderResult {
  outputPath: string;
  bytes: number;
  durationSec: number;
  renderSec: number;
  warnings: string[];
  /** Start and length of each rendered scene, from the real audio. */
  sceneTimes: SceneTime[];
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".ogg"];
const FPS = DEFAULT_TIMING.fps;

export function parseSceneRange(value: string, sceneCount: number): SceneRange {
  const m = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid --scenes "${value}". Use a range like 1-4 or a single scene like 3.`);
  const from = Number(m[1]);
  const to = Number(m[2] ?? m[1]);
  if (from < 1 || to < from || to > sceneCount) {
    throw new Error(`--scenes ${value} is out of range; the story has ${sceneCount} scenes.`);
  }
  return { from, to };
}

function findFile(jobDir: string, dir: string, base: string, exts: string[]): string | null {
  for (const ext of exts) {
    const rel = `${dir}/${base}${ext}`;
    if (existsSync(path.join(jobDir, rel))) return rel;
  }
  return null;
}

/**
 * The image named in images/scene-NN.json, if that file exists. Preferred over
 * guessing by extension, so a stray file from an interrupted upload is never used.
 */
function recordedImage(jobDir: string, sceneNo: number): string | null {
  try {
    const entry = JSON.parse(readFileSync(path.join(jobDir, "images", `${sceneImageBase(sceneNo)}.json`), "utf8")) as {
      file?: string;
    };
    const rel = `images/${entry.file}`;
    return entry.file && existsSync(path.join(jobDir, rel)) ? rel : null;
  } catch {
    return null;
  }
}

/** Run async tasks with a small concurrency limit, keeping result order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

interface SceneAssets {
  scene: Scene;
  image: string;
  audio: string[];
}

function resolveAssets(jobDir: string, scenes: Scene[]): SceneAssets[] {
  const missing: string[] = [];
  const assets = scenes.map((scene) => {
    const image = recordedImage(jobDir, scene.index) ?? findFile(jobDir, "images", sceneImageBase(scene.index), IMAGE_EXTS);
    if (!image) missing.push(`images/${sceneImageBase(scene.index)}.png (scene ${scene.index})`);
    const audio = scene.lines.map((_, i) => {
      const base = lineAudioBase(scene.index, i + 1);
      const file = findFile(jobDir, "audio", base, AUDIO_EXTS);
      if (!file) missing.push(`audio/${base}.mp3 (scene ${scene.index}, line ${i + 1})`);
      return file ?? "";
    });
    return { scene, image: image ?? "", audio };
  });
  if (missing.length) {
    throw new Error(`Missing files in the job folder:\n  ${missing.join("\n  ")}`);
  }
  return assets;
}

/**
 * Render one video from a job folder in a single ffmpeg pass:
 * scenes are panned stills, joined, captioned, with narration and music mixed under.
 * ffmpeg runs inside jobDir with relative paths, which keeps the command short on Windows.
 */
export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const started = Date.now();
  const log = opts.onLog ?? (() => {});
  const warnings: string[] = [];
  const jobDir = path.resolve(opts.jobDir);
  const spec = FORMATS[opts.format];
  const abs = (rel: string) => path.join(jobDir, rel);

  const job = JSON.parse(await readFile(path.join(jobDir, "job.json"), "utf8")) as JobFile;
  const story = parseScript(job.script);
  const style = job.style ?? DEFAULT_STYLE;
  if (!story.ok) {
    const errors = story.issues.filter((i) => i.severity === "error");
    throw new Error(`Script has errors:\n  ${errors.map((e) => `line ${e.line ?? "-"}: ${e.message}`).join("\n  ")}`);
  }
  const range = opts.scenes;
  const scenes = range ? story.scenes.slice(range.from - 1, range.to) : story.scenes;

  const tag = `${opts.format}${range ? `-s${range.from}-${range.to}` : ""}`;
  const workRel = `.render-tmp-${tag}`;
  const outRel = (opts.out ?? outputName(opts.format, range)).replace(/\\/g, "/");
  const partRel = outRel.replace(/\.mp4$/i, "") + ".part.mp4";

  try {
    const assets = resolveAssets(jobDir, scenes);

    log(`Measuring ${assets.reduce((n, a) => n + a.audio.length, 0)} audio clips...`);
    const durations = await Promise.all(assets.map((a) => mapLimit(a.audio, 4, (f) => probeDuration(abs(f)))));
    const timeline = computeTimeline(durations, DEFAULT_TIMING, scenePauses(scenes));
    const total = timeline.totalSec;
    log(`Story length ${total.toFixed(1)} s across ${scenes.length} scenes.`);

    await rm(abs(workRel), { recursive: true, force: true });
    await mkdir(abs(workRel), { recursive: true });
    await mkdir(path.dirname(abs(outRel)), { recursive: true });

    // Captions
    const captionsOn = style.captions.enabled;
    if (captionsOn) {
      const events: CaptionEvent[] = assets.flatMap((a, si) =>
        a.scene.lines.flatMap((line, li) => {
          const t = timeline.scenes[si].lines[li];
          return splitCaption(emphasisPerWord(line.caption), t.start, t.end, spec.caption.maxCharsPerLine, spec.caption.maxLines);
        }),
      );
      await writeFile(abs(`${workRel}/captions.ass`), buildAss(events, spec, style.captions.font));
    }

    // Inputs: images, then line audio, then optional looping music.
    const args: string[] = [];
    for (const a of assets) args.push("-i", a.image);
    const audioInputs = assets.flatMap((a, si) =>
      a.audio.map((file, li) => ({ file, start: timeline.scenes[si].lines[li].start })),
    );
    for (const a of audioInputs) args.push("-i", a.file);
    let musicIndex = -1;
    const musicFile = style.music.file;
    if (musicFile) {
      if (existsSync(abs(musicFile))) {
        musicIndex = assets.length + audioInputs.length;
        args.push("-stream_loop", "-1", "-i", musicFile);
      } else {
        warnings.push(`Music file "${musicFile}" not found; rendered without music.`);
      }
    }

    const graph: string[] = [];
    const sizes = await mapLimit(assets, 4, (a) => probeImageSize(abs(a.image)));
    assets.forEach((a, i) => {
      const t = timeline.scenes[i];
      const o = job.sceneOverrides?.[String(a.scene.index)];
      const plan = planMotion(sizes[i], { w: spec.width, h: spec.height }, a.scene.index, {
        x: o?.focusX ?? 0.5,
        y: o?.focusY ?? 0.5,
      });
      const last = t.frames - 1;
      graph.push(
        `[${i}:v]scale=${plan.scaled.w}:${plan.scaled.h}:flags=lanczos,setsar=1,format=rgb24,` +
          `loop=loop=${last}:size=1:start=0,setpts=N/(${FPS}*TB),` +
          `crop=${spec.width}:${spec.height}:x=${lerpExpr(plan.from.x, plan.to.x, last)}:y=${lerpExpr(plan.from.y, plan.to.y, last)},` +
          `format=yuv420p[v${i}]`,
      );
    });
    const concatIn = assets.map((_, i) => `[v${i}]`).join("");
    graph.push(
      `${concatIn}concat=n=${assets.length}:v=1:a=0${captionsOn ? `[vc];[vc]subtitles=filename=${workRel}/captions.ass` : ""}[vout]`,
    );

    const audioFmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
    audioInputs.forEach((a, k) => {
      const ms = Math.round(a.start * 1000);
      graph.push(`[${assets.length + k}:a]${audioFmt},adelay=delays=${ms}:all=1[a${k}]`);
    });
    const narrIn = audioInputs.map((_, k) => `[a${k}]`).join("");
    graph.push(
      `${narrIn}amix=inputs=${audioInputs.length}:normalize=0:dropout_transition=0,apad,atrim=end=${total}[narr]`,
    );
    if (musicIndex >= 0) {
      const fadeOut = Math.max(0, total - 3);
      graph.push(
        `[${musicIndex}:a]${audioFmt},volume=${style.music.volumeDb}dB,atrim=end=${total},` +
          `afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=3[mus]`,
        `[narr][mus]amix=inputs=2:normalize=0:duration=first[mix]`,
      );
    } else {
      graph.push(`[narr]anull[mix]`);
    }
    // YouTube and the short-video apps play at about -14 LUFS and do not turn quiet videos up.
    graph.push(`[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
    const graphFile = `${workRel}/graph.txt`;
    await writeFile(abs(graphFile), graph.join(";\n"));

    args.push(
      "-filter_complex_script", graphFile,
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", opts.preset ?? "veryfast", "-crf", String(opts.crf ?? 23),
      "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", String(FPS * 2),
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
      "-movflags", "+faststart",
      "-t", String(total),
      "-progress", "pipe:1", "-nostats",
      "-y", partRel,
    );

    log(`Rendering ${opts.format} (${spec.width}x${spec.height})...`);
    await runFfmpeg(args, {
      cwd: jobDir,
      onProgress: (sec) => opts.onProgress?.(Math.min(1, sec / total)),
    });
    await rename(abs(partRel), abs(outRel));
    const { size } = await stat(abs(outRel));
    return {
      outputPath: abs(outRel),
      bytes: size,
      durationSec: total,
      renderSec: (Date.now() - started) / 1000,
      warnings,
      sceneTimes: timeline.scenes.map((t, i) => ({ index: assets[i].scene.index, start: t.start, sec: t.duration })),
    };
  } catch (err) {
    await rm(abs(partRel), { force: true });
    throw err;
  } finally {
    await rm(abs(workRel), { recursive: true, force: true });
  }
}
