"use client";

import { useMemo, useSyncExternalStore } from "react";

const EVENT = "ticks-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Ticked checklist items under one key, remembered in this browser only. */
export function useTicks(key: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const ticks = useMemo(() => new Set(raw ? raw.split(",") : []), [raw]);
  const set = (id: string, on: boolean) => {
    const next = new Set(ticks);
    if (on) next.add(id);
    else next.delete(id);
    try {
      localStorage.setItem(key, [...next].join(","));
    } catch {
      // Private window: ticks just aren't remembered.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return { ticks, set };
}
