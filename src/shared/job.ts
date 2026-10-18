import { DEFAULT_NARRATOR_VOICE } from "./voices.ts";

/** Output framings. Each is rendered from the same source assets. */
export type VideoFormat = "16x9" | "9x16";
export const VIDEO_FORMATS: readonly VideoFormat[] = ["16x9", "9x16"];

export interface CaptionStyle {
  enabled: boolean;
  /** Font family name; falls back to the system default if missing. */
  font: string;
}

export interface MusicSettings {
  /**
   * In settings/style.json: the storage key, e.g. "settings/music/bed.mp3".
   * In a job's snapshot: the path inside the job folder, e.g. "music/bed.mp3".
   * Null = no music.
   */
  file: string | null;
  /** Music level relative to full scale. -20 dB sits well under a voice. */
  volumeDb: number;
}

export interface StyleSettings {
  /** Appended to every image prompt to keep the channel's look consistent. */
  artStyle: string;
  narratorVoice: string;
  music: MusicSettings;
  captions: CaptionStyle;
}

export interface SceneOverride {
  /** Focus point inside the image, 0..1 on each axis. Default 0.5 (centre). */
  focusX?: number;
  focusY?: number;
}

/** A short vertical teaser cut from the story at scene boundaries. */
export interface Snippet {
  /** Stable short id, e.g. "k3x9qa"; names the output file. */
  id: string;
  name: string;
  /** 1-based inclusive scene range. */
  from: number;
  to: number;
}

/** jobs/{jobId}/job.json */
export interface JobFile {
  version: 1;
  jobId: string;
  /** Copy of the script's `# Title`, kept so listings need no parsing. */
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Raw script; the worker re-parses it with the shared parser. */
  script: string;
  /** speakerId -> voiceId. Speakers missing here use style.narratorVoice. */
  voices: Record<string, string>;
  /** Snapshot of the channel style, taken when generation starts. Absent on drafts. */
  style?: StyleSettings;
  /** Keyed by 1-based scene number. */
  sceneOverrides?: Record<string, SceneOverride>;
  /** Teaser clips the owner picked; rendered as 9:16 videos. */
  snippets?: Snippet[];
  /** Set by "mark as downloaded". */
  downloadedAt?: string;
}

export const DEFAULT_STYLE: StyleSettings = {
  artStyle:
    "Dark noir ink-and-watercolour illustration, muted deep teal and amber palette, heavy black shadows, soft lamp light, grainy aged-paper texture, cinematic and atmospheric",
  narratorVoice: DEFAULT_NARRATOR_VOICE,
  music: { file: null, volumeDb: -20 },
  captions: { enabled: true, font: "DejaVu Sans" },
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Audio file base name for a line, e.g. "s01-l03". Extension is up to the TTS provider. */
export function lineAudioBase(sceneNo: number, lineNo: number): string {
  return `s${pad2(sceneNo)}-l${pad2(lineNo)}`;
}

/** Image base name for a scene, e.g. "scene-01". */
export function sceneImageBase(sceneNo: number): string {
  return `scene-${pad2(sceneNo)}`;
}

export const SNIPPETS_DIR = "output/snippets/";

export function outputName(format: VideoFormat, range?: { from: number; to: number }): string {
  if (!range) return `output/full-${format}.mp4`;
  return `${SNIPPETS_DIR}scenes-${pad2(range.from)}-${pad2(range.to)}-${format}.mp4`;
}
