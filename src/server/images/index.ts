import { CloudflareImageProvider } from "./cloudflare.ts";
import { HordeImageProvider } from "./horde.ts";
import type { ImageProvider } from "./types.ts";

export type { ImageProvider } from "./types.ts";

/**
 * Image providers in fallback order, from environment variables:
 * - CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID, or R2_ACCOUNT_ID): Workers AI FLUX.2, then FLUX.1.
 * - AI_HORDE_API_KEY: AI Horde, slow fallback (worker only).
 * Uploading an image by hand always works and needs no provider.
 */
export function imageProviders(env: Record<string, string | undefined> = process.env): ImageProvider[] {
  const providers: ImageProvider[] = [];
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID;
  if (env.CLOUDFLARE_API_TOKEN && accountId) {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    providers.push(
      new CloudflareImageProvider({ accountId, apiToken, model: "flux2" }),
      new CloudflareImageProvider({ accountId, apiToken, model: "flux1" }),
    );
  }
  if (env.AI_HORDE_API_KEY) providers.push(new HordeImageProvider({ apiKey: env.AI_HORDE_API_KEY }));
  return providers;
}

/** Providers quick enough to run inside a web request (a few seconds per image). */
export function fastImageProviders(env?: Record<string, string | undefined>): ImageProvider[] {
  return imageProviders(env).filter((p) => p.typicalSeconds <= 30);
}
