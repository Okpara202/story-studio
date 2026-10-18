export type IssueSeverity = "error" | "warning";

export interface ParseIssue {
  severity: IssueSeverity;
  /** 1-based source line, or null when the issue concerns the whole script. */
  line: number | null;
  message: string;
}

/** A piece of a spoken line: words to say, or seconds of silence (from an inline `[pause]`). */
export type LinePart = string | number;

export interface DialogueLine {
  /** Canonical speaker id, upper-case with single spaces, e.g. "NARRATOR". */
  speakerId: string;
  /** Plain spoken text: no markup, no inline pauses. */
  text: string;
  /** Text for captions: `*emphasis*` markers kept, inline pauses removed. */
  caption: string;
  /** What the voice says, in order; numbers are pauses in seconds. Usually just [text]. */
  parts: LinePart[];
  /** Delivery cues from `NAME (whispering, slow):`, canonical names. */
  cues: string[];
  /** Seconds of `[pause]` lines just before this line. */
  pauseBefore: number;
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
  /** Seconds of `[pause]` lines after the last line of the scene. */
  pauseAfter: number;
  /** Motion effects from `[fx: ...]`, canonical names. */
  effects: string[];
  /** Ids of described characters named in this scene's description (at most 3, in order of appearance). */
  characters: string[];
}

/** A recurring on-screen person, from `[character: NAME | what they look like]`. */
export interface CharacterLook {
  /** Same form as speaker ids, e.g. "DR HALE". */
  id: string;
  name: string;
  look: string;
  sourceLine: number;
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
  /** Described on-screen characters, kept looking the same across scenes. */
  looks: CharacterLook[];
  issues: ParseIssue[];
  /** True when there are no error-level issues. */
  ok: boolean;
}
