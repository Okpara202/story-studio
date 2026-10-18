import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

/** FFMPEG_PATH wins, then the ffmpeg-static binary, then `ffmpeg` on PATH. */
export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
}

export interface RunOptions {
  cwd?: string;
  /** Called with the encoded output time in seconds (needs `-progress pipe:1`). */
  onProgress?: (outSec: number) => void;
}

export class FfmpegError extends Error {
  readonly stderrTail: string;
  constructor(message: string, stderrTail: string) {
    super(message);
    this.name = "FfmpegError";
    this.stderrTail = stderrTail;
  }
}

/** Run ffmpeg with an argument array (no shell, so paths need no quoting). Resolves with stderr. */
export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), ["-hide_banner", "-nostdin", ...args], {
      cwd: opts.cwd,
      windowsHide: true,
    });
    let stderr = "";
    let stdoutBuf = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      // Keep memory bounded on long renders.
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.stdout.on("data", (d: Buffer) => {
      if (!opts.onProgress) return;
      stdoutBuf += d.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line.trim());
        if (m) opts.onProgress(Number(m[1]) / 1e6);
      }
    });
    child.on("error", (err) =>
      reject(new FfmpegError(`Could not start ffmpeg (${ffmpegBin()}): ${err.message}`, "")),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else {
        const tail = stderr.trim().split("\n").slice(-15).join("\n");
        reject(new FfmpegError(`ffmpeg exited with code ${code}`, tail));
      }
    });
  });
}

/** Pixel size of an image file. */
export async function probeImageSize(file: string): Promise<{ w: number; h: number }> {
  const stderr = await runFfmpeg(["-i", file, "-frames:v", "1", "-f", "null", "-"]);
  const m = /Video: .*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  if (!m) throw new Error(`Could not read image size of ${file}`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * Exact media duration in seconds, by decoding the audio to null.
 * Slower than reading the header but correct for VBR mp3 too.
 */
export async function probeDuration(file: string): Promise<number> {
  const stderr = await runFfmpeg(["-i", file, "-map", "0:a:0", "-f", "null", "-"]);
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = times.at(-1);
  if (!last) throw new Error(`Could not read duration of ${file}`);
  return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
}
