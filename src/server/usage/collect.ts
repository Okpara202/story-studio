import {
  ESTIMATED_NEURONS_PER_IMAGE,
  FREE_LIMITS,
  nextUtcMidnight,
  nextUtcMonth,
  utcDay,
  type Meter,
} from "../../shared/usage.ts";
import type { ObjectStore } from "../storage/types.ts";
import { aiNeuronsSince, NotAuthorizedError, r2OperationsSince, r2StoredBytes } from "./cloudflare-analytics.ts";
import { readLedger } from "./ledger.ts";

export interface UsageReport {
  meters: Meter[];
  /** True when Cloudflare analytics answered (numbers are measured, not estimated). */
  analyticsConnected: boolean;
  checkedAt: string;
}

const CONNECT_NOTE =
  'Add "Account Analytics: Read" to your Cloudflare API token to see Cloudflare\'s own count (README → Usage).';

/** Resolve to the value or the error, so one failing source never hides the others. */
const settle = <T,>(p: Promise<T>): Promise<T | Error> =>
  p.catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));

// Listing the bucket is itself a Class A operation, so the fallback storage
// count is cached. Analytics queries cost nothing against the R2 allowance.
const LIST_CACHE_MS = 10 * 60_000;
let listCache: { at: number; bytes: number } | null = null;

export async function collectUsage(
  store: ObjectStore,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<UsageReport> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET;
  const cf = token && accountId && bucket && store.kind === "r2" ? { token, accountId, bucket } : null;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ai = token && accountId ? { token, accountId } : null;

  const [ops, stored, aiUsed, ledger] = await Promise.all([
    cf ? settle(r2OperationsSince(cf, monthStart, now)) : null,
    cf ? settle(r2StoredBytes(cf)) : null,
    ai ? settle(aiNeuronsSince(ai, dayStart, now)) : null,
    readLedger(store, now),
  ]);
  const aiMeasured = aiUsed !== null && !(aiUsed instanceof Error) ? aiUsed : null;
  const opsOk = ops !== null && !(ops instanceof Error) ? ops : null;
  const analyticsConnected = opsOk !== null;
  const opsNote = (e: unknown) => (e instanceof NotAuthorizedError || !cf ? CONNECT_NOTE : `Could not read Cloudflare analytics: ${String(e)}`);

  // Storage: Cloudflare's figure when available (free to read), else our own cached listing.
  let storageBytes: number;
  if (typeof stored === "number" && stored > 0) {
    storageBytes = stored;
  } else {
    if (!listCache || now.getTime() - listCache.at > LIST_CACHE_MS) {
      const objects = await store.listObjects("");
      listCache = { at: now.getTime(), bytes: objects.reduce((sum, o) => sum + o.size, 0) };
    }
    storageBytes = listCache.bytes;
  }

  const today = ledger.days[utcDay(now)];
  const imagesToday = Object.values(today?.images ?? {}).reduce((a, b) => a + b, 0);
  const neuronsEstimate = Object.entries(today?.images ?? {}).reduce(
    (sum, [provider, n]) => sum + n * (ESTIMATED_NEURONS_PER_IMAGE[provider] ?? 100),
    0,
  );

  const monthReset = nextUtcMonth(now).toISOString();
  const meters: Meter[] = [
    {
      id: "r2-storage",
      label: "Storage",
      usedFor: "Scripts, voices, images and finished videos in Cloudflare R2",
      used: storageBytes,
      limit: FREE_LIMITS.r2StorageBytes,
      unit: "bytes",
      resetsAt: null,
      source: store.kind === "r2" ? "measured" : "not-connected",
      note:
        store.kind === "r2"
          ? "What is stored right now. Cloudflare's figure can lag by up to a few hours; 'Storage by story' below is exact. Billed to your card if exceeded."
          : "Local mode: files are on this computer, not in R2.",
    },
    {
      id: "r2-class-a",
      label: "Storage writes (Class A)",
      usedFor: "Saving files and listing folders in R2",
      used: opsOk?.classA ?? 0,
      limit: FREE_LIMITS.r2ClassA,
      unit: "operations",
      resetsAt: monthReset,
      source: analyticsConnected ? "measured" : "not-connected",
      note: analyticsConnected ? "Billed to your card if exceeded." : opsNote(ops),
    },
    {
      id: "r2-class-b",
      label: "Storage reads (Class B)",
      usedFor: "Loading files and playing videos from R2",
      used: opsOk?.classB ?? 0,
      limit: FREE_LIMITS.r2ClassB,
      unit: "operations",
      resetsAt: monthReset,
      source: analyticsConnected ? "measured" : "not-connected",
      note: analyticsConnected ? "Billed to your card if exceeded." : opsNote(ops),
    },
    {
      id: "workers-ai",
      label: "Image generation today",
      usedFor: aiMeasured
        ? `${aiMeasured.requests} image request${aiMeasured.requests === 1 ? "" : "s"} today · about ${Math.max(0, Math.floor((FREE_LIMITS.workersAiNeurons - aiMeasured.neurons) / ESTIMATED_NEURONS_PER_IMAGE["cloudflare-flux2"]))} more images fit`
        : `${imagesToday} image${imagesToday === 1 ? "" : "s"} generated in this app today`,
      used: aiMeasured ? aiMeasured.neurons : neuronsEstimate,
      limit: FREE_LIMITS.workersAiNeurons,
      unit: "neurons",
      resetsAt: nextUtcMidnight(now).toISOString(),
      source: aiMeasured ? "measured" : token ? "estimate" : "not-connected",
      note: !token
        ? "Add a Cloudflare Workers AI token to generate images (README → Images)."
        : aiMeasured
          ? "On the free plan Cloudflare stops at the limit; it never charges."
          : `Estimated from images made in this app. ${CONNECT_NOTE}`,
    },
    {
      id: "actions-minutes",
      label: "Cloud rendering minutes",
      usedFor: "GitHub Actions time spent voicing, drawing and rendering",
      used: 0,
      limit: FREE_LIMITS.actionsMinutes,
      unit: "minutes",
      resetsAt: monthReset,
      source: "not-connected",
      note: "Connected when cloud rendering is set up (build step 7). The repository is public, so GitHub Actions minutes are free and unlimited; this bar is for information.",
    },
  ];
  return { meters, analyticsConnected, checkedAt: now.toISOString() };
}
