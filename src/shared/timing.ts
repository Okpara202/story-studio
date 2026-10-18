export interface TimingOptions {
  fps: number;
  /** Silence before the first line of each scene. */
  leadInSec: number;
  /** Silence between lines inside a scene. */
  lineGapSec: number;
  /** Silence after the last line of a scene. */
  tailSec: number;
  /** Duration of a scene that has no lines. */
  emptySceneSec: number;
}

export const DEFAULT_TIMING: TimingOptions = {
  fps: 30,
  leadInSec: 0.3,
  lineGapSec: 0.35,
  tailSec: 0.8,
  emptySceneSec: 3,
};

export interface TimedLine {
  start: number;
  end: number;
}

export interface TimedScene {
  start: number;
  end: number;
  duration: number;
  /** Duration in whole frames; the renderer uses this for exact cuts. */
  frames: number;
  lines: TimedLine[];
}

export interface Timeline {
  totalSec: number;
  totalFrames: number;
  scenes: TimedScene[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Lay scenes out back to back. Each scene's length is rounded up to a whole
 * frame so video cuts and audio offsets stay in sync over long stories.
 */
export function computeTimeline(
  lineDurations: number[][],
  opts: TimingOptions = DEFAULT_TIMING,
): Timeline {
  let frameCursor = 0;
  const scenes = lineDurations.map((durations): TimedScene => {
    const start = frameCursor / opts.fps;
    let t = opts.leadInSec;
    const lines = durations.map((d, i) => {
      if (i > 0) t += opts.lineGapSec;
      const line = { start: round3(start + t), end: round3(start + t + d) };
      t += d;
      return line;
    });
    const raw = durations.length ? t + opts.tailSec : opts.emptySceneSec;
    const frames = Math.ceil(raw * opts.fps - 1e-6);
    frameCursor += frames;
    return {
      start: round3(start),
      end: round3(frameCursor / opts.fps),
      duration: round3(frames / opts.fps),
      frames,
      lines,
    };
  });
  return {
    totalSec: round3(frameCursor / opts.fps),
    totalFrames: frameCursor,
    scenes,
  };
}

/**
 * Speaking rate for estimates before any audio exists (words per second).
 * Edge voices measured ~3.8 after silence trimming; slightly conservative here.
 */
export const WORDS_PER_SEC = 3.5;

export function estimateLineSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / WORDS_PER_SEC;
}

/** Estimated video length from text alone, for the editor preview. */
export function estimateStorySec(
  scenes: { lines: { text: string }[] }[],
  opts: TimingOptions = DEFAULT_TIMING,
): number {
  return computeTimeline(
    scenes.map((s) => s.lines.map((l) => estimateLineSec(l.text))),
    opts,
  ).totalSec;
}

export function formatDuration(sec: number): string {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
