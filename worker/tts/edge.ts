import { stat } from "node:fs/promises";
import { EdgeTTS } from "node-edge-tts";
import { voiceById } from "../../src/shared/voices.ts";
import { percent } from "../../src/shared/delivery.ts";
import { errorMessage, type Availability, type SpeakOptions, type TtsProvider } from "./types.ts";

export interface EdgeOptions {
  attempts: number;
  /** First retry delay; doubles each attempt. */
  backoffMs: number;
  /** First retry delay after a rate limit (HTTP 429); doubles each attempt. */
  rateLimitBackoffMs: number;
  timeoutMs: number;
  /** Pause between requests. Microsoft rate-limits bursts (HTTP 429). */
  spacingMs: number;
  /** Pause between requests once a rate limit has been hit in this run. */
  slowSpacingMs: number;
}

// A 12-minute story (198 lines) hit 429 from GitHub's runners with 2/4/8 s retries.
// After a 429: 15 s, 30 s, 60 s, 120 s (about 4 minutes), then every request spaced out.
const DEFAULTS: EdgeOptions = {
  attempts: 5,
  backoffMs: 2000,
  rateLimitBackoffMs: 15000,
  timeoutMs: 30000,
  spacingMs: 250,
  slowSpacingMs: 1500,
};

export const isRateLimit = (message: string) => /\b429\b|too many requests|rate limit/i.test(message);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Microsoft Edge "Read aloud" neural voices via the unofficial node-edge-tts
 * client. Free and high quality, but Microsoft can change or throttle the
 * service at any time, so failures are retried and the caller has a fallback.
 */
export class EdgeProvider implements TtsProvider {
  readonly name = "edge";
  readonly nativeProsody = true;
  private readonly opts: EdgeOptions;
  private lastRequest = 0;
  private spacing: number;

  constructor(opts: Partial<EdgeOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.spacing = this.opts.spacingMs;
  }

  async available(): Promise<Availability> {
    return { ok: true };
  }

  async synthesize(text: string, voiceId: string, outBase: string, opts: SpeakOptions = {}): Promise<string> {
    if (!voiceById(voiceId)) throw new Error(`Unknown voice "${voiceId}"`);
    const outFile = `${outBase}.mp3`;
    let lastError = "";
    for (let attempt = 1; attempt <= this.opts.attempts; attempt++) {
      const wait = this.lastRequest + this.spacing - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequest = Date.now();
      try {
        const tts = new EdgeTTS({
          voice: voiceId,
          lang: voiceId.slice(0, 5),
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          // Delivery cues: the free endpoint accepts prosody only (styles need Azure).
          rate: percent(opts.prosody?.rate ?? 0),
          pitch: percent(opts.prosody?.pitch ?? 0),
          volume: percent(opts.prosody?.volume ?? 0),
          timeout: this.opts.timeoutMs,
        });
        await tts.ttsPromise(text, outFile);
        // An empty file means the service accepted the request but returned no audio.
        if ((await stat(outFile)).size < 1000) throw new Error("Edge returned no audio");
        return outFile;
      } catch (err) {
        lastError = errorMessage(err);
        const limited = isRateLimit(lastError);
        // Once throttled, stay slower for the rest of the story instead of hitting the limit again.
        if (limited) this.spacing = Math.max(this.spacing, this.opts.slowSpacingMs);
        const base = limited ? this.opts.rateLimitBackoffMs : this.opts.backoffMs;
        if (attempt < this.opts.attempts) await sleep(base * 2 ** (attempt - 1));
      }
    }
    throw new Error(`Edge TTS failed after ${this.opts.attempts} attempts: ${lastError}`);
  }
}
