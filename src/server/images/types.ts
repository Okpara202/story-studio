export interface GeneratedImage {
  data: Buffer;
  /** File extension without dot: "jpg", "png" or "webp". */
  ext: string;
}

export interface ImageOptions {
  seed: number;
  /** Output size where the model allows it; default 1024x768. */
  size?: { width: number; height: number };
  /** Reference pictures (JPEG/PNG, under 512x512), referred to as "image 0", "image 1"... in the prompt. Ignored by models without support. */
  references?: Buffer[];
}

/** A text-to-image backend: generate(prompt, options) -> image. */
export interface ImageProvider {
  readonly name: string;
  /** Typical seconds per image; the app only offers on-demand generation for fast providers. */
  readonly typicalSeconds: number;
  generate(prompt: string, opts: ImageOptions): Promise<GeneratedImage>;
}

/** The provider's free allowance is used up; try the next provider instead of retrying. */
export class QuotaError extends Error {}

/** Wrong or missing credentials; retrying will not help. */
export class ConfigError extends Error {}
