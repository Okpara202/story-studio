import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseScript } from "../../src/shared/script/parse.ts";
import { lineAudioBase, type JobFile } from "../../src/shared/job.ts";
import { DEFAULT_NARRATOR_VOICE, suggestVoices } from "../../src/shared/voices.ts";
import type { TtsProvider } from "../tts/types.ts";
import { errorMessage } from "../tts/types.ts";
import { probeDuration, runFfmpeg } from "./ffmpeg.ts";

/** Bump when post-processing changes, so cached clips are rebuilt. */
const CLIP_VERSION = 1;

export interface PlannedLine {
  /** File base name, e.g. "s01-l03". */
  key: string;
  speakerId: string;
  voiceId: string;
  text: string;
}

export interface ClipEntry {
  hash: string;
  voiceId: string;
  durationSec: number;
}

/** audio/manifest.json: which clip was made from what, so unchanged lines are never re-voiced. */
export interface AudioManifest {
  version: 1;
  provider: string;
  clips: Record<string, ClipEntry>;
}

/** Which voice speaks which line. Uses the same casting rules as the editor UI. */
export function planLines(job: JobFile): PlannedLine[] {
  const story = parseScript(job.script);
  const narrator = job.style?.narratorVoice ?? DEFAULT_NARRATOR_VOICE;
  const cast = suggestVoices(story.characters.map((c) => c.id), job.voices, narrator);
  return story.scenes.flatMap((scene) =>
    scene.lines.map((line, i) => ({
      key: lineAudioBase(scene.index, i + 1),
      speakerId: line.speakerId,
      voiceId: cast[line.speakerId],
      text: line.text,
    })),
  );
}

export function clipHash(provider: string, voiceId: string, text: string): string {
  return createHash("sha256").update(`${CLIP_VERSION}\n${provider}\n${voiceId}\n${text}`).digest("hex").slice(0, 16);
}

/**
 * Trim leading/trailing silence (TTS engines pad each clip, which would
 * stretch the pauses between lines) and store as compact mono MP3.
 */
export async function finishClip(rawFile: string, outFile: string): Promise<void> {
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05";
  await runFfmpeg([
    "-i", rawFile,
    "-af", `${trim},areverse,${trim.replace("0.05", "0.08")},areverse`,
    "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-ar", "24000",
    "-y", outFile,
  ]);
}

async function readManifest(audioDir: string): Promise<AudioManifest | null> {
  try {
    return JSON.parse(await readFile(path.join(audioDir, "manifest.json"), "utf8")) as AudioManifest;
  } catch {
    return null;
  }
}

export interface VoiceJobOptions {
  jobDir: string;
  /** Tried in order; the whole story uses one provider so voices stay consistent. */
  providers: TtsProvider[];
  /** Re-voice every line even if unchanged. */
  force?: boolean;
  onProgress?: (done: number, total: number, message: string) => void;
  onLog?: (message: string) => void;
}

export interface VoiceJobResult {
  provider: string;
  total: number;
  synthesized: number;
  reused: number;
  /** Problems with providers that were skipped or failed before one succeeded. */
  warnings: string[];
}

export async function voiceJob(opts: VoiceJobOptions): Promise<VoiceJobResult> {
  const log = opts.onLog ?? (() => {});
  const audioDir = path.join(opts.jobDir, "audio");
  const job = JSON.parse(await readFile(path.join(opts.jobDir, "job.json"), "utf8")) as JobFile;
  const lines = planLines(job);
  if (lines.length === 0) throw new Error("The script has no spoken lines.");

  const warnings: string[] = [];
  for (const provider of opts.providers) {
    const availability = await provider.available();
    if (!availability.ok) {
      warnings.push(`${provider.name}: ${availability.reason}`);
      log(`Skipping ${provider.name}: ${availability.reason}`);
      continue;
    }
    try {
      const result = await voiceWith(provider, lines, audioDir, opts);
      return { ...result, warnings };
    } catch (err) {
      warnings.push(`${provider.name}: ${errorMessage(err)}`);
      log(`${provider.name} failed: ${errorMessage(err)}`);
    }
  }
  throw new Error(`No voice provider could voice this story.\n  ${warnings.join("\n  ")}`);
}

async function voiceWith(
  provider: TtsProvider,
  lines: PlannedLine[],
  audioDir: string,
  opts: VoiceJobOptions,
): Promise<Omit<VoiceJobResult, "warnings">> {
  const old = await readManifest(audioDir);
  // Existing clips by content hash, so a line that moved (new key) is still reused.
  const byHash = new Map<string, { file: string; entry: ClipEntry }>();
  if (old && !opts.force) {
    for (const [key, entry] of Object.entries(old.clips)) {
      const file = path.join(audioDir, `${key}.mp3`);
      if (existsSync(file)) byHash.set(entry.hash, { file, entry });
    }
  }

  // Build the new set in a staging folder; the current audio stays intact until everything succeeded.
  const staging = path.join(audioDir, ".next");
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    await provider.prepare?.([...new Set(lines.map((l) => l.voiceId))]);
    const clips: Record<string, ClipEntry> = {};
    let synthesized = 0;
    for (const [i, line] of lines.entries()) {
      const hash = clipHash(provider.name, line.voiceId, line.text);
      const out = path.join(staging, `${line.key}.mp3`);
      const cached = byHash.get(hash);
      if (cached) {
        await copyFile(cached.file, out);
        clips[line.key] = { ...cached.entry, hash };
      } else {
        opts.onProgress?.(i, lines.length, `Voicing line ${i + 1} of ${lines.length}`);
        const raw = await provider.synthesize(line.text, line.voiceId, path.join(staging, `${line.key}.raw`));
        await finishClip(raw, out);
        await rm(raw, { force: true });
        clips[line.key] = { hash, voiceId: line.voiceId, durationSec: await probeDuration(out) };
        synthesized++;
      }
    }

    // Swap in: remove old line clips, move new ones up, write the manifest last.
    for (const name of await readdir(audioDir)) {
      if (/^s\d+-l\d+\./.test(name)) await rm(path.join(audioDir, name), { force: true });
    }
    for (const key of Object.keys(clips)) {
      await rename(path.join(staging, `${key}.mp3`), path.join(audioDir, `${key}.mp3`));
    }
    const manifest: AudioManifest = { version: 1, provider: provider.name, clips };
    await writeFile(path.join(audioDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    opts.onProgress?.(lines.length, lines.length, "Voices ready");
    return { provider: provider.name, total: lines.length, synthesized, reused: lines.length - synthesized };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
