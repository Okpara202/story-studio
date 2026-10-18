import { CUES, findCue } from "../delivery.ts";
import type {
  Character,
  DialogueLine,
  LinePart,
  ParseIssue,
  ParsedStory,
  Scene,
} from "./types.ts";

export const NARRATOR_ID = "NARRATOR";
/** Lines longer than this get a warning: long TTS calls and captions get awkward. */
export const LONG_LINE_CHARS = 400;
/** Default and maximum length of a `[pause]`. */
export const DEFAULT_PAUSE_SEC = 1;
export const MAX_PAUSE_SEC = 10;

const TITLE_RE = /^#\s*(.*)$/;
const COMMENT_RE = /^\/\//;
const DIRECTIVE_RE = /^\[\s*([a-z]+)\s*(?::\s*(.*?))?\s*\]$/i;
// [pause], [pause 2s], [pause 1.5 s], [pause 500ms]
const PAUSE_SRC = String.raw`\[\s*pause(?:\s+(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds?)?)?\s*\]`;
const PAUSE_LINE_RE = new RegExp(`^${PAUSE_SRC}$`, "i");
const PAUSE_INLINE_RE = new RegExp(PAUSE_SRC, "gi");
// Up to 3 words before the colon, optional (cues). Kept strict so prose like "It was late: ..." rarely matches.
const SPEAKER_RE = /^([A-Za-z][A-Za-z0-9'.-]*(?: [A-Za-z0-9'.-]+){0,2})\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/;
/** Tags we recognise but cannot act on yet. */
const COMING_SOON: Record<string, string> = {
  music: "Music cues are recognised but not played yet; the channel music from Style settings is used.",
  sfx: "Sound effects are recognised but not played yet.",
};

export function speakerIdOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function pauseSeconds(amount: string | undefined, unit: string | undefined): number {
  if (amount === undefined) return DEFAULT_PAUSE_SEC;
  const n = Number(amount);
  return unit?.toLowerCase() === "ms" ? n / 1000 : n;
}

/** A line as written, before markup is resolved. */
interface RawLine {
  speakerId: string;
  raw: string;
  cues: string[];
  pauseBefore: number;
  sourceLine: number;
}

/** Parse a story script. Pure: never throws, reports problems as issues. */
export function parseScript(source: string): ParsedStory {
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const issues: ParseIssue[] = [];
  const scenes: (Omit<Scene, "lines"> & { raw: RawLine[] })[] = [];
  const names = new Map<string, string>();
  const counts = new Map<string, number>();

  let title: string | null = null;
  let scene: (typeof scenes)[number] | null = null;
  let speaker = NARRATOR_ID;
  // The line still open for continuation (no blank line seen since it started).
  let open: RawLine | null = null;
  // Seconds of [pause] waiting for the next line in this scene.
  let pendingPause = 0;

  const warn = (line: number, message: string) => issues.push({ severity: "warning", line, message });
  const error = (line: number | null, message: string) => issues.push({ severity: "error", line, message });

  const closeScene = () => {
    if (scene && pendingPause) scene.pauseAfter += pendingPause;
    pendingPause = 0;
  };

  const startScene = (description: string | null, line: number) => {
    closeScene();
    scene = { index: scenes.length + 1, description, sourceLine: line, raw: [], pauseAfter: 0 };
    scenes.push(scene);
    return scene;
  };

  const parseCues = (text: string | undefined, line: number): string[] => {
    if (!text?.trim()) return [];
    const out: string[] = [];
    for (const word of text.split(/[,/]/).map((w) => w.trim()).filter(Boolean)) {
      const cue = findCue(word);
      if (cue) {
        if (!out.includes(cue.name)) out.push(cue.name);
      } else {
        warn(line, `Unknown delivery cue "(${word})". Known cues: ${CUES.map((c) => c.name).join(", ")}.`);
      }
    }
    return out;
  };

  const addLine = (speakerName: string, text: string, cues: string[], line: number) => {
    const current = scene ?? (warn(line, "Text before the first [scene: ...]; started a scene automatically."), startScene(null, line));
    const id = speakerIdOf(speakerName);
    if (!names.has(id)) names.set(id, speakerName.trim().replace(/\s+/g, " "));
    open = { speakerId: id, raw: text, cues, pauseBefore: pendingPause, sourceLine: line };
    pendingPause = 0;
    current.raw.push(open);
  };

  rawLines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const text = rawLine.trim();

    if (text === "") {
      open = null;
      return;
    }
    if (COMMENT_RE.test(text)) return;

    const titleMatch = TITLE_RE.exec(text);
    if (titleMatch) {
      open = null;
      if (title === null && scenes.length === 0) {
        title = titleMatch[1].trim();
        if (!title) error(lineNo, "The title line is empty. Write it as: # My Story Title");
      } else {
        warn(lineNo, "Only the first '# Title' line is used; this one was ignored.");
      }
      return;
    }

    const pause = PAUSE_LINE_RE.exec(text);
    if (pause) {
      open = null;
      const sec = pauseSeconds(pause[1], pause[2]);
      if (!scene) warn(lineNo, "A [pause] before the first scene has no effect.");
      else if (sec > MAX_PAUSE_SEC) {
        warn(lineNo, `Pause of ${sec}s is longer than ${MAX_PAUSE_SEC}s; shortened to ${MAX_PAUSE_SEC}s.`);
        pendingPause += MAX_PAUSE_SEC;
      } else pendingPause += sec;
      return;
    }

    const directive = DIRECTIVE_RE.exec(text);
    if (directive) {
      open = null;
      const tag = directive[1].toLowerCase();
      if (tag === "scene") {
        startScene(directive[2]?.trim() || null, lineNo);
      } else if (COMING_SOON[tag]) {
        warn(lineNo, COMING_SOON[tag]);
      } else {
        warn(lineNo, `Unknown tag [${directive[1]}]. Supported: [scene: ...], [pause 2s], [music: ...], [sfx: ...]. Ignored.`);
      }
      return;
    }
    if (text.startsWith("[")) {
      warn(lineNo, "Line starts with '[' but is not a valid tag. Use [scene: description] or [pause 2s]. Read as spoken text.");
    }

    const speakerMatch = SPEAKER_RE.exec(text);
    if (speakerMatch) {
      speaker = speakerMatch[1];
      addLine(speaker, speakerMatch[3].trim(), parseCues(speakerMatch[2], lineNo), lineNo);
      return;
    }

    if (open) {
      // Hard-wrapped text: join onto the line being written.
      const current: RawLine = open;
      current.raw = current.raw ? `${current.raw} ${text}` : text;
      return;
    }
    addLine(speaker, text, [], lineNo);
  });
  closeScene();

  if (title === null) {
    error(1, "Missing title. The first line should be: # My Story Title");
  }

  const finished: Scene[] = scenes.map((s) => {
    const lines: DialogueLine[] = [];
    let carriedPause = 0;
    for (const r of s.raw) {
      const line = resolveLine(r, warn);
      if (!line) {
        warn(r.sourceLine, `${names.get(r.speakerId)} has no text on this line; skipped.`);
        carriedPause += r.pauseBefore;
        continue;
      }
      line.pauseBefore += carriedPause;
      carriedPause = 0;
      lines.push(line);
      counts.set(line.speakerId, (counts.get(line.speakerId) ?? 0) + 1);
      if (line.text.length > LONG_LINE_CHARS) {
        warn(line.sourceLine, `Very long line (${line.text.length} characters). Consider splitting it for better pacing.`);
      }
    }
    if (lines.length === 0) {
      warn(s.sourceLine, `Scene ${s.index} has no lines; it will be shown silently for a few seconds.`);
    }
    return {
      index: s.index,
      description: s.description,
      sourceLine: s.sourceLine,
      lines,
      pauseAfter: s.pauseAfter + carriedPause,
    };
  });

  const characters: Character[] = [...counts.entries()].map(([id, lineCount]) => ({
    id,
    name: names.get(id) ?? id,
    lineCount,
  }));
  for (const c of characters) {
    if (c.id !== NARRATOR_ID && c.lineCount === 1 && c.id.includes(" ")) {
      const line = finished.flatMap((s) => s.lines).find((l) => l.speakerId === c.id);
      warn(
        line?.sourceLine ?? 0,
        `"${c.name}" was read as a speaker because of the colon. If it is narration, rephrase or prefix with NARRATOR:.`,
      );
    }
  }

  if (!finished.some((s) => s.lines.length > 0)) {
    error(null, "The script has no spoken lines. Add lines like: NARRATOR: The letter arrived late.");
  }

  issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return {
    title: title ?? "",
    scenes: finished,
    characters,
    issues,
    ok: !issues.some((i) => i.severity === "error"),
  };
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Turn a written line into spoken parts, caption text and plain text. Null when nothing is said. */
function resolveLine(r: RawLine, warn: (line: number, message: string) => void): DialogueLine | null {
  const parts: LinePart[] = [];
  let caption = "";
  let last = 0;
  for (const m of r.raw.matchAll(PAUSE_INLINE_RE)) {
    const before = r.raw.slice(last, m.index);
    if (tidy(before)) parts.push(tidy(before));
    caption += ` ${before}`;
    parts.push(Math.min(MAX_PAUSE_SEC, pauseSeconds(m[1], m[2])));
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = r.raw.slice(last);
  if (tidy(rest)) parts.push(tidy(rest));
  caption = tidy(`${caption} ${rest}`);

  if (/\[[^\]]*\]/.test(caption)) {
    warn(r.sourceLine, "Only [pause ...] can be used inside a line; other [tags] are read aloud.");
  }
  if ((caption.match(/\*/g)?.length ?? 0) % 2 === 1) {
    warn(r.sourceLine, "An *emphasis* marker is not closed; the asterisk was ignored.");
    caption = caption.replace(/\*(?!.*\*)/, "");
  }

  const spoken = parts.map((p) => (typeof p === "string" ? tidy(p.replace(/\*/g, "")) : p)).filter((p) => p !== "");
  // Drop pauses at the very start or end of a line: the timeline already spaces lines out.
  while (typeof spoken[0] === "number") spoken.shift();
  while (typeof spoken[spoken.length - 1] === "number") spoken.pop();
  const text = tidy(spoken.filter((p): p is string => typeof p === "string").join(" "));
  if (!text) return null;

  return {
    speakerId: r.speakerId,
    text,
    caption: tidy(caption),
    parts: spoken,
    cues: r.cues,
    pauseBefore: r.pauseBefore,
    sourceLine: r.sourceLine,
  };
}
