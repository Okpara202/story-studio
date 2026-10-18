import type {
  Character,
  DialogueLine,
  ParseIssue,
  ParsedStory,
  Scene,
} from "./types.ts";

export const NARRATOR_ID = "NARRATOR";
/** Lines longer than this get a warning: long TTS calls and captions get awkward. */
export const LONG_LINE_CHARS = 400;

const TITLE_RE = /^#\s*(.*)$/;
const DIRECTIVE_RE = /^\[\s*([a-z]+)\s*(?::\s*(.*?))?\s*\]$/i;
// Up to 3 words before the colon. Kept strict so prose like "It was late: ..." rarely matches.
const SPEAKER_RE = /^([A-Za-z][A-Za-z0-9'.-]*(?: [A-Za-z0-9'.-]+){0,2})\s*:\s*(.*)$/;

export function speakerIdOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Parse a story script. Pure: never throws, reports problems as issues. */
export function parseScript(source: string): ParsedStory {
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const issues: ParseIssue[] = [];
  const scenes: Scene[] = [];
  const names = new Map<string, string>();
  const counts = new Map<string, number>();

  let title: string | null = null;
  let scene: Scene | null = null;
  let speaker = NARRATOR_ID;
  // The line still open for continuation (no blank line seen since it started).
  let open: DialogueLine | null = null;

  const warn = (line: number, message: string) =>
    issues.push({ severity: "warning", line, message });
  const error = (line: number | null, message: string) =>
    issues.push({ severity: "error", line, message });

  const startScene = (description: string | null, line: number): Scene => {
    const next: Scene = {
      index: scenes.length + 1,
      description,
      sourceLine: line,
      lines: [],
    };
    scenes.push(next);
    return next;
  };

  const addLine = (speakerName: string, text: string, line: number) => {
    if (!scene) {
      warn(line, "Text before the first [scene: ...]; started a scene automatically.");
      scene = startScene(null, line);
    }
    const id = speakerIdOf(speakerName);
    if (!names.has(id)) names.set(id, speakerName.trim().replace(/\s+/g, " "));
    open = { speakerId: id, text, sourceLine: line };
    scene.lines.push(open);
  };

  rawLines.forEach((raw, i) => {
    const lineNo = i + 1;
    const text = raw.trim();

    if (text === "") {
      open = null;
      return;
    }

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

    const directive = DIRECTIVE_RE.exec(text);
    if (directive) {
      open = null;
      if (directive[1].toLowerCase() === "scene") {
        const description = directive[2]?.trim() || null;
        scene = startScene(description, lineNo);
      } else {
        warn(lineNo, `Unknown tag [${directive[1]}]; only [scene: ...] is supported. Ignored.`);
      }
      return;
    }
    if (text.startsWith("[")) {
      warn(lineNo, "Line starts with '[' but is not a valid tag. Use [scene: description]. Read as spoken text.");
    }

    const speakerMatch = SPEAKER_RE.exec(text);
    if (speakerMatch) {
      speaker = speakerMatch[1];
      addLine(speaker, speakerMatch[2].trim(), lineNo);
      return;
    }

    if (open) {
      // Hard-wrapped text: join onto the line being written.
      const current: DialogueLine = open;
      current.text = current.text ? `${current.text} ${text}` : text;
      return;
    }
    addLine(speaker, text, lineNo);
  });

  if (title === null) {
    error(1, "Missing title. The first line should be: # My Story Title");
  }

  for (const s of scenes) {
    const kept = s.lines.filter((l) => {
      if (l.text) return true;
      warn(l.sourceLine, `${names.get(l.speakerId)} has no text on this line; skipped.`);
      return false;
    });
    s.lines = kept;
    for (const l of kept) {
      counts.set(l.speakerId, (counts.get(l.speakerId) ?? 0) + 1);
      if (l.text.length > LONG_LINE_CHARS) {
        warn(l.sourceLine, `Very long line (${l.text.length} characters). Consider splitting it for better pacing.`);
      }
    }
    if (kept.length === 0) {
      warn(s.sourceLine, `Scene ${s.index} has no lines; it will be shown silently for a few seconds.`);
    }
  }

  const characters: Character[] = [...counts.entries()].map(([id, lineCount]) => ({
    id,
    name: names.get(id) ?? id,
    lineCount,
  }));
  for (const c of characters) {
    if (c.id !== NARRATOR_ID && c.lineCount === 1 && c.id.includes(" ")) {
      const line = scenes.flatMap((s) => s.lines).find((l) => l.speakerId === c.id);
      warn(
        line?.sourceLine ?? 0,
        `"${c.name}" was read as a speaker because of the colon. If it is narration, rephrase or prefix with NARRATOR:.`,
      );
    }
  }

  if (!scenes.some((s) => s.lines.length > 0)) {
    error(null, "The script has no spoken lines. Add lines like: NARRATOR: The letter arrived late.");
  }

  issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return {
    title: title ?? "",
    scenes,
    characters,
    issues,
    ok: !issues.some((i) => i.severity === "error"),
  };
}
