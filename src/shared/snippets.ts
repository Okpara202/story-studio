import type { Snippet } from "./job.ts";
import type { Scene } from "./script/types.ts";
import type { SceneTime } from "./status.ts";
import { computeTimeline, estimateLineSec, scenePauses } from "./timing.ts";

/** Teasers aim for about a minute and should stay under 90 s to suit every short-video app. */
export const SNIPPET_TARGET_SEC = 60;
export const SNIPPET_MAX_SEC = 90;
export const MAX_SNIPPETS = 6;
export const SNIPPET_NAME_MAX = 60;

export interface SceneLength {
  index: number;
  start: number;
  sec: number;
}

export interface StoryLengths {
  scenes: SceneLength[];
  /** True when measured from a finished render, false when estimated from word counts. */
  exact: boolean;
}

/**
 * Length of every scene: measured times from the last render when they still
 * match the script's scenes, otherwise estimates.
 */
export function storyLengths(scenes: Pick<Scene, "index" | "lines" | "pauseAfter">[], measured?: SceneTime[]): StoryLengths {
  if (measured?.length && measured.length === scenes.length && measured.every((m, i) => m.index === scenes[i].index)) {
    return { scenes: measured.map((m) => ({ ...m })), exact: true };
  }
  const timeline = computeTimeline(
    scenes.map((s) => s.lines.map((l) => estimateLineSec(l.text, l.parts))),
    undefined,
    scenePauses(scenes),
  );
  return {
    scenes: timeline.scenes.map((t, i) => ({ index: scenes[i].index, start: t.start, sec: t.duration })),
    exact: false,
  };
}

/** Start and length of a scene range. */
export function rangeTime(lengths: SceneLength[], from: number, to: number): { start: number; sec: number } {
  const inRange = lengths.filter((l) => l.index >= from && l.index <= to);
  if (!inRange.length) return { start: 0, sec: 0 };
  return { start: inRange[0].start, sec: inRange.reduce((n, l) => n + l.sec, 0) };
}

/**
 * A range starting at `from` that fills about a minute: whole scenes only,
 * at least one scene, never past 90 s unless a single scene is longer.
 */
export function suggestRange(lengths: SceneLength[], from = 1, target = SNIPPET_TARGET_SEC): { from: number; to: number } {
  const after = lengths.filter((l) => l.index >= from);
  if (!after.length) return { from, to: from };
  let to = after[0].index;
  let total = after[0].sec;
  for (const l of after.slice(1)) {
    if (total >= target || total + l.sec > SNIPPET_MAX_SEC) break;
    total += l.sec;
    to = l.index;
  }
  return { from: after[0].index, to };
}

export function newSnippetId(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
}

/** A new snippet after the last one (or the opening hook for the first). */
export function nextSnippet(existing: Snippet[], lengths: SceneLength[], id = newSnippetId()): Snippet | null {
  if (!lengths.length || existing.length >= MAX_SNIPPETS) return null;
  const lastTo = Math.max(0, ...existing.map((s) => s.to));
  const start = lastTo < lengths[lengths.length - 1].index ? lastTo + 1 : 1;
  const range = suggestRange(lengths, start);
  return { id, name: existing.length === 0 ? "Hook" : `Teaser ${existing.length + 1}`, ...range };
}

/** Problems that block rendering a snippet. */
export function snippetError(s: Pick<Snippet, "from" | "to">, sceneCount: number): string | null {
  if (sceneCount === 0) return "The story has no scenes.";
  if (s.from < 1 || s.to > sceneCount) return `Scenes ${s.from}–${s.to} don't exist any more (the story has ${sceneCount}).`;
  if (s.to < s.from) return "The last scene comes before the first.";
  return null;
}

/** The rendered file still matches the snippet (same scenes; a new name needs no re-render). */
export function sameSnippet(rendered: Snippet | undefined, current: Snippet): boolean {
  return !!rendered && rendered.id === current.id && rendered.from === current.from && rendered.to === current.to;
}
