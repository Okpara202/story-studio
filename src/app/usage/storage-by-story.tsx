"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatAmount } from "@/shared/usage";
import type { StorageBreakdown, StoryStorage } from "@/server/usage/storage-breakdown";
import { Button, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteStoryFromListAction, freeStorySpaceAction, storageBreakdownAction } from "../actions";

type Pending = { kind: "free" | "delete"; story: StoryStorage } | null;

const size = (n: number) => formatAmount(n, "bytes");

/** Per-story storage with "Free space" (keep the script) and "Delete story". Loaded on open, not polled. */
export function StorageByStory({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<StorageBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await storageBreakdownAction();
    if ("error" in res) setError(res.error);
    else {
      setData(res);
      setError(null);
    }
  }, []);

  useEffect(() => {
    // Fetch once when the page opens; the list costs one storage listing.
    void (async () => load())();
  }, [load]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    const res =
      pending.kind === "free"
        ? await freeStorySpaceAction(pending.story.id)
        : await deleteStoryFromListAction(pending.story.id);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
    } else {
      setPending(null);
      await load();
      onChanged();
    }
  };

  const media = (s: StoryStorage) => s.parts.images + s.parts.voices + s.parts.videos;

  return (
    <section aria-labelledby="storage-heading" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="storage-heading" className="font-serif text-2xl">
            Storage by story
          </h2>
          <p className="mt-1 text-sm text-muted">Largest first. Free space removes media but keeps the script.</p>
        </div>
        <Button className="h-8 px-3 text-xs" onClick={() => void load()}>
          Reload list
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {!data && !error && <div aria-busy className="mt-4 h-24 animate-pulse rounded-card border border-line bg-surface" />}

      {data && (
        <Card className="mt-4 divide-y divide-line">
          {data.stories.length === 0 && <p className="p-5 text-sm text-muted">No stories are using storage.</p>}
          {data.stories.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1 basis-56">
                <Link href={`/stories/${s.id}`} className="font-serif text-lg hover:text-accent">
                  {s.title || "Untitled story"}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  Images {size(s.parts.images)} · Voices {size(s.parts.voices)} · Videos {size(s.parts.videos)} ·
                  Script {size(s.parts.other)}
                </p>
              </div>
              <span className="w-20 text-right font-mono text-sm">{size(s.bytes)}</span>
              <div className="flex gap-2">
                <Button
                  className="h-8 px-3 text-xs"
                  disabled={media(s) === 0}
                  title={media(s) === 0 ? "Nothing to free: only the script is stored" : undefined}
                  onClick={() => setPending({ kind: "free", story: s })}
                >
                  Free space
                </Button>
                <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => setPending({ kind: "delete", story: s })}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {data.shared.files > 0 && (
            <div className="flex items-center gap-4 p-4 text-sm text-muted">
              <span className="flex-1">Channel files (music, settings, usage log)</span>
              <span className="w-20 text-right font-mono">{size(data.shared.bytes)}</span>
              <span className="w-[11.5rem]" />
            </div>
          )}
          <div className="flex items-center gap-4 p-4 text-sm">
            <span className="flex-1 font-medium">Total</span>
            <span className="w-20 text-right font-mono">{size(data.totalBytes)}</span>
            <span className="w-[11.5rem]" />
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        danger={pending?.kind === "delete"}
        title={pending?.kind === "delete" ? "Delete this story?" : "Free up space?"}
        confirmLabel={pending?.kind === "delete" ? "Delete story" : `Free ${pending ? size(media(pending.story)) : ""}`}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm()}
      >
        {pending?.kind === "delete" ? (
          <>
            <p>
              <span className="text-ink">&ldquo;{pending.story.title || "Untitled story"}&rdquo;</span> and all its files (
              {size(pending.story.bytes)}) will be deleted from storage: script, voices, images and videos.
            </p>
            <p className="text-danger">This cannot be undone. Download any videos you want to keep first.</p>
          </>
        ) : pending ? (
          <>
            <p>
              To save storage, these files of <span className="text-ink">&ldquo;{pending.story.title || "Untitled story"}&rdquo;</span> will be
              deleted: images {size(pending.story.parts.images)}, voices {size(pending.story.parts.voices)}, videos{" "}
              {size(pending.story.parts.videos)}.
            </p>
            <p>
              The script, cast and settings are kept, so you can generate it again later. Images you uploaded yourself are
              deleted too.
            </p>
          </>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
