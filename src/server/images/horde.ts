import type { GeneratedImage, ImageOptions, ImageProvider } from "./types.ts";

export interface HordeConfig {
  /** Free key from https://aihorde.net/register; "0000000000" is anonymous (lowest priority). */
  apiKey: string;
  /** Give up after this long in the queue. */
  maxWaitMs?: number;
  pollMs?: number;
}

const BASE = "https://aihorde.net/api/v2";
const CLIENT = "story-studio:0.1:github";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * AI Horde: free, volunteer-run, no watermark. Slow: anonymous requests
 * waited ~30 minutes per image in testing (Oct 2026), so it is only used
 * when AI_HORDE_API_KEY is set, and only from the worker.
 */
export class HordeImageProvider implements ImageProvider {
  readonly name = "horde";
  readonly typicalSeconds = 600;
  private readonly cfg: Required<HordeConfig>;

  constructor(cfg: HordeConfig) {
    this.cfg = { maxWaitMs: 20 * 60_000, pollMs: 10_000, ...cfg };
  }

  private headers() {
    return { apikey: this.cfg.apiKey, "Client-Agent": CLIENT, "Content-Type": "application/json" };
  }

  async generate(prompt: string, opts: ImageOptions): Promise<GeneratedImage> {
    const submit = await fetch(`${BASE}/generate/async`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        prompt,
        params: { width: 1024, height: 1024, steps: 20, n: 1, seed: String(opts.seed) },
        r2: true,
      }),
    });
    const { id, message } = (await submit.json()) as { id?: string; message?: string };
    if (!submit.ok || !id) throw new Error(`AI Horde refused the request: ${message ?? submit.status}`);

    const deadline = Date.now() + this.cfg.maxWaitMs;
    try {
      while (Date.now() < deadline) {
        await sleep(this.cfg.pollMs);
        const check = (await (await fetch(`${BASE}/generate/check/${id}`, { headers: this.headers() })).json()) as {
          done?: boolean;
          faulted?: boolean;
        };
        if (check.faulted) throw new Error("AI Horde could not generate this image");
        if (!check.done) continue;
        const status = (await (await fetch(`${BASE}/generate/status/${id}`, { headers: this.headers() })).json()) as {
          generations?: { img?: string; censored?: boolean }[];
        };
        const gen = status.generations?.[0];
        if (!gen?.img || gen.censored) throw new Error("AI Horde returned no usable image");
        const img = await fetch(gen.img);
        return { data: Buffer.from(await img.arrayBuffer()), ext: "webp" };
      }
      throw new Error(`AI Horde did not finish within ${Math.round(this.cfg.maxWaitMs / 60000)} minutes`);
    } finally {
      // Free our place in the queue if we gave up or failed.
      await fetch(`${BASE}/generate/status/${id}`, { method: "DELETE", headers: this.headers() }).catch(() => {});
    }
  }
}
