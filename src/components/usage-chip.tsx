"use client";

import Link from "next/link";
import { meterLevel, meterPercent } from "@/shared/usage";
import { useUsage } from "@/lib/use-usage";

const COLORS = { ok: "text-success border-success/40", warn: "text-accent border-accent/60", danger: "text-danger border-danger/60" };

/** Header summary: the fullest free allowance, so limits are visible from every page. */
export function UsageChip() {
  const { report } = useUsage(5 * 60_000);
  const active = report?.meters.filter((m) => m.source !== "not-connected") ?? [];
  if (active.length === 0) return null;
  const top = active.reduce((a, b) => (meterPercent(b) > meterPercent(a) ? b : a));
  const level = meterLevel(top);
  const pct = Math.round(meterPercent(top));

  return (
    <Link
      href="/usage"
      title={`Fullest free allowance: ${top.label} at ${pct}%`}
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition hover:bg-raised sm:flex ${COLORS[level]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Free tier {pct}%
    </Link>
  );
}
