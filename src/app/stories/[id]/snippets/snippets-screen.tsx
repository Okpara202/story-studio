"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseScript } from "@/shared/script/parse";
import type { JobFile, Snippet } from "@/shared/job";
import type { StoryStatus } from "@/shared/status";
import { formatDuration } from "@/shared/timing";
import { formatAmount } from "@/shared/usage";
import { platformPosts, type Platform } from "@/shared/publish";
import {
  MAX_SNIPPETS,
  nextSnippet,
  rangeTime,
  sameSnippet,
  SNIPPET_MAX_SEC,
  SNIPPET_NAME_MAX,
  snippetError,
  storyLengths,
  type SceneLength,
} from "@/shared/snippets";
import type { GenerationView, OutputView } from "@/server/generation";
import { Button, ButtonLink, Card, EmptyState, plural, SectionLabel, StatusChip } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { useTicks } from "@/lib/use-ticks";
import { saveSnippetsAction } from "../../../actions";
import { useGeneration } from "../use-generation";
import { GenerationPanel } from "../generation-panel";

interface Props {
  job: JobFile;
  status: StoryStatus;
  initialView: GenerationView;
}

export function SnippetsScreen({ job, status, initialView }: Props) {
  const parsed = useMemo(() => parseScript(job.script), [job.script]);
  const generation = useGeneration(job.jobId, initialView);
  const view = generation.view ?? initialView;
  const s = view.status;
  const lengths = useMemo(() => storyLengths(parsed.scenes, s?.sceneTimes), [parsed.scenes, s?.sceneTimes]);
  const sceneCount = parsed.scenes.length;

  const [snippets, setSnippets] = useState<Snippet[]>(job.snippets ?? []);
  const [savedSnippets, setSavedSnippets] = useState<Snippet[]>(job.snippets ?? []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(job.snippets?.[0]?.id ?? null);
  const selected = snippets.find((x) => x.id === selectedId) ?? null;

  // Autosave shortly after the last change.
  const dirty = snippets !== savedSnippets;
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      saveSnippetsAction(job.jobId, snippets)
        .then((res) => {
          if ("error" in res) return setSaveError(res.error);
          setSavedSnippets(snippets);
          setSaveError(null);
        })
        .catch(() => setSaveError("Not saved. Check your connection."));
    }, 500);
    return () => clearTimeout(t);
  }, [dirty, snippets, job.jobId]);

  const update = (id: string, patch: Partial<Snippet>) =>
    setSnippets((list) =>
      list.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        // Keep the range valid while either end is moved.
        if (patch.from !== undefined && next.to < next.from) next.to = next.from;
        if (patch.to !== undefined && next.from > next.to) next.from = next.to;
        return next;
      }),
    );
  const add = () => {
    const next = nextSnippet(snippets, lengths.scenes);
    if (!next) return;
    setSnippets((list) => [...list, next]);
    setSelectedId(next.id);
  };
  const remove = (id: string) => {
    setSnippets((list) => list.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const rendered = new Map(
    s?.state === "done" ? view.outputs.filter((o) => o.snippet).map((o) => [o.snippet!.id, o] as const) : [],
  );
  const fullVertical = s?.state === "done" ? view.outputs.find((o) => !o.snippet && o.format === "9x16") : undefined;
  const errors = snippets.map((x) => snippetError(x, sceneCount)).filter(Boolean);
  const pendingRenders = snippets.filter((x) => !sameSnippet(rendered.get(x.id)?.snippet, x)).length;

  const renderSnippets = () =>
    void generation.start(async () => {
      if (dirty) {
        const res = await saveSnippetsAction(job.jobId, snippets);
        if ("error" in res) throw new Error(res.error);
        setSavedSnippets(snippets);
      }
    }, "snippets");

  // Preview: play the scenes of a snippet inside the full vertical video.
  const playerRef = useRef<HTMLVideoElement>(null);
  const [previewing, setPreviewing] = useState<{ start: number; end: number; name: string } | null>(null);
  const canPreview = Boolean(fullVertical && lengths.exact);
  const preview = (x: Snippet) => {
    const v = playerRef.current;
    if (!v) return;
    const { start, sec } = rangeTime(lengths.scenes, x.from, x.to);
    setPreviewing({ start, end: start + sec, name: x.name });
    v.currentTime = start;
    void v.play();
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const reviewHref = `/stories/${job.jobId}/review`;
  const noVideos = !s && status !== "generating";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={reviewHref} className="text-sm text-muted hover:text-ink">
          ← Review
        </Link>
        <span className="hidden text-line sm:inline">/</span>
        <h1 className="order-last min-w-0 basis-full truncate font-serif text-2xl sm:order-0 sm:flex-1 sm:basis-auto">
          Teasers · {job.title || "Untitled story"}
        </h1>
        <span aria-live="polite" className="font-mono text-xs text-muted">
          {saveError ? <span className="text-danger">{saveError}</span> : dirty ? "Saving…" : "Saved"}
        </span>
        <StatusChip status={generation.active ? "generating" : status} />
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Pick the scenes that hook a viewer, ideally ending on a cliffhanger, about a minute long. Each teaser becomes its
        own 9:16 video for Shorts, Reels and TikTok, made from the same voices and images.
      </p>

      {s && s.state !== "done" && (
        <div className="mt-5">
          <GenerationPanel view={view} onRetry={renderSnippets} retrying={generation.starting} onJumpToScene={() => {}} />
        </div>
      )}
      {generation.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {generation.error}
        </p>
      )}

      {sceneCount === 0 ? (
        <div className="mt-8">
          <EmptyState title="No scenes yet" action={<ButtonLink href={`/stories/${job.jobId}`}>Open the editor</ButtonLink>}>
            Write the story first; teasers are cut from its scenes.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          {/* Preview */}
          <Card className="self-start p-4 lg:sticky lg:top-20">
            <SectionLabel>Preview</SectionLabel>
            {fullVertical ? (
              <video
                ref={playerRef}
                controls
                preload="metadata"
                src={fullVertical.url}
                onTimeUpdate={(e) => {
                  if (previewing && e.currentTarget.currentTime >= previewing.end) {
                    e.currentTarget.pause();
                    setPreviewing(null);
                  }
                }}
                className="mx-auto mt-3 aspect-9/16 w-full max-w-64 rounded-control border border-line bg-black"
              />
            ) : (
              <div className="mx-auto mt-3 grid aspect-9/16 w-full max-w-64 place-items-center rounded-control border border-dashed border-line p-4 text-center text-xs text-muted">
                {noVideos ? "Generate the story first to preview teasers here." : "Preview appears when the story's videos are ready."}
              </div>
            )}
            <p className="mt-2 min-h-5 text-center text-xs text-muted">
              {previewing ? `Playing "${previewing.name}"` : fullVertical ? "Press Preview on a teaser" : ""}
            </p>
          </Card>

          <div className="min-w-0 space-y-6">
            <Timeline
              lengths={lengths.scenes}
              exact={lengths.exact}
              selected={selected}
              onPick={(n) => {
                if (!selected) return;
                if (n < selected.from) update(selected.id, { from: n });
                else if (n > selected.to) update(selected.id, { to: n });
                else update(selected.id, { to: n });
              }}
            />

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>Teasers ({snippets.length})</SectionLabel>
                <Button onClick={add} disabled={snippets.length >= MAX_SNIPPETS} className="h-8 px-3 text-xs">
                  + Add teaser
                </Button>
              </div>
              {snippets.length === 0 ? (
                <Card className="mt-3 p-6 text-center">
                  <p className="font-serif text-lg">No teasers yet</p>
                  <p className="mt-1 text-sm text-muted">Start with the opening hook. You can stretch or shrink it after.</p>
                  <Button variant="primary" onClick={add} className="mt-4 h-9">
                    Add the opening hook
                  </Button>
                </Card>
              ) : (
                <ul className="mt-3 space-y-3">
                  {snippets.map((x) => (
                    <SnippetCard
                      key={x.id}
                      snippet={x}
                      lengths={lengths}
                      sceneCount={sceneCount}
                      selected={x.id === selectedId}
                      output={rendered.get(x.id)}
                      canPreview={canPreview}
                      onSelect={() => setSelectedId(x.id)}
                      onChange={(patch) => update(x.id, patch)}
                      onPreview={() => preview(x)}
                      onRemove={() => remove(x.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {snippets.length > 0 && (
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-muted">
                  {errors.length
                    ? `Fix ${plural(errors.length, "teaser")} first.`
                    : pendingRenders
                      ? `${plural(pendingRenders, "teaser")} to render. Voices and images are reused, so it's quick.`
                      : "All teasers are rendered."}
                </p>
                <Button
                  variant="primary"
                  onClick={renderSnippets}
                  disabled={errors.length > 0 || generation.active || generation.starting}
                  className="h-9"
                >
                  {generation.starting
                    ? "Starting…"
                    : generation.active
                      ? "Rendering…"
                      : pendingRenders
                        ? `Render ${plural(pendingRenders, "teaser")}`
                        : "Render again"}
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}

      <PlatformSection
        jobId={job.jobId}
        parsed={parsed}
        videos={[
          ...snippets.flatMap((x) => {
            const o = rendered.get(x.id);
            return o && sameSnippet(o.snippet, x) ? [{ key: x.id, label: `Teaser: ${x.name}`, name: x.name, output: o }] : [];
          }),
          ...(fullVertical ? [{ key: "full", label: "Full story (9:16)", output: fullVertical }] : []),
        ]}
      />
    </div>
  );
}

function Timeline({
  lengths,
  exact,
  selected,
  onPick,
}: {
  lengths: SceneLength[];
  exact: boolean;
  selected: Snippet | null;
  onPick: (sceneNo: number) => void;
}) {
  const total = lengths.reduce((n, l) => n + l.sec, 0) || 1;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>Story timeline · {formatDuration(total)}</SectionLabel>
        <span className="text-xs text-muted">
          {exact ? "Measured from the last render" : "Estimated from word counts until the story is generated"}
        </span>
      </div>
      <div className="mt-3 flex h-14 overflow-hidden rounded-control border border-line" role="group" aria-label="Scenes">
        {lengths.map((l) => {
          const inRange = selected && l.index >= selected.from && l.index <= selected.to;
          return (
            <button
              key={l.index}
              type="button"
              onClick={() => onPick(l.index)}
              disabled={!selected}
              title={`Scene ${l.index} · ${formatDuration(l.sec)}`}
              aria-pressed={Boolean(inRange)}
              style={{ flexGrow: l.sec, flexBasis: 0 }}
              className={`min-w-6 border-r border-line font-mono text-[11px] transition last:border-r-0 ${
                inRange ? "bg-accent/80 text-accent-ink" : "bg-raised/50 text-muted enabled:hover:bg-raised"
              }`}
            >
              {l.index}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {selected
          ? `Click scenes to stretch or shrink "${selected.name}".`
          : "Select a teaser below, then click scenes here to change its range."}
      </p>
    </div>
  );
}

function SnippetCard({
  snippet,
  lengths,
  sceneCount,
  selected,
  output,
  canPreview,
  onSelect,
  onChange,
  onPreview,
  onRemove,
}: {
  snippet: Snippet;
  lengths: { scenes: SceneLength[]; exact: boolean };
  sceneCount: number;
  selected: boolean;
  output?: OutputView;
  canPreview: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Snippet>) => void;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const { sec } = rangeTime(lengths.scenes, snippet.from, snippet.to);
  const error = snippetError(snippet, sceneCount);
  const upToDate = sameSnippet(output?.snippet, snippet);
  const options = Array.from({ length: sceneCount }, (_, i) => i + 1);
  const select =
    "h-9 rounded-control border border-line bg-bg px-2 text-sm focus:border-accent/50 focus:outline-none";

  return (
    <li>
      <Card
        onFocusCapture={onSelect}
        onClick={onSelect}
        className={`p-4 transition ${selected ? "border-accent/60" : ""} ${error ? "border-danger/50" : ""}`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-44 text-xs text-muted">
            Name
            <input
              value={snippet.name}
              maxLength={SNIPPET_NAME_MAX}
              onChange={(e) => onChange({ name: e.target.value })}
              className="mt-1 block h-9 w-full rounded-control border border-line bg-bg px-3 text-sm text-ink focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            From scene
            <select value={snippet.from} onChange={(e) => onChange({ from: Number(e.target.value) })} className={`${select} mt-1 block text-ink`}>
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            To scene
            <select value={snippet.to} onChange={(e) => onChange({ to: Number(e.target.value) })} className={`${select} mt-1 block text-ink`}>
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="pb-2 font-mono text-sm">
            <span className={sec > SNIPPET_MAX_SEC ? "text-danger" : "text-ink"}>
              {lengths.exact ? "" : "~"}
              {formatDuration(sec)}
            </span>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : sec > SNIPPET_MAX_SEC ? (
          <p className="mt-2 text-xs text-danger">Over 90 s. Teasers work best around a minute; end it a scene earlier.</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
          <span className="font-mono text-xs text-muted">
            {upToDate && output
              ? `Rendered · ${formatDuration(output.durationSec)} · ${formatAmount(output.bytes, "bytes")}`
              : output
                ? "Changed since rendered"
                : "Not rendered yet"}
          </span>
          {upToDate && output && (
            <a href={output.downloadUrl} className="text-accent hover:underline">
              Download
            </a>
          )}
          <span className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              onClick={onPreview}
              disabled={!canPreview || Boolean(error)}
              title={canPreview ? undefined : "Preview works once the story's videos are made"}
              className="h-8 px-2 text-xs"
            >
              ▶ Preview
            </Button>
            <Button variant="ghost" onClick={onRemove} className="h-8 px-2 text-xs" aria-label={`Remove ${snippet.name}`}>
              Remove
            </Button>
          </span>
        </div>
      </Card>
    </li>
  );
}

interface PostableVideo {
  key: string;
  label: string;
  /** Teaser name; absent for the full vertical video. */
  name?: string;
  output: OutputView;
}

function PlatformSection({
  jobId,
  parsed,
  videos,
}: {
  jobId: string;
  parsed: ReturnType<typeof parseScript>;
  videos: PostableVideo[];
}) {
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("shorts");
  const video = videos.find((v) => v.key === videoKey) ?? videos[0];
  const teaserName = video?.name;
  const posts = useMemo(() => platformPosts(parsed, teaserName ? { name: teaserName } : undefined), [parsed, teaserName]);
  const post = posts.find((p) => p.platform === platform) ?? posts[0];
  const { ticks, set } = useTicks(`platform-checklist:${jobId}:${video?.key ?? "none"}`);

  if (!video) return null;
  return (
    <section aria-label="Post on short-video apps" className="mt-10">
      <SectionLabel>Post it</SectionLabel>
      <Card className="mt-3 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs text-muted">
            Video
            <select
              value={video.key}
              onChange={(e) => setVideoKey(e.target.value)}
              className="mt-1 block h-9 rounded-control border border-line bg-bg px-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
            >
              {videos.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <a href={video.output.downloadUrl} className="pb-2 text-sm text-accent hover:underline">
            Download ({formatDuration(video.output.durationSec)} · {formatAmount(video.output.bytes, "bytes")})
          </a>
        </div>

        <div role="tablist" aria-label="App" className="mt-5 flex gap-2 overflow-x-auto">
          {posts.map((p) => {
            const done = p.checklist.every((c) => ticks.has(`${p.platform}:${c.id}`));
            return (
              <button
                key={p.platform}
                role="tab"
                type="button"
                aria-selected={p.platform === post.platform}
                onClick={() => setPlatform(p.platform)}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-muted transition hover:text-ink aria-selected:border-accent/60 aria-selected:bg-accent/10 aria-selected:text-ink"
              >
                {done && <span className="mr-1 text-success">✓</span>}
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <CaptionBox key={`${video.key}-${post.platform}`} caption={post.caption} label={`${post.label} caption`} />
          <ul className="space-y-2">
            {post.checklist.map((c) => {
              const id = `${post.platform}:${c.id}`;
              return (
                <li key={id}>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={ticks.has(id)}
                      onChange={(e) => set(id, e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span>
                      <span className={ticks.has(id) ? "text-muted line-through" : ""}>{c.label}</span>
                      {c.hint && <span className="block text-xs text-muted">{c.hint}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </section>
  );
}

function CaptionBox({ caption, label }: { caption: string; label: string }) {
  const [text, setText] = useState(caption);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor="platform-caption" className="text-sm font-medium">
          {label}
        </label>
        <CopyButton text={text} label="Copy" variant="ghost" className="h-7 px-2 text-xs" />
      </div>
      <textarea
        id="platform-caption"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full resize-y rounded-control border border-line bg-bg px-3 py-2 text-sm leading-relaxed focus:border-accent/50 focus:outline-none"
      />
    </div>
  );
}
