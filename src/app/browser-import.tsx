"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { importStoriesAction } from "./actions";
import { Button } from "@/components/ui";

// The first UI version kept stories in localStorage under this key.
const OLD_KEY = "svs.stories.v1";

interface OldStory {
  script: string;
  voices: Record<string, string>;
}

function readOld(): string | null {
  try {
    return localStorage.getItem(OLD_KEY);
  } catch {
    return null;
  }
}

/** Offers to move stories written before cloud storage existed. Nothing is deleted until the move succeeds. */
export function BrowserImport() {
  const raw = useSyncExternalStore(
    () => () => {},
    readOld,
    () => null,
  );
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  let stories: OldStory[] = [];
  try {
    stories = raw ? (JSON.parse(raw) as OldStory[]).filter((s) => s.script?.trim()) : [];
  } catch {
    stories = [];
  }
  if (done || stories.length === 0) return null;

  const move = () =>
    startTransition(async () => {
      try {
        await importStoriesAction(stories.map((s) => ({ script: s.script, voices: s.voices ?? {} })));
        localStorage.removeItem(OLD_KEY);
        setDone(true);
      } catch {
        setError("Could not move the stories. Nothing was lost; try again.");
      }
    });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
      <span className="flex-1">
        {stories.length} {stories.length === 1 ? "story is" : "stories are"} still saved only in this browser.
        {error && <span className="ml-2 text-danger">{error}</span>}
      </span>
      <Button variant="primary" onClick={move} disabled={pending} className="h-8">
        {pending ? "Moving…" : "Move to storage"}
      </Button>
    </div>
  );
}
