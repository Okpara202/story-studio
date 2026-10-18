import { stat } from "node:fs/promises";
import { EdgeTTS } from "node-edge-tts";
import { voiceById } from "../../src/shared/voices.ts";
import { errorMessage, type Availability, type TtsProvider } from "./types.ts";

export interface EdgeOptions {
  attempts: number;
  /** First retry delay; doubles each attempt. */
  backoffMs: number;
  timeoutMs: number;
  /** Pause between requests. Microsoft rate-limits bursts (HTTP 429). */
  spacingMs: number;
}

const DEFAULTS: EdgeOptions = { attempts: 4, backoffMs: 2000, timeoutMs: 30000, spacingMs: 250 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Microsoft Edge "Read aloud" neural voices via the unofficial node-edge-tts
 * client. Free and high quality, but Microsoft can change or throttle the
 * service at any time, so failures are retried and the caller has a fallback.
 */
export class EdgeProvider implements TtsProvider {
  readonly name = "edge";
  private readonly opts: EdgeOptions;
  private lastRequest = 0;

  constructor(opts: Partial<EdgeOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  async available(): Promise<Availability> {
    return { ok: true };
  }

  async synthesize(text: string, voiceId: string, outBase: string): Promise<string> {
    if (!voiceById(voiceId)) throw new Error(`Unknown voice "${voiceId}"`);
    const outFile = `${outBase}.mp3`;
    let lastError = "";
    for (let attempt = 1; attempt <= this.opts.attempts; attempt++) {
      const wait = this.lastRequest + this.opts.spacingMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequest = Date.now();
      try {
        const tts = new EdgeTTS({
          voice: voiceId,
          lang: voiceId.slice(0, 5),
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          timeout: this.opts.timeoutMs,
        });
        await tts.ttsPromise(text, outFile);
        // An empty file means the service accepted the request but returned no audio.
        if ((await stat(outFile)).size < 1000) throw new Error("Edge returned no audio");
        return outFile;
      } catch (err) {
        lastError = errorMessage(err);
        if (attempt < this.opts.attempts) await sleep(this.opts.backoffMs * 2 ** (attempt - 1));
      }
    }
    throw new Error(`Edge TTS failed after ${this.opts.attempts} attempts: ${lastError}`);
  }
}
