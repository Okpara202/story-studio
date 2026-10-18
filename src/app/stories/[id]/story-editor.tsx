"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { parseScript } from "@/shared/script/parse";
import type { ParsedStory, Scene } from "@/shared/script/types";
import { estimateStorySec, formatDuration } from "@/shared/timing";
import { suggestVoices } from "@/shared/voices";
import type { JobFile } from "@/shared/job";
import type { StoryStatus } from "@/shared/status";
import { buildImagePrompt, sceneImageState } from "@/shared/images";
import type { SceneImageView } from "@/server/scene-images";
import { SCRIPT_CHEATSHEET } from "@/lib/example-script";
import { Button, plural, StatusChip } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteStoryAction, saveStoryAction } from "../../actions";
import { ScriptPreview } from "./script-preview";
import { SceneImage } from "./scene-image";
import { useSceneImages } from "./use-scene-images";
import { useGeneration } from "./use-generation";
import { GenerationPanel } from "./generation-panel";

interface Props {
  job: JobFile;
  status: StoryStatus;
  narratorVoice: string;
  artStyle: string;
  images: Record<number, SceneImageView>;
  /** True when a fast image generator (Cloudflare) is configured. */
  canGenerateImages: boolean;
}

export function StoryEditor({ job, status, narratorVoice, artStyle, images: initialImages, canGenerateImages }: Props) {
  const [script, setScript] = useState(job.script);
  const [savedScript, setSavedScript] = useState(job.script);
  const [saveError, setSaveError] = useState(false);
  const [savedVoices, setSavedVoices] = useState(job.voices);
  const [tab, setTab] = useState<"script" | "preview">("script");
  const [deleting, startDelete] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const deferred = useDeferredValue(script);
  const parsed: ParsedStory = useMemo(() => parseScript(deferred), [deferred]);
  const estimate = useMemo(() => estimateStorySec(parsed.scenes), [parsed]);

  // Autosave shortly after typing stops; retries on the next keystroke if it failed.
  const saving = script !== savedScript;
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => {
      saveStoryAction(job.jobId, { script })
        .then(() => {
          setSavedScript(script);
          setSaveError(false);
        })
        .catch(() => setSaveError(true));
    }, 600);
    return () => clearTimeout(t);
  }, [saving, script, job.jobId]);

  // Warn before closing the tab with unsaved text.
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  const voices = useMemo(
    () => suggestVoices(parsed.characters.map((c) => c.id), savedVoices, narratorVoice),
    [parsed.characters, savedVoices, narratorVoice],
  );

  // Image actions read the saved script, so save pending edits first.
  const flushSave = async () => {
    if (script === savedScript) return;
    await saveStoryAction(job.jobId, { script });
    setSavedScript(script);
  };
  const sceneImages = useSceneImages(job.jobId, initialImages, flushSave);
  const imageStates = new Map(
    parsed.scenes.map((s) => [
      s.index,
      sceneImageState(sceneImages.images[s.index]?.entry, buildImagePrompt(s, artStyle), s.description),
    ]),
  );
  // Scenes the batch button would draw: missing images, and outdated AI images (never replaces uploads).
  const toDraw = parsed.scenes
    .filter((s) => {
      const state = imageStates.get(s.index);
      return state === "missing" || (state === "outdated" && sceneImages.images[s.index]?.entry.source === "generated");
    })
    .map((s) => s.index);
  const anyBusy = Object.keys(sceneImages.busy).length > 0;

  const setVoice = (speakerId: string, voiceId: string) => {
    const next = { ...voices, [speakerId]: voiceId };
    setSavedVoices(next);
    saveStoryAction(job.jobId, { voices: next }).catch(() => setSaveError(true));
  };

  const generation = useGeneration(job.jobId);
  // The worker reads the saved script, so pending edits are saved first.
  const generate = () => void generation.start(flushSave);

  const jumpToLine = (line: number) => {
    const el = textareaRef.current;
    if (!el) return;
    setTab("script");
    const lines = script.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    const end = start + (lines[line - 1]?.length ?? 0);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
      el.scrollTop = Math.max(0, (line - 4) * lineHeight);
    });
  };

  // Writes the effects into the script under the scene's [scene: ...] line, so the script stays the one source.
  const addEffects = (scene: Scene, effects: string[]) => {
    const lines = script.split("\n");
    lines.splice(scene.sourceLine, 0, `[fx: ${effects.join(", ")}]`);
    setScript(lines.join("\n"));
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = () => setConfirmDelete(true);

  const errors = parsed.issues.filter((i) => i.severity === "error").length;
  const lineCount = parsed.scenes.reduce((n, s) => n + s.lines.length, 0);
  const isEmpty = script.trim() === "";

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 pb-28 pt-6 sm:px-6 lg:pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Stories
        </Link>
        <span className="hidden text-line sm:inline">/</span>
        <h1 className="order-last min-w-0 basis-full truncate font-serif text-2xl sm:order-0 sm:flex-1 sm:basis-auto">
          {parsed.title || <span className="text-muted">Untitled story</span>}
        </h1>
        <span className="ml-auto sm:ml-0">
          <StatusChip status={status} />
        </span>
        <span aria-live="polite" className="w-20 text-right font-mono text-xs text-muted">
          {saveError ? <span className="text-danger">Not saved</span> : saving ? "Saving…" : "Saved"}
        </span>
        <Button
          variant="ghost"
          onClick={remove}
          disabled={deleting}
          aria-label="Delete story"
          title="Delete story"
          className="px-2"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        </Button>
      </div>

      {/* Mobile tabs */}
      <div role="tablist" aria-label="Editor view" className="mt-5 grid grid-cols-2 rounded-control border border-line p-1 lg:hidden">
        {(["script", "preview"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="rounded-sm py-1.5 text-sm capitalize text-muted aria-selected:bg-raised aria-selected:text-ink"
          >
            {t}
            {t === "preview" && parsed.issues.length > 0 && (
              <span className={`ml-1.5 font-mono text-xs ${errors ? "text-danger" : "text-accent"}`}>
                {parsed.issues.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {generation.view?.status && (
        <div className="mt-5">
          <GenerationPanel
            view={generation.view}
            onRetry={generate}
            retrying={generation.starting}
            reviewHref={`/stories/${job.jobId}/review`}
            onJumpToScene={(n) => {
              const scene = parsed.scenes.find((s) => s.index === n);
              if (scene) jumpToLine(scene.sourceLine);
            }}
          />
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:h-[calc(100dvh-14.5rem)] lg:min-h-112 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Script pane */}
        <section aria-label="Script" className={`${tab === "script" ? "flex" : "hidden"} relative min-w-0 flex-col lg:flex lg:min-h-0`}>
          <label htmlFor="script" className="sr-only">
            Story script
          </label>
          <textarea
            id="script"
            ref={textareaRef}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            spellCheck
            placeholder={"# Your story title\n[scene: what the viewer sees]\nNARRATOR: The first line of your story."}
            className="min-h-[60vh] w-full flex-1 resize-y rounded-card lg:min-h-0 lg:resize-none border border-line bg-surface p-5 font-mono text-[14px] leading-6 text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
          />
          <details className="mt-3 max-h-48 shrink-0 overflow-y-auto rounded-card border border-line bg-surface px-4 py-3 text-sm" open={isEmpty}>
            <summary className="cursor-pointer text-muted hover:text-ink">Script format</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
              {SCRIPT_CHEATSHEET.map((row) => (
                <div key={row.code} className="contents">
                  <dt className="font-mono text-accent">{row.code}</dt>
                  <dd className="text-muted">{row.note}</dd>
                </div>
              ))}
            </dl>
            <Link href="/guide" className="mt-3 inline-block text-accent hover:underline">
              Full guide and AI prompt →
            </Link>
          </details>
        </section>

        {/* Preview pane */}
        <section aria-label="Preview" className={`${tab === "preview" ? "block" : "hidden"} relative min-w-0 lg:block lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 scrollbar-gutter-stable scrollbar-thin`}>
          <ScriptPreview
            parsed={parsed}
            isEmpty={isEmpty}
            voices={voices}
            onVoiceChange={setVoice}
            onJumpToLine={jumpToLine}
            onAddEffects={addEffects}
            renderSceneImage={(scene) => (
              <SceneImage
                sceneNo={scene.index}
                state={imageStates.get(scene.index) ?? "missing"}
                view={sceneImages.images[scene.index]}
                busy={sceneImages.busy[scene.index]}
                error={sceneImages.errors[scene.index]}
                canGenerate={canGenerateImages}
                onGenerate={(newVariant) => sceneImages.generate(scene.index, newVariant)}
                onUpload={(file) => sceneImages.upload(scene.index, file)}
                onRemove={() => sceneImages.remove(scene.index)}
              />
            )}
            scenesToolbar={
              canGenerateImages ? (
                <Button
                  className="h-8 px-3 text-xs"
                  disabled={toDraw.length === 0 || anyBusy || errors > 0}
                  onClick={() => sceneImages.generateMany(toDraw)}
                  title={errors > 0 ? "Fix the script errors first" : undefined}
                >
                  {sceneImages.batch
                    ? `Drawing ${Math.min(sceneImages.batch.done + 1, sceneImages.batch.total)} of ${sceneImages.batch.total}…`
                    : toDraw.length
                      ? `Generate ${plural(toDraw.length, "image")}`
                      : "All scenes have images"}
                </Button>
              ) : (
                <span className="text-xs text-muted">Upload images per scene, or set up image generation (README)</span>
              )
            }
          />
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={deleting}
        title="Delete this story?"
        confirmLabel="Delete story"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => startDelete(() => deleteStoryAction(job.jobId))}
      >
        <p>
          <span className="text-ink">&ldquo;{parsed.title || "Untitled story"}&rdquo;</span> and all its files will be
          deleted from storage: script, voices, images and videos.
        </p>
        <p className="text-danger">This cannot be undone. Download any videos you want to keep first.</p>
      </ConfirmDialog>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface/95 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <dl className="flex gap-5 font-mono text-xs text-muted">
            <div>
              <dt className="sr-only">Estimated length</dt>
              <dd>
                <span className="text-base text-ink">~{formatDuration(estimate)}</span> video
              </dd>
            </div>
            <div className="hidden self-end sm:block">
              <dt className="sr-only">Scenes</dt>
              <dd>{plural(parsed.scenes.length, "scene")}</dd>
            </div>
            <div className="hidden self-end sm:block">
              <dt className="sr-only">Lines</dt>
              <dd>{plural(lineCount, "line")}</dd>
            </div>
          </dl>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs md:inline">
              {generation.error ? (
                <span className="text-danger">{generation.error}</span>
              ) : errors > 0 ? (
                <span className="text-muted">Fix {plural(errors, "error")} to continue</span>
              ) : generation.active ? (
                <span className="text-muted">Running in the cloud…</span>
              ) : (
                <span className="text-muted">Voices, images and both videos, in the cloud</span>
              )}
            </span>
            <Button
              variant="primary"
              disabled={errors > 0 || generation.active || generation.starting || isEmpty}
              onClick={generate}
            >
              {generation.starting
                ? "Starting…"
                : generation.active
                  ? "Generating…"
                  : generation.view?.status?.state === "done"
                    ? "Generate again"
                    : "Generate video"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
