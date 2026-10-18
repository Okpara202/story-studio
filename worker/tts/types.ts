export type Availability = { ok: true } | { ok: false; reason: string };

/**
 * A text-to-speech backend. Voice ids are always catalog ids from
 * src/shared/voices.ts; each provider maps them to its own voices.
 */
export interface TtsProvider {
  readonly name: string;
  /** Cheap check that the provider can run in this environment. */
  available(): Promise<Availability>;
  /** Called once per job with every voice in the cast (download models, pick distinct voices). */
  prepare?(voiceIds: string[]): Promise<void>;
  /** Speak `text` with `voiceId` into `${outBase}.<ext>` (extension chosen by the provider). Returns the file path. */
  synthesize(text: string, voiceId: string, outBase: string): Promise<string>;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}
