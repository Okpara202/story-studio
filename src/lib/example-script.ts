import { EXAMPLE_SCRIPT_V2 } from "@/shared/script/guide";

export const EXAMPLE_SCRIPT = `${EXAMPLE_SCRIPT_V2}\n`;

/** Short version of the format for the editor; the full reference is the Guide page. */
export const SCRIPT_CHEATSHEET = [
  { code: "# Title", note: "First line: the story title" },
  { code: "[scene: what we see]", note: "Starts a scene; the text becomes its picture" },
  { code: "[character: NAME | looks]", note: "A recurring person; name them in [scene: ...] to keep them looking the same" },
  { code: "[fx: flicker, shake]", note: "Motion for the scene: flicker, shake, pulse, drift, glitch" },
  { code: "NARRATOR: text", note: "A spoken line. Any name before the colon is a character" },
  { code: "NAME (whispering): text", note: "How the line is delivered (see the Guide for all cues)" },
  { code: "[pause 2s]", note: "Silence; also works inside a line" },
  { code: "*word*", note: "Emphasis, shown in italics in the captions" },
  { code: "// note", note: "A note to yourself, never read aloud" },
];
