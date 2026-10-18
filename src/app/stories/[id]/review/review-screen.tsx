"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useTicks } from "@/lib/use-ticks";
import { useRouter } from "next/navigation";
import { parseScript } from "@/shared/script/parse";
import type { Scene } from "@/shared/script/types";
import type { JobFile, VideoFormat } from "@/shared/job";
import type { StoryStatus } from "@/shared/status";
import { buildImagePrompt, sceneImageState } from "@/shared/images";
import { estimateLineSec, formatDuration } from "@/shared/timing";
import { formatAmount } from "@/shared/usage";
import { changesSinceRender, PUBLISH_CHECKLIST, TITLE_MAX, type PublishText } from "@/shared/publish";
import type { GenerationView, OutputView } from "@/server/generation";
import type { SceneImageView } from "@/server/scene-images";
import type { StoryMedia } from "@/server/jobs";
import { Button, ButtonLink, Card, EmptyState, plural, SectionLabel, StatusChip } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { markDownloadedAction, storyMediaAction } from "../../../actions";
import { useGeneration } from "../use-generation";
import { GenerationPanel } from "../generation-panel";
import { SceneImage } from "../scene-image";
import { useSceneImages } from "../use-scene-images";

interface Props {
  job: JobFile;
  status: StoryStatus;
  initialView: GenerationView;
  images: Record<number, SceneImageView>;
  artStyle: string;
  canGenerateImages: boolean;
  suggested: PublishText;
}

const FORMAT_LABEL: Record<VideoFormat, string> = { "16x9": "16:9 · YouTube", "9x16": "9:16 · Shorts, Reels, TikTok" };
const noSave = async () => {};

export function ReviewScreen({ job, status, initialView, images: initialImages, artStyle, canGenerateImages, suggested }: Props) {
  const parsed = useMemo(() => parseScript(job.script), [job.script]);
  const generation = useGeneration(job.jobId, initialView);
  const sceneImages = useSceneImages(job.jobId, initialImages, noSave);
  const view = generation.view ?? initialView;
  const s = view.status;
  const done = s?.state === "done";
  const downloaded = status === "downloaded" && !s;
  const editorHref = `/stories/${job.jobId}`;
  const fullOutputs = view.outputs.filter((o) => !o.snippet);

  const changes = changesSinceRender(
    s,
    job.updatedAt,
    parsed.scenes.map((sc) => sc.index),
    Object.fromEntries(Object.entries(sceneImages.images).map(([n, v]) => [n, v.entry])),
  );
  const changed = changes.script || changes.scenes.length > 0;
  const renderAgain = () => void generation.start(noSave);

  const jumpToScene = (n: number) =>
    document.getElementById(`scene-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={editorHref} className="text-sm text-muted hover:text-ink">
          ← Editor
        </Link>
        <span className="hidden text-line sm:inline">/</span>
        <h1 className="order-last min-w-0 basis-full truncate font-serif text-2xl sm:order-0 sm:flex-1 sm:basis-auto">
          {job.title || "Untitled story"}
        </h1>
        <StatusChip status={generation.active ? "generating" : downloaded ? "downloaded" : status} />
      </div>

      {s && !done && (
        <div className="mt-5">
          <GenerationPanel view={view} onRetry={renderAgain} retrying={generation.starting} onJumpToScene={jumpToScene} />
        </div>
      )}
      {generation.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {generation.error}
        </p>
      )}

      {downloaded && <DownloadedNotice job={job} onGenerate={renderAgain} starting={generation.starting} />}

      {!s && !downloaded && (
        <div className="mt-8">
          <EmptyState title="No videos yet" action={<ButtonLink href={editorHref} variant="primary">Open the editor</ButtonLink>}>
            Generate the story from the editor first. The finished videos show up here to watch, check and publish.
          </EmptyState>
        </div>
      )}

      {done && (
        <>
          {changed && (
            <Card role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-accent/50 p-4">
              <p className="text-sm">
                <span className="text-accent">Not in the videos yet: </span>
                {[
                  changes.script && "script or voice edits",
                  changes.scenes.length && `new images for ${plural(changes.scenes.length, "scene")}`,
                ]
                  .filter(Boolean)
                  .join(" and ")}
                . Rendering again reuses everything else, so it&apos;s quick.
              </p>
              <Button variant="primary" onClick={renderAgain} disabled={generation.starting} className="h-9">
                {generation.starting ? "Starting…" : "Render again"}
              </Button>
            </Card>
          )}
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Player outputs={fullOutputs} warnings={s.warnings ?? []} snippetsHref={`${editorHref}/snippets`} />
            <PublishPanel jobId={job.jobId} suggested={suggested} outputs={fullOutputs} />
          </div>
        </>
      )}

      {parsed.scenes.length > 0 && (
        <section aria-label="Scenes" className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel>Scenes ({parsed.scenes.length})</SectionLabel>
            <p className="text-xs text-muted">
              Swap a picture here, then Render again. Words are changed in the{" "}
              <Link href={editorHref} className="text-accent hover:underline">
                editor
              </Link>
              .
            </p>
          </div>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {parsed.scenes.map((scene) => (
              <SceneCard
                key={scene.index}
                scene={scene}
                changed={done && changes.scenes.includes(scene.index)}
                image={
                  <SceneImage
                    sceneNo={scene.index}
                    state={sceneImageState(
                      sceneImages.images[scene.index]?.entry,
                      buildImagePrompt(scene, artStyle, parsed.looks),
                      scene.description,
                    )}
                    view={sceneImages.images[scene.index]}
                    busy={sceneImages.busy[scene.index]}
                    error={sceneImages.errors[scene.index]}
                    canGenerate={canGenerateImages && !generation.active}
                    onGenerate={(newVariant) => sceneImages.generate(scene.index, newVariant)}
                    onUpload={(file) => sceneImages.upload(scene.index, file)}
                    onRemove={() => sceneImages.remove(scene.index)}
                  />
                }
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Player({ outputs, warnings, snippetsHref }: { outputs: OutputView[]; warnings: string[]; snippetsHref: string }) {
  const [format, setFormat] = useState<VideoFormat>(outputs[0]?.format ?? "16x9");
  const current = outputs.find((o) => o.format === format) ?? outputs[0];
  if (!current) return null;
  const vertical = current.format === "9x16";

  return (
    // Stays in view on wide screens while the checklist beside it is scrolled.
    <Card className="min-w-0 self-start p-4 lg:sticky lg:top-20">
      {outputs.length > 1 && (
        <div role="tablist" aria-label="Video format" className="mb-3 inline-flex rounded-control border border-line p-1">
          {outputs.map((o) => (
            <button
              key={o.format}
              role="tab"
              type="button"
              aria-selected={o.format === current.format}
              onClick={() => setFormat(o.format)}
              className="rounded-sm px-3 py-1 text-sm text-muted aria-selected:bg-raised aria-selected:text-ink"
            >
              {o.format === "9x16" ? "9:16" : "16:9"}
            </button>
          ))}
        </div>
      )}
      <div className={vertical ? "mx-auto max-w-75" : ""}>
        <video
          key={current.format}
          controls
          preload="metadata"
          src={current.url}
          className={`w-full rounded-control border border-line bg-black ${vertical ? "aspect-9/16" : "aspect-video"}`}
        />
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {outputs.map((o) => (
          <li key={o.format} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span>
              {FORMAT_LABEL[o.format]}
              <span className="ml-2 font-mono text-xs text-muted">
                {formatDuration(o.durationSec)} · {formatAmount(o.bytes, "bytes")}
              </span>
            </span>
            <a href={o.downloadUrl} className="text-accent underline-offset-4 hover:underline">
              Download
            </a>
          </li>
        ))}
      </ul>
      <ButtonLink href={snippetsHref} className="mt-3 h-9 w-full">
        Teasers for Shorts, Reels &amp; TikTok →
      </ButtonLink>
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {warnings.map((w, i) => (
            <li key={i}>Note: {w}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PublishPanel({ jobId, suggested, outputs }: { jobId: string; suggested: PublishText; outputs: OutputView[] }) {
  const [title, setTitle] = useState(suggested.title);
  const [description, setDescription] = useState(suggested.description);
  const [tags, setTags] = useState(suggested.tags.join(", "));
  const { ticks, set } = useTicks(`publish-checklist:${jobId}`);
  const allTicked = PUBLISH_CHECKLIST.every((item) => ticks.has(item.id));
  const landscape = outputs.find((o) => o.format === "16x9");

  return (
    <Card className="min-w-0 p-5">
      <h2 className="font-serif text-xl">Publish on YouTube</h2>
      <p className="mt-1 text-sm text-muted">Suggestions to start from. Edit them; nothing here is posted for you.</p>

      <div className="mt-4 space-y-4">
        <Field
          id="pub-title"
          label="Title"
          counter={`${title.length}/${TITLE_MAX}`}
          over={title.length > TITLE_MAX}
          copy={title}
        >
          <input
            id="pub-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-control border border-line bg-bg px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
        </Field>
        <Field id="pub-desc" label="Description" copy={description}>
          <textarea
            id="pub-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={7}
            className="w-full resize-y rounded-control border border-line bg-bg px-3 py-2 text-sm leading-relaxed focus:border-accent/50 focus:outline-none"
          />
        </Field>
        <Field id="pub-tags" label="Tags" copy={tags}>
          <input
            id="pub-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full rounded-control border border-line bg-bg px-3 py-2 font-mono text-xs focus:border-accent/50 focus:outline-none"
          />
        </Field>
      </div>

      <div className="mt-6">
        <SectionLabel>Checklist</SectionLabel>
        <ul className="mt-3 space-y-2">
          {PUBLISH_CHECKLIST.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={ticks.has(item.id)}
                  onChange={(e) => set(item.id, e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span>
                  <span className={ticks.has(item.id) ? "text-muted line-through" : ""}>{item.label}</span>
                  {item.id === "downloaded" && landscape && (
                    <>
                      {" "}
                      <a
                        href={landscape.downloadUrl}
                        onClick={() => set("downloaded", true)}
                        className="text-accent hover:underline"
                      >
                        Download
                      </a>
                    </>
                  )}
                  {item.hint && <span className="block text-xs text-muted">{item.hint}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <MarkDownloaded jobId={jobId} ready={allTicked} />
    </Card>
  );
}

function Field({
  id,
  label,
  counter,
  over,
  copy,
  children,
}: {
  id: string;
  label: string;
  counter?: string;
  over?: boolean;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {counter && <span className={`ml-2 font-mono text-xs ${over ? "text-danger" : "text-muted"}`}>{counter}</span>}
        </label>
        <CopyButton text={copy} label="Copy" variant="ghost" className="h-7 px-2 text-xs" />
      </div>
      {children}
    </div>
  );
}

function MarkDownloaded({ jobId, ready }: { jobId: string; ready: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<StoryMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, startMarking] = useTransition();

  const openDialog = () => {
    setOpen(true);
    setMedia(null);
    setError(null);
    storyMediaAction(jobId)
      .then((res) => ("error" in res ? setError(res.error) : setMedia(res)))
      .catch(() => setError("Could not reach the server. Check your connection and try again."));
  };
  const confirm = () =>
    startMarking(async () => {
      const res = await markDownloadedAction(jobId).catch(() => ({ error: "Could not reach the server." }));
      if ("error" in res) return setError(res.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="mt-6 border-t border-line pt-5">
      <Button variant={ready ? "primary" : "secondary"} onClick={openDialog} className="w-full">
        Mark as downloaded
      </Button>
      <p className="mt-2 text-xs text-muted">
        Frees storage by deleting this story&apos;s videos, images and voices. The script stays.
      </p>

      <ConfirmDialog
        open={open}
        danger
        busy={marking}
        confirmDisabled={!media}
        title="Delete this story's files?"
        confirmLabel="Delete files"
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      >
        <p>To save storage, these are deleted from the cloud:</p>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : !media ? (
          <p aria-busy>Checking files…</p>
        ) : media.groups.length === 0 ? (
          <p className="text-ink">Nothing: this story has no large files stored.</p>
        ) : (
          <ul className="space-y-1 rounded-control border border-line bg-raised/50 px-3 py-2 font-mono text-xs text-ink">
            {media.groups.map((g) => (
              <li key={g.kind} className="flex justify-between gap-4">
                <span>
                  {g.kind === "videos" ? "Videos" : g.kind === "images" ? "Images" : "Voice clips"} ({g.files})
                </span>
                <span>{formatAmount(g.bytes, "bytes")}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4 border-t border-line pt-1 text-accent">
              <span>Space freed</span>
              <span>{formatAmount(media.totalBytes, "bytes")}</span>
            </li>
          </ul>
        )}
        <p>
          <span className="text-ink">Kept:</span> the script and voice choices.
        </p>
        <p className="text-danger">Make sure the videos are saved on your computer first.</p>
        <p>
          Generating again later remakes the voices and AI images (using free allowance)
          {media && media.uploadedImages > 0 && (
            <span className="text-ink">
              , but your {plural(media.uploadedImages, "uploaded image")} must be uploaded again
            </span>
          )}
          .
        </p>
      </ConfirmDialog>
    </div>
  );
}

function DownloadedNotice({ job, onGenerate, starting }: { job: JobFile; onGenerate: () => void; starting: boolean }) {
  const when = job.downloadedAt ? new Date(job.downloadedAt).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "";
  return (
    <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="font-serif text-xl">Downloaded{when && ` on ${when}`}</h2>
        <p className="text-sm text-muted">
          The videos, images and voices were deleted from storage. The script is still here.
        </p>
      </div>
      <Button onClick={onGenerate} disabled={starting} className="h-9">
        {starting ? "Starting…" : "Generate again"}
      </Button>
    </Card>
  );
}

function SceneCard({ scene, changed, image }: { scene: Scene; changed: boolean; image: React.ReactNode }) {
  const sec = scene.lines.reduce((n, l) => n + estimateLineSec(l.text, l.parts) + l.pauseBefore, 0) + scene.pauseAfter;
  return (
    <li id={`scene-${scene.index}`} className="scroll-mt-24">
      <Card className={`flex h-full gap-3 p-3 ${changed ? "border-accent/50" : ""}`}>
        <div className="w-36 shrink-0">{image}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 font-mono text-xs">
            <span className="text-accent">{String(scene.index).padStart(2, "0")}</span>
            <span className="text-muted">~{formatDuration(sec)}</span>
          </div>
          <p className="mt-1 line-clamp-3 text-sm">{scene.description ?? <span className="italic text-muted">No description</span>}</p>
          {scene.lines[0] && <p className="mt-1 line-clamp-2 text-xs text-muted">{scene.lines[0].text}</p>}
          {changed && <p className="mt-1 text-xs text-accent">Changed since the videos were made</p>}
        </div>
      </Card>
    </li>
  );
}
