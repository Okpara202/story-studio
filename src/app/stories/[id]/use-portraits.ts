"use client";

import { useState } from "react";
import type { PortraitView } from "@/server/characters";
import { putWithProgress } from "@/lib/upload";
import {
  confirmPortraitUploadAction,
  createPortraitUploadAction,
  generatePortraitAction,
  removePortraitAction,
} from "../../actions";
import type { SceneBusy } from "./use-scene-images";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

/**
 * Reference portraits for described characters, keyed by character id.
 * `flushSave` makes sure the server has the script the owner sees first.
 */
export function usePortraits(jobId: string, initial: Record<string, PortraitView>, flushSave: () => Promise<void>) {
  const [portraits, setPortraits] = useState(initial);
  const [busy, setBusy] = useState<Record<string, SceneBusy>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <T,>(set: (fn: (s: Record<string, T>) => Record<string, T>) => void, id: string, value: T | null) =>
    set((s) => {
      const next = { ...s };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });
  const setBusyFor = (id: string, b: SceneBusy | null) => update(setBusy, id, b);
  const setErrorFor = (id: string, e: string | null) => update(setErrors, id, e);

  async function generate(id: string, newVariant: boolean) {
    setErrorFor(id, null);
    setBusyFor(id, { kind: "generating" });
    try {
      await flushSave();
      const res = await generatePortraitAction(jobId, id, newVariant);
      if ("error" in res) setErrorFor(id, res.error);
      else update(setPortraits, id, res);
    } catch {
      setErrorFor(id, OFFLINE);
    } finally {
      setBusyFor(id, null);
    }
  }

  async function upload(id: string, file: File) {
    setErrorFor(id, null);
    setBusyFor(id, { kind: "uploading", progress: 0 });
    try {
      await flushSave();
      const target = await createPortraitUploadAction(jobId, id, { type: file.type, size: file.size });
      if ("error" in target) return setErrorFor(id, target.error);
      await putWithProgress(target.url, file, (progress) => setBusyFor(id, { kind: "uploading", progress }));
      const res = await confirmPortraitUploadAction(jobId, id, target.ext);
      if ("error" in res) setErrorFor(id, res.error);
      else update(setPortraits, id, res);
    } catch (err) {
      setErrorFor(id, err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusyFor(id, null);
    }
  }

  async function remove(id: string) {
    setErrorFor(id, null);
    setBusyFor(id, { kind: "removing" });
    try {
      const res = await removePortraitAction(jobId, id);
      if ("error" in res) setErrorFor(id, res.error);
      else update(setPortraits, id, null);
    } catch {
      setErrorFor(id, OFFLINE);
    } finally {
      setBusyFor(id, null);
    }
  }

  return { portraits, busy, errors, generate, upload, remove };
}
