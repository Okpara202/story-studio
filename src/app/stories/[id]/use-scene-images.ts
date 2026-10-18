"use client";

import { useState } from "react";
import type { SceneImageView } from "@/server/scene-images";
import { putWithProgress } from "@/lib/upload";
import {
  confirmSceneImageUploadAction,
  createSceneImageUploadAction,
  generateSceneImageAction,
  removeSceneImageAction,
} from "../../actions";

export type SceneBusy = { kind: "generating" } | { kind: "uploading"; progress: number } | { kind: "removing" };

/** Errors that will repeat for every scene, so a batch should stop instead of trying the rest. */
const BLOCKING = /No image generator|allowance is used up|rejected the API token/;

/**
 * Scene image state for the editor. `flushSave` makes sure the server has the
 * script the owner sees before an image is made from it.
 */
export function useSceneImages(jobId: string, initial: Record<number, SceneImageView>, flushSave: () => Promise<void>) {
  const [images, setImages] = useState(initial);
  const [busy, setBusy] = useState<Record<number, SceneBusy>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  const setBusyFor = (n: number, b: SceneBusy | null) =>
    setBusy((s) => {
      const next = { ...s };
      if (b) next[n] = b;
      else delete next[n];
      return next;
    });
  const setErrorFor = (n: number, e: string | null) =>
    setErrors((s) => {
      const next = { ...s };
      if (e) next[n] = e;
      else delete next[n];
      return next;
    });

  /** Returns the error message, or null on success. */
  async function generate(n: number, newVariant: boolean): Promise<string | null> {
    setErrorFor(n, null);
    setBusyFor(n, { kind: "generating" });
    try {
      await flushSave();
      const res = await generateSceneImageAction(jobId, n, newVariant);
      if ("error" in res) {
        setErrorFor(n, res.error);
        return res.error;
      }
      setImages((s) => ({ ...s, [n]: res }));
      return null;
    } catch {
      const message = "Could not reach the server. Check your connection and try again.";
      setErrorFor(n, message);
      return message;
    } finally {
      setBusyFor(n, null);
    }
  }

  async function upload(n: number, file: File) {
    setErrorFor(n, null);
    setBusyFor(n, { kind: "uploading", progress: 0 });
    try {
      await flushSave();
      const target = await createSceneImageUploadAction(jobId, n, { type: file.type, size: file.size });
      if ("error" in target) return setErrorFor(n, target.error);
      await putWithProgress(target.url, file, (progress) => setBusyFor(n, { kind: "uploading", progress }));
      const res = await confirmSceneImageUploadAction(jobId, n, target.ext);
      if ("error" in res) return setErrorFor(n, res.error);
      setImages((s) => ({ ...s, [n]: res }));
    } catch (err) {
      setErrorFor(n, err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusyFor(n, null);
    }
  }

  async function remove(n: number) {
    setErrorFor(n, null);
    setBusyFor(n, { kind: "removing" });
    try {
      const res = await removeSceneImageAction(jobId, n);
      if ("error" in res) return setErrorFor(n, res.error);
      setImages((s) => {
        const next = { ...s };
        delete next[n];
        return next;
      });
    } finally {
      setBusyFor(n, null);
    }
  }

  /** One scene at a time, to stay friendly with free-tier rate limits. */
  async function generateMany(sceneNos: number[]) {
    setBatch({ done: 0, total: sceneNos.length });
    try {
      for (const [i, n] of sceneNos.entries()) {
        const error = await generate(n, false);
        setBatch({ done: i + 1, total: sceneNos.length });
        if (error && BLOCKING.test(error)) break;
      }
    } finally {
      setBatch(null);
    }
  }

  return { images, busy, errors, batch, generate, upload, remove, generateMany };
}
