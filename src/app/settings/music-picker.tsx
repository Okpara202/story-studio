"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { putWithProgress } from "@/lib/upload";
import { createMusicUploadAction, musicPreviewUrlAction } from "../actions";

interface Props {
  /** Storage key of the chosen track, or null. */
  file: string | null;
  initialUrl: string | null;
  onChange: (file: string | null) => void;
}

type Upload = { state: "idle" } | { state: "uploading"; progress: number } | { state: "error"; message: string };

export function MusicPicker({ file, initialUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const [previewUrl, setPreviewUrl] = useState(initialUrl);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setUpload({ state: "uploading", progress: 0 });
    try {
      const res = await createMusicUploadAction({ name: picked.name, type: picked.type, size: picked.size });
      if ("error" in res) {
        setUpload({ state: "error", message: res.error });
        return;
      }
      await putWithProgress(res.url, picked, (progress) => setUpload({ state: "uploading", progress }));
      setPreviewUrl(await musicPreviewUrlAction(res.key));
      setUpload({ state: "idle" });
      onChange(res.key);
    } catch (err) {
      setUpload({ state: "error", message: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const name = file?.split("/").pop();

  return (
    <div className="rounded-control border border-dashed border-line p-4">
      {file ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-accent">♪ {name}</span>
          {previewUrl && (
            <audio controls preload="none" src={previewUrl} className="h-8 max-w-full flex-1" />
          )}
          <Button variant="ghost" className="h-8 px-2" onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">No music. Videos will have voices only.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a"
          className="sr-only"
          id="music-file"
          onChange={(e) => choose(e.target.files?.[0])}
          disabled={upload.state === "uploading"}
        />
        <label
          htmlFor="music-file"
          className="inline-flex h-9 cursor-pointer items-center rounded-control border border-line bg-raised px-3 text-sm hover:border-muted"
        >
          {file ? "Replace track" : "Upload a track"}
        </label>
        <span className="text-xs text-muted">MP3, WAV, OGG or M4A, up to 25 MB</span>
      </div>

      {upload.state === "uploading" && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(upload.progress * 100)}%` }} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted">Uploading… {Math.round(upload.progress * 100)}%</p>
        </div>
      )}
      {upload.state === "error" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {upload.message}
        </p>
      )}
    </div>
  );
}
