import { utcDay, utcMonth } from "../../shared/usage.ts";
import type { ObjectStore } from "../storage/types.ts";

/**
 * The app's own tally of free-tier use, for numbers the providers do not
 * report to us (or until their analytics are connected).
 * Stored as usage/YYYY-MM.json, one small file per month.
 */
export interface DayUsage {
  /** Images generated, per provider name. */
  images?: Record<string, number>;
}

export interface UsageLedger {
  version: 1;
  month: string;
  days: Record<string, DayUsage>;
}

const ledgerKey = (month: string) => `usage/${month}.json`;

export async function readLedger(store: ObjectStore, now = new Date()): Promise<UsageLedger> {
  const month = utcMonth(now);
  const text = await store.getText(ledgerKey(month));
  if (!text) return { version: 1, month, days: {} };
  try {
    return JSON.parse(text) as UsageLedger;
  } catch {
    return { version: 1, month, days: {} };
  }
}

/** Count one generated image. Never throws: usage tracking must not break generation. */
export async function recordImage(store: ObjectStore, provider: string, now = new Date()): Promise<void> {
  try {
    const ledger = await readLedger(store, now);
    const day = (ledger.days[utcDay(now)] ??= {});
    day.images = { ...day.images, [provider]: (day.images?.[provider] ?? 0) + 1 };
    await store.putText(ledgerKey(ledger.month), JSON.stringify(ledger, null, 2));
  } catch {
    // Ignore: a missed count only makes the estimate slightly low.
  }
}
