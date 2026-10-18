"use client";

import { useSyncExternalStore } from "react";
import { formatAmount, meterLevel, meterPercent, type Meter, type MeterLevel } from "@/shared/usage";
import { useUsage } from "@/lib/use-usage";
import { Button, Card } from "@/components/ui";
import { StorageByStory } from "./storage-by-story";

const BAR: Record<MeterLevel, string> = { ok: "bg-success", warn: "bg-accent", danger: "bg-danger" };
const TEXT: Record<MeterLevel, string> = { ok: "text-success", warn: "text-accent", danger: "text-danger" };
const ADVICE: Record<MeterLevel, string> = {
  ok: "Plenty left",
  warn: "Over 70%: slow down",
  danger: "Over 90%: stop until it resets",
};
const SOURCE: Record<Meter["source"], string> = {
  measured: "Measured",
  estimate: "Estimate",
  "not-connected": "Not connected",
};

// Browser-only clock that ticks every 30 s so "updated … ago" and countdowns stay current.
// Reading Date.now() during render would make the prerendered page depend on build time.
let clock = 0;
function subscribeClock(onTick: () => void) {
  clock = Date.now();
  const t = setInterval(() => {
    clock = Date.now();
    onTick();
  }, 30_000);
  return () => clearInterval(t);
}

function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => (clock ||= Date.now()), () => 0);
}

function timeUntil(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export function UsageDashboard() {
  const { report, error, loading, refresh } = useUsage(60_000);
  const now = useNow();
  const ago = report && now ? Math.max(0, Math.round((now - new Date(report.checkedAt).getTime()) / 1000)) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Free tiers</p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Usage</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Everything here runs on free allowances. Green: carry on. Amber: slow down. Red: stop until it resets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="font-mono text-xs text-muted">
            {loading ? "Checking…" : ago !== null ? `Updated ${ago < 60 ? "just now" : `${Math.round(ago / 60)} min ago`}` : ""}
          </span>
          <Button onClick={() => void refresh()} disabled={loading} className="h-9">
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-control border border-danger/50 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!report && !error && (
        <div aria-busy className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      )}

      {report && (
        <>
          <ul className="mt-8 space-y-3">
            {report.meters.map((m) => (
              <li key={m.id}>
                <MeterCard meter={m} now={now} />
              </li>
            ))}
          </ul>

          <StorageByStory onChanged={() => void refresh()} />

          <Card className="mt-10 p-5 text-sm">
            <h2 className="font-medium">What can and cannot cost money</h2>
            <ul className="mt-3 space-y-2 text-muted">
              <li>
                <span className="text-ink">Cloudflare R2</span> has your card on file. Going over the storage or
                operation limits is billed. Keep an R2 Budget Alert (Cloudflare → R2 → Add Budget Alert) as a backup.
              </li>
              <li>
                <span className="text-ink">Cloudflare Workers AI</span> on the free plan stops at 10,000 neurons a day
                and resets at 00:00 UTC. It only charges if you upgrade to Workers Paid.
              </li>
              <li>
                <span className="text-ink">GitHub Actions</span> is free and unlimited for a public repository. If you
                make it private later, it pauses at 2,000 minutes a month (no card, so never charged).
              </li>
              <li>
                <span className="text-ink">Microsoft Edge voices</span> have no quota, but are unofficial and can be
                throttled. Piper takes over if they fail.
              </li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function MeterCard({ meter: m, now }: { meter: Meter; now: number }) {
  const connected = m.source !== "not-connected";
  const level = meterLevel(m);
  const pct = meterPercent(m);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-medium">{m.label}</h2>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            m.source === "measured" ? "border-success/40 text-success" : m.source === "estimate" ? "border-accent/50 text-accent" : "border-line text-muted"
          }`}
        >
          {SOURCE[m.source]}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted">{m.usedFor}</p>

      {connected ? (
        <>
          <div
            role="meter"
            aria-label={m.label}
            aria-valuemin={0}
            aria-valuemax={m.limit}
            aria-valuenow={m.used}
            aria-valuetext={`${formatAmount(m.used, m.unit)} of ${formatAmount(m.limit, m.unit)}`}
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-raised"
          >
            <div className={`h-full rounded-full transition-all ${BAR[level]}`} style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
            <span>
              <span className="text-ink">{formatAmount(m.used, m.unit)}</span>
              <span className="text-muted"> of {formatAmount(m.limit, m.unit)} {m.unit === "bytes" ? "" : m.unit}</span>
            </span>
            <span className={TEXT[level]}>
              {pct < 1 && m.used > 0 ? "<1" : Math.round(pct)}% · {ADVICE[level]}
            </span>
          </div>
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {m.resetsAt && connected && now > 0 && <span>Resets in {timeUntil(m.resetsAt, now)}</span>}
        {!m.resetsAt && connected && <span>Does not reset: free space by deleting finished stories</span>}
        {m.note && <span>{m.note}</span>}
      </div>
    </Card>
  );
}
