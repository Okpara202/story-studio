"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerationView } from "@/server/generation";
import { generateVideoAction } from "../../actions";

const POLL_MS = 3000;
const isActive = (v: GenerationView | null) => v?.status?.state === "queued" || v?.status?.state === "running";

/**
 * Generation state for one story: starts cloud runs and polls their status
 * while active. When a run ends, the page refreshes so new images and the
 * status chip show up.
 */
export function useGeneration(jobId: string, initial: GenerationView | null = null) {
  const router = useRouter();
  const [view, setView] = useState<GenerationView | null>(initial);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasActive = useRef(false);
  // While a start request is in flight, polls would still read the previous run's result.
  const startingRef = useRef(false);
  // Bumped on every start: answers to requests sent before the latest start are stale.
  const epoch = useRef(0);

  const load = useCallback(async (force = false) => {
    if (startingRef.current && !force) return;
    const sentAt = epoch.current;
    try {
      const res = await fetch(`/api/stories/${jobId}/generation`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as GenerationView;
      if (sentAt !== epoch.current || (startingRef.current && !force)) return;
      setView(next);
      if (wasActive.current && !isActive(next)) router.refresh();
      wasActive.current = isActive(next);
    } catch {
      // Offline for a moment: the next poll retries.
    }
  }, [jobId, router]);

  const active = isActive(view);
  useEffect(() => {
    // Load once on open; keep polling only while a run is queued or running.
    const first = setTimeout(() => void load(), 0);
    if (!active) return () => clearTimeout(first);
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active, load]);

  const start = useCallback(
    async (beforeStart: () => Promise<void>) => {
      setError(null);
      setStarting(true);
      epoch.current++;
      // Show "starting" at once instead of the previous result while GitHub is asked to run.
      const now = new Date().toISOString();
      setView((v) => ({
        status: { state: "queued", stage: null, progress: 0, message: "Asking the cloud worker to start", startedAt: now, updatedAt: now },
        outputs: [],
        stuck: false,
        runsUrl: v?.runsUrl ?? null,
      }));
      wasActive.current = true;
      startingRef.current = true;
      try {
        await beforeStart();
        const res = await generateVideoAction(jobId);
        if ("error" in res) setError(res.error);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      } finally {
        startingRef.current = false;
        setStarting(false);
        await load(true);
      }
    },
    [jobId, load],
  );

  return { view, active, starting, error, start };
}
