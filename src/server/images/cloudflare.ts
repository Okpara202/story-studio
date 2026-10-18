import { ConfigError, QuotaError, type GeneratedImage, type ImageOptions, type ImageProvider } from "./types.ts";

/**
 * Workers AI image models we use. Both have Apache-2.0 weights, so images can
 * be used commercially. Tested live 2026-10-18.
 */
export const CLOUDFLARE_MODELS = {
  /**
   * FLUX.2 [klein] 4B: better texture, any size (we use 4:3), seeds work, ~12 s. Multipart request.
   * Takes up to 4 reference images (input_image_0..3, under 512x512) for keeping characters consistent.
   */
  flux2: {
    name: "cloudflare-flux2",
    model: "@cf/black-forest-labs/flux-2-klein-4b",
    multipart: true,
    typicalSeconds: 15,
  },
  /**
   * FLUX.1 [schnell]: fast (~2 s), but fixed 1024x1024 and the live API rejects `seed`
   * (although the docs example sends one). Backup if FLUX.2 fails.
   */
  flux1: {
    name: "cloudflare-flux1",
    model: "@cf/black-forest-labs/flux-1-schnell",
    multipart: false,
    typicalSeconds: 4,
  },
} as const;

export interface CloudflareImageConfig {
  accountId: string;
  apiToken: string;
  model?: keyof typeof CLOUDFLARE_MODELS;
  attempts?: number;
  /** Base delay between retries; grows with each attempt. */
  retryDelayMs?: number;
}

interface CloudflareResponse {
  success?: boolean;
  result?: { image?: string };
  errors?: { code?: number; message?: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cloudflare Workers AI. Free plan: 10,000 neurons per day, reset at 00:00 UTC.
 * Images are 4:3 (FLUX.2) or square (FLUX.1): both leave room to frame 16:9 and 9:16.
 */
export class CloudflareImageProvider implements ImageProvider {
  readonly name: string;
  readonly typicalSeconds: number;
  private readonly preset: (typeof CLOUDFLARE_MODELS)[keyof typeof CLOUDFLARE_MODELS];
  private readonly cfg: Required<CloudflareImageConfig>;

  constructor(cfg: CloudflareImageConfig) {
    this.cfg = { model: "flux2", attempts: 3, retryDelayMs: 3000, ...cfg };
    this.preset = CLOUDFLARE_MODELS[this.cfg.model];
    this.name = this.preset.name;
    this.typicalSeconds = this.preset.typicalSeconds;
  }

  private body(prompt: string, opts: ImageOptions): FormData | string {
    if (!this.preset.multipart) return JSON.stringify({ prompt, steps: 6 });
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", String(opts.size?.width ?? 1024));
    form.append("height", String(opts.size?.height ?? 768));
    form.append("steps", "4");
    form.append("seed", String(opts.seed));
    // FLUX.2 multi-reference: up to 4 pictures, named exactly input_image_0..3.
    (opts.references ?? []).slice(0, 4).forEach((data, i) => {
      form.append(`input_image_${i}`, new Blob([new Uint8Array(data)], { type: "image/jpeg" }), `ref-${i}.jpg`);
    });
    return form;
  }

  async generate(prompt: string, opts: ImageOptions): Promise<GeneratedImage> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.cfg.accountId}/ai/run/${this.preset.model}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.apiToken}` };
    // FormData sets its own multipart Content-Type (with boundary).
    if (!this.preset.multipart) headers["Content-Type"] = "application/json";
    let last = "";
    for (let attempt = 1; attempt <= this.cfg.attempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body: this.body(prompt, opts),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
        await sleep(this.cfg.retryDelayMs * attempt);
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as CloudflareResponse;
      const message = body.errors?.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") || `HTTP ${res.status}`;

      if (res.ok && body.result?.image) {
        return { data: Buffer.from(body.result.image, "base64"), ext: "jpg" };
      }
      if (res.status === 401 || res.status === 403) {
        throw new ConfigError(`Cloudflare rejected the API token (${message}). It needs the "Workers AI" permission.`);
      }
      if (/daily free allocation|neurons/i.test(message) || body.errors?.some((e) => e.code === 4006)) {
        throw new QuotaError(`Cloudflare's free daily image allowance is used up; it resets at 00:00 UTC (${message}).`);
      }
      last = message;
      // 429 and 5xx are worth retrying; anything else (e.g. a flagged prompt) is not.
      if (res.status !== 429 && res.status < 500) break;
      await sleep(this.cfg.retryDelayMs * attempt);
    }
    throw new Error(`Cloudflare (${this.preset.model.split("/").pop()}) image generation failed: ${last}`);
  }
}
