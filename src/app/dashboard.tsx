"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { formatDuration } from "@/shared/timing";
import type { StoryStatus } from "@/shared/status";
import type { StorySummary } from "@/server/jobs";
import { createStoryAction } from "./actions";
import { EXAMPLE_SCRIPT } from "@/lib/example-script";
import { Button, Card, EmptyState, plural, STATUS_LABELS, StatusChip } from "@/components/ui";
import { BrowserImport } from "./browser-import";

const FILTERS: ("all" | StoryStatus)[] = ["all", "draft", "generating", "ready", "failed", "downloaded"];

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

interface Props {
  stories: StorySummary[];
  storageKind: "r2" | "local";
}

export function Dashboard({ stories, storageKind }: Props) {
  const [filter, setFilter] = useState<"all" | StoryStatus>("all");
  const [pending, startTransition] = useTransition();

  const newStory = (script?: string) => startTransition(() => createStoryAction(script));

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: stories.length };
    for (const s of stories) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [stories]);

  const visible = stories.filter((s) => filter === "all" || s.status === filter);
  // Hide empty status filters (except All and Draft) to keep the row short.
  const filters = FILTERS.filter((f) => f === "all" || f === "draft" || counts[f]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Case files</p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Your stories</h1>
        </div>
        <Button variant="primary" onClick={() => newStory()} disabled={pending}>
          <PlusIcon /> {pending ? "Creating…" : "New story"}
        </Button>
      </div>

      {storageKind === "local" && (
        <p className="mt-6 rounded-control border border-info/40 bg-info/5 px-4 py-2.5 text-sm text-muted">
          <span className="text-info">Local mode.</span> Stories are saved in this computer&apos;s{" "}
          <code className="font-mono text-xs">.local/storage</code> folder. Connect Cloudflare R2 (see README) to use
          them from the deployed app.
        </p>
      )}

      <BrowserImport />

      {stories.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No stories yet"
            action={
              <>
                <Button variant="primary" onClick={() => newStory()} disabled={pending}>
                  Write a story
                </Button>
                <Button onClick={() => newStory(EXAMPLE_SCRIPT)} disabled={pending}>
                  Start from the example
                </Button>
              </>
            }
          >
            Write or paste a script, check the scenes and voices, then generate. Your weekly loop is: write,
            generate, preview, download, upload.
          </EmptyState>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Filter by status" className="mt-8 flex gap-2 overflow-x-auto pb-1">
            {filters.map((f) => (
              <button
                key={f}
                role="tab"
                type="button"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-muted transition hover:text-ink aria-selected:border-accent/60 aria-selected:bg-accent/10 aria-selected:text-ink"
              >
                {f === "all" ? "All" : STATUS_LABELS[f]}
                <span className="ml-1.5 font-mono text-xs opacity-70">{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">No stories with this status.</p>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((s) => (
                <li key={s.id}>
                  <StoryCard story={s} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StoryCard({ story }: { story: StorySummary }) {
  return (
    <Link
      href={story.status === "ready" ? `/stories/${story.id}/review` : `/stories/${story.id}`}
      className="group block h-full rounded-card focus-visible:outline-offset-4"
    >
      <Card className="flex h-full flex-col p-5 transition group-hover:border-muted">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-xl leading-snug">{story.title || "Untitled story"}</h3>
          <StatusChip status={story.status} />
        </div>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted">
          {story.firstLine ?? "Empty script. Open to start writing."}
        </p>
        <dl className="mt-5 flex gap-5 border-t border-line pt-3 font-mono text-xs text-muted">
          <div>
            <dt className="sr-only">Length</dt>
            <dd>~{formatDuration(story.estimateSec)}</dd>
          </div>
          <div>
            <dt className="sr-only">Scenes</dt>
            <dd>{plural(story.sceneCount, "scene")}</dd>
          </div>
          <div>
            <dt className="sr-only">Lines</dt>
            <dd>{plural(story.lineCount, "line")}</dd>
          </div>
          <div className="ml-auto">
            <dt className="sr-only">Last edited</dt>
            <dd>{dateFmt.format(new Date(story.updatedAt))}</dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="h-16 w-64 animate-pulse rounded-card bg-surface" />
      <ul aria-hidden className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-40 animate-pulse rounded-card border border-line bg-surface" />
        ))}
      </ul>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
