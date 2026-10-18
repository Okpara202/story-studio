/**
 * Delivery cues: `NAME (whispering): text`.
 *
 * The free Edge voices accept only speed/pitch/volume (prosody), tested
 * 2026-10-18; real speaking styles need Azure Speech. Each cue therefore has
 * an approximation (always available) and the Azure style that replaces it
 * when a key is configured and the voice supports that style.
 */
export interface Prosody {
  /** Percent change, e.g. -15 = 15% slower. */
  rate: number;
  pitch: number;
  volume: number;
}

export interface CueInfo {
  /** Canonical cue name used in scripts. */
  name: string;
  /** Also accepted in scripts. */
  aliases: string[];
  /** Plain-language description for the guide. */
  description: string;
  approx: Prosody;
  /** Azure Speech style (mstts:express-as), when one exists. */
  azureStyle?: string;
}

export const CUES: CueInfo[] = [
  { name: "whispering", aliases: ["whisper", "whispers", "hushed"], description: "Hushed, close to the ear", approx: { rate: -15, pitch: -5, volume: -60 }, azureStyle: "whispering" },
  { name: "sad", aliases: ["sadly", "grieving", "mournful"], description: "Heavy, low and slow", approx: { rate: -22, pitch: -8, volume: -15 }, azureStyle: "sad" },
  { name: "cold", aliases: ["flat", "calm", "detached"], description: "Flat, controlled, unhurried", approx: { rate: -12, pitch: -10, volume: 0 }, azureStyle: "unfriendly" },
  { name: "scared", aliases: ["terrified", "afraid", "fearful", "nervous"], description: "Frightened, quicker and higher", approx: { rate: 18, pitch: 12, volume: 0 }, azureStyle: "terrified" },
  { name: "urgent", aliases: ["fast", "hurried", "rushed"], description: "Hurried, pressing", approx: { rate: 25, pitch: 4, volume: 10 }, azureStyle: "excited" },
  { name: "angry", aliases: ["furious", "harsh"], description: "Hard and forceful", approx: { rate: 10, pitch: 6, volume: 25 }, azureStyle: "angry" },
  { name: "shouting", aliases: ["shout", "yelling", "loud"], description: "Raised voice", approx: { rate: 8, pitch: 10, volume: 40 }, azureStyle: "shouting" },
  { name: "slow", aliases: ["slowly", "measured"], description: "Deliberately slow", approx: { rate: -25, pitch: 0, volume: 0 } },
  { name: "soft", aliases: ["softly", "quiet", "quietly", "gentle"], description: "Quiet and gentle", approx: { rate: -8, pitch: 0, volume: -35 } },
];

const BY_NAME = new Map<string, CueInfo>();
for (const cue of CUES) for (const n of [cue.name, ...cue.aliases]) BY_NAME.set(n, cue);

export function findCue(word: string): CueInfo | undefined {
  return BY_NAME.get(word.trim().toLowerCase());
}

/** Combine several cues: changes add up, clamped to ranges the voices handle well. */
export function prosodyFor(cues: string[]): Prosody | null {
  const known = cues.map(findCue).filter((c): c is CueInfo => c !== undefined);
  if (known.length === 0) return null;
  const sum = (k: keyof Prosody, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, known.reduce((n, c) => n + c.approx[k], 0)));
  return { rate: sum("rate", -40, 50), pitch: sum("pitch", -20, 20), volume: sum("volume", -70, 50) };
}

/** First cue that has a real Azure style, if any. */
export function azureStyleFor(cues: string[]): string | undefined {
  return cues.map(findCue).find((c) => c?.azureStyle)?.azureStyle;
}

/** "+15%" style strings for TTS engines. */
export function percent(n: number): string {
  return n === 0 ? "default" : `${n > 0 ? "+" : ""}${n}%`;
}
