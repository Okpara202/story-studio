"use client";

import type { GenerationView } from "@/server/generation";
import type { JobStage } from "@/shared/status";
import { formatDuration } from "@/shared/timing";
import { formatAmount } from "@/shared/usage";
import { Button, ButtonLink, Card } from "@/components/ui";

const STAGES: { id: JobStage; label: string }[] = [
  { id: "voices", label: "Voices" },
  { id: "images", label: "Images" },
  { id: "render", label: "Videos" },
];

interface Props {
  view: GenerationView;
  onRetry: () => void;
  retrying: boolean;
  onJumpToScene: (sceneNo: number) => void;
  /** Where the finished videos are watched and published. */
  reviewHref?: string;
}

/** Live progress of a cloud run, its errors, and a summary of the finished videos. */
export function GenerationPanel({ view, onRetry, retrying, onJumpToScene, reviewHref }: Props) {
  const s = view.status;
  if (!s) return null;
  const stageIndex = s.stage ? STAGES.findIndex((x) => x.id === s.stage) : -1;

  if (s.state === "done") {
    return (
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-xl">Your videos are ready</h2>
            <p className="flex flex-wrap gap-x-5 font-mono text-xs text-muted">
              {view.outputs.filter((o) => !o.snippet).map((o) => (
                <span key={o.format}>
                  <span className="text-ink">{o.format === "9x16" ? "9:16" : "16:9"}</span> {formatDuration(o.durationSec)} ·{" "}
                  {formatAmount(o.bytes, "bytes")}
                </span>
              ))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRetry} disabled={retrying} className="h-9">
              {retrying ? "Starting…" : "Generate again"}
            </Button>
            {reviewHref && (
              <ButtonLink variant="primary" href={reviewHref} className="h-9">
                Review &amp; publish →
              </ButtonLink>
            )}
          </div>
        </div>
        {!!s.warnings?.length && (
          <ul className="mt-4 space-y-1 text-xs text-muted">
            {s.warnings.map((w, i) => (
              <li key={i}>Note: {w}</li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  if (s.state === "failed") {
    const failedScenes = s.scenes?.filter((x) => x.state === "failed") ?? [];
    return (
      <Card className="border-danger/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl text-danger">Generation stopped</h2>
            <p className="mt-1 text-sm">{s.error}</p>
          </div>
          <Button variant="primary" onClick={onRetry} disabled={retrying} className="h-9">
            {retrying ? "Starting…" : "Try again"}
          </Button>
        </div>
        {failedScenes.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {failedScenes.map((f) => (
              <li key={f.index}>
                <button
                  type="button"
                  onClick={() => onJumpToScene(f.index)}
                  className="text-left text-sm hover:text-accent"
                >
                  <span className="font-mono text-xs text-danger">Scene {String(f.index).padStart(2, "0")}</span>{" "}
                  <span className="text-muted">{f.error}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          Finished steps are kept, so trying again only redoes what is missing.
          {view.runsUrl && (
            <>
              {" "}
              <a href={view.runsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                See the cloud runs on GitHub
              </a>
            </>
          )}
        </p>
        {s.detail && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Technical details</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-control bg-raised p-3 font-mono">{s.detail}</pre>
          </details>
        )}
      </Card>
    );
  }

  // Queued or running
  return (
    <Card className="p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl">{s.state === "queued" ? "Starting the cloud worker…" : "Generating your video…"}</h2>
        <span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
      </div>
      <ol className="mt-4 grid grid-cols-3 gap-2">
        {STAGES.map((st, i) => {
          const done = stageIndex > i;
          const current = stageIndex === i;
          return (
            <li key={st.id}>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: done ? "100%" : current ? `${Math.round(s.progress * 100)}%` : "0%" }}
                />
              </div>
              <p className={`mt-1.5 text-xs ${current ? "text-ink" : done ? "text-success" : "text-muted"}`}>
                {done ? "✓ " : ""}
                {st.label}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-muted">{s.message}</p>
      {view.stuck && (
        <p role="alert" className="mt-3 text-sm text-accent">
          This is taking longer than usual.{" "}
          {view.runsUrl && (
            <a href={view.runsUrl} target="_blank" rel="noreferrer" className="underline">
              Check the run on GitHub
            </a>
          )}
          , or start again.{" "}
          <button type="button" onClick={onRetry} className="underline" disabled={retrying}>
            Start again
          </button>
        </p>
      )}
      <p className="mt-2 text-xs text-muted">You can leave this page; the work continues in the cloud.</p>
    </Card>
  );
}
