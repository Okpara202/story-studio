"use client";

import { useCallback, useEffect, useState } from "react";
import type { UsageReport } from "@/server/usage/collect";

/**
 * Polls /api/usage while the tab is visible. Checking usage costs no R2
 * operations once analytics are connected (and the fallback is cached server-side).
 */
export function useUsage(intervalMs: number) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setReport(body as UsageReport);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      void refresh();
      timer = setInterval(() => void refresh(), intervalMs);
    };
    const stop = () => clearInterval(timer);
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, refresh]);

  return { report, error, loading, refresh };
}
