"use client";

import { useRef, useState } from "react";
import type { SceneImageState } from "@/shared/images";
import type { SceneImageView } from "@/server/scene-images";
import type { SceneBusy } from "./use-scene-images";

interface Props {
  sceneNo: number;
  state: SceneImageState;
  view?: SceneImageView;
  busy?: SceneBusy;
  error?: string;
  canGenerate: boolean;
  onGenerate: (newVariant: boolean) => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp";

export function SceneImage({ sceneNo, state, view, busy, error, canGenerate, onGenerate, onUpload, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const disabled = Boolean(busy);
  const upload = view?.entry.source === "upload";

  const pick = (file: File | undefined) => {
    if (file) onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) pick(e.dataTransfer.files[0]);
        }}
        className={`relative aspect-square w-full overflow-hidden rounded-control border bg-raised ${
          dragOver ? "border-accent" : view ? "border-line" : "border-dashed border-line"
        }`}
      >
        {view ? (
          // Presigned storage URLs change per request, so next/image optimisation does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.url} alt={`Image for scene ${sceneNo}`} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-2 text-center text-xs text-muted">
            {dragOver ? "Drop to upload" : "No image yet"}
          </div>
        )}

        {view && !busy && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
            {upload ? "Yours" : "AI"}
          </span>
        )}
        {state === "outdated" && !busy && (
          <span
            title={
              upload
                ? "The scene description changed since you uploaded this image."
                : "The scene changed since this image was made. Make a new one to match."
            }
            className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-ink"
          >
            Outdated
          </span>
        )}
        {busy && (
          <div role="status" className="absolute inset-0 grid place-items-center bg-bg/75 text-center text-xs">
            <div>
              <div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              {busy.kind === "generating" && "Drawing…"}
              {busy.kind === "uploading" && `Uploading ${Math.round(busy.progress * 100)}%`}
              {busy.kind === "removing" && "Removing…"}
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-1">
        {canGenerate && (
          <SmallButton disabled={disabled} onClick={() => onGenerate(Boolean(view))}>
            {view ? "New image" : "Generate"}
          </SmallButton>
        )}
        <SmallButton disabled={disabled} onClick={() => inputRef.current?.click()}>
          {view ? "Replace" : "Upload"}
        </SmallButton>
        {view && (
          <SmallButton disabled={disabled} onClick={onRemove} aria-label={`Remove image for scene ${sceneNo}`}>
            Remove
          </SmallButton>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function SmallButton(props: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-control border border-line px-2 py-1 text-xs text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
    />
  );
}
