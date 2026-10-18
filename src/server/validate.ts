import type { StyleSettings } from "../shared/job.ts";

/**
 * Server Actions are public HTTP endpoints, so every input from the browser
 * is checked here before it reaches storage.
 */
export class ValidationError extends Error {}

const MAX_SCRIPT_CHARS = 200_000;

export function str(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") throw new ValidationError(`${name} must be text`);
  if (value.length > max) throw new ValidationError(`${name} is too long (max ${max} characters)`);
  return value;
}

export function sceneNo(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new ValidationError("Invalid scene number");
  }
  return value;
}

export function script(value: unknown): string {
  return str(value, "Script", MAX_SCRIPT_CHARS);
}

export function voices(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Voices must be an object");
  const entries = Object.entries(value);
  if (entries.length > 100) throw new ValidationError("Too many characters");
  return Object.fromEntries(entries.map(([k, v]) => [str(k, "Speaker", 60), str(v, "Voice", 100)]));
}

function num(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

export function style(value: unknown): StyleSettings {
  const v = value as StyleSettings;
  if (!v || typeof v !== "object" || !v.music || !v.captions) throw new ValidationError("Invalid style settings");
  const musicFile = v.music.file === null ? null : str(v.music.file, "Music file", 200);
  if (musicFile !== null && !musicFile.startsWith("settings/music/")) throw new ValidationError("Invalid music file");
  return {
    artStyle: str(v.artStyle, "Art style", 1000),
    narratorVoice: str(v.narratorVoice, "Narrator voice", 100),
    music: { file: musicFile, volumeDb: num(v.music.volumeDb, "Music level", -40, 0) },
    captions: {
      enabled: Boolean(v.captions.enabled),
      font: str(v.captions.font, "Caption font", 60),
    },
  };
}
