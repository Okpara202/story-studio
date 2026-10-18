/**
 * Free-tier limits this project relies on. Checked against the providers'
 * docs on 2026-10-18; update here if they change.
 */
export const FREE_LIMITS = {
  /** Cloudflare R2 Standard: 10 GB-month of storage. */
  r2StorageBytes: 10 * 1000 ** 3,
  /** Cloudflare R2: 1 million Class A (write/list) operations per month. */
  r2ClassA: 1_000_000,
  /** Cloudflare R2: 10 million Class B (read) operations per month. */
  r2ClassB: 10_000_000,
  /** Workers AI: 10,000 neurons per day, reset 00:00 UTC. */
  workersAiNeurons: 10_000,
  /** GitHub Actions, private repo on GitHub Free: 2,000 minutes per month. */
  actionsMinutes: 2_000,
};

/**
 * Neurons per image, used only when Cloudflare's own numbers are not
 * available. Measured via Cloudflare analytics on 2026-10-18:
 * FLUX.2 klein 1024x768, 4 steps: 104; FLUX.1 schnell, 6 steps: 166.
 */
export const ESTIMATED_NEURONS_PER_IMAGE: Record<string, number> = {
  "cloudflare-flux1": 170,
  "cloudflare-flux2": 105,
};

export type MeterSource = "measured" | "estimate" | "not-connected";
export type MeterLevel = "ok" | "warn" | "danger";

export interface Meter {
  id: string;
  label: string;
  /** What uses this allowance, in plain words. */
  usedFor: string;
  used: number;
  limit: number;
  unit: "bytes" | "operations" | "neurons" | "minutes" | "images";
  /** When the allowance resets (ISO), or null if it does not (storage). */
  resetsAt: string | null;
  source: MeterSource;
  /** Extra context, e.g. how to connect a not-connected meter. */
  note?: string;
}

export function meterLevel(m: Pick<Meter, "used" | "limit">): MeterLevel {
  const pct = m.limit > 0 ? m.used / m.limit : 0;
  if (pct >= 0.9) return "danger";
  if (pct >= 0.7) return "warn";
  return "ok";
}

export function meterPercent(m: Pick<Meter, "used" | "limit">): number {
  return m.limit > 0 ? Math.min(100, (m.used / m.limit) * 100) : 0;
}

/** Next 00:00 UTC. */
export function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** First moment of next month, UTC. */
export function nextUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * R2 operation classes (Cloudflare R2 pricing). Deletes and aborts are free.
 * Anything unknown counts as Class A, the scarcer allowance, to stay on the safe side.
 */
const CLASS_B = new Set([
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
]);
const FREE_OPS = new Set(["DeleteObject", "DeleteObjects", "DeleteBucket", "AbortMultipartUpload"]);

export function r2OperationClass(actionType: string): "A" | "B" | "free" {
  if (FREE_OPS.has(actionType)) return "free";
  if (CLASS_B.has(actionType)) return "B";
  return "A";
}

export function formatAmount(n: number, unit: Meter["unit"]): string {
  if (unit === "bytes") {
    if (n < 1000) return `${n} B`;
    if (n < 1000 ** 2) return `${(n / 1000).toFixed(1)} KB`;
    if (n < 1000 ** 3) return `${(n / 1000 ** 2).toFixed(1)} MB`;
    return `${(n / 1000 ** 3).toFixed(2)} GB`;
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("en-GB");
}
