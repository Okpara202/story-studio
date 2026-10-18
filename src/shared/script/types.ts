export type IssueSeverity = "error" | "warning";

export interface ParseIssue {
  severity: IssueSeverity;
  /** 1-based source line, or null when the issue concerns the whole script. */
  line: number | null;
  message: string;
}

export interface DialogueLine {
  /** Canonical speaker id, upper-case with single spaces, e.g. "NARRATOR". */
  speakerId: string;
  text: string;
  /** 1-based source line where this line starts. */
  sourceLine: number;
}

export interface Scene {
  /** 1-based scene number. */
  index: number;
  /** Image prompt from `[scene: ...]`, or null when none was given. */
  description: string | null;
  /** 1-based source line of the `[scene]` marker (or first line if implicit). */
  sourceLine: number;
  lines: DialogueLine[];
}

export interface Character {
  id: string;
  /** Name as first written by the author. */
  name: string;
  lineCount: number;
}

export interface ParsedStory {
  title: string;
  scenes: Scene[];
  characters: Character[];
  issues: ParseIssue[];
  /** True when there are no error-level issues. */
  ok: boolean;
}
