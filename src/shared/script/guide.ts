import { CUES } from "../delivery.ts";
import { EFFECTS } from "../effects.ts";

/**
 * The script format, in one place: the guide page, the editor cheat sheet and
 * the copy-paste prompt for AI writers all read from here, so they always
 * match what the parser accepts.
 */
export interface FormatRule {
  syntax: string;
  meaning: string;
  example: string;
}

export const FORMAT_RULES: FormatRule[] = [
  { syntax: "# Title", meaning: "The story title. The very first line.", example: "# The Letter from Room 9" },
  {
    syntax: "[scene: what the viewer sees]",
    meaning: "Starts a new scene. The description becomes that scene's picture.",
    example: "[scene: a dim hotel corridor at night, one door slightly open]",
  },
  {
    syntax: "[fx: flicker, shake]",
    meaning: "Motion for the scene's picture, on the line under [scene: ...]. Up to 3 effects. They move the whole picture (light, camera, haze), not single objects.",
    example: "[fx: flicker, shake]",
  },
  { syntax: "NAME: words", meaning: "A spoken line. NARRATOR tells the story; any other name is a character.", example: "CLERK: Nobody has stayed in that room in years." },
  {
    syntax: "NAME (cue): words",
    meaning: "How the line is delivered. Several cues can be combined with commas.",
    example: "CLERK (whispering, scared): Don't go up there.",
  },
  { syntax: "[pause 2s]", meaning: "Silence on its own line, between lines or at the end of a scene. [pause] alone is 1 second; 500ms works too.", example: "[pause 2s]" },
  { syntax: "words [pause 1s] words", meaning: "A pause in the middle of a line.", example: "NARRATOR: I knocked [pause 1s] and the knocking answered." },
  { syntax: "*word*", meaning: "Emphasis. Shown in italics in the captions.", example: "NARRATOR: The handwriting was *mine*." },
  { syntax: "// note", meaning: "A note to yourself. Never read aloud.", example: "// TODO: make the ending colder" },
  { syntax: "(blank line)", meaning: "Text without a name continues the previous speaker. A blank line starts a new spoken line.", example: "" },
];

export const COMING_SOON_RULES: FormatRule[] = [
  { syntax: "[music: name]", meaning: "Change the background music from this point. Use [music: off] to stop it.", example: "[music: rain-ambience]" },
  { syntax: "[sfx: name]", meaning: "Play a sound effect at this point.", example: "[sfx: door-creak]" },
];

export const EXAMPLE_SCRIPT_V2 = `# The Letter from Room 9
// Found-document horror, told by the narrator

[scene: a dim hotel corridor at night, one door slightly open, warm light spilling onto the carpet]
NARRATOR: The letter arrived three days late, addressed to a room that did not exist.
CLERK (cold): There is no Room Nine here, sir.

[scene: an old envelope on a wooden desk under a lamp, black wax seal]
NARRATOR (slow): The handwriting on the front was *mine*.
[pause 2s]
NARRATOR: I opened it [pause 1s] and read the first line.

[scene: a brass key with a paper tag lying on a dark carpet under a failing fluorescent light]
[fx: flicker]
CLERK (whispering, scared): Please. Don't go up there.
NARRATOR: That night, a key was waiting outside my door.`;

/** Copy-paste instructions that make any AI (or person) write scripts this app reads perfectly. */
export function aiPrompt(): string {
  const cues = CUES.map((c) => `${c.name} (${c.description.toLowerCase()})`).join(", ");
  const effects = EFFECTS.map((e) => `${e.name} (${e.description.toLowerCase()})`).join(", ");
  return `Write a script for a narrated, illustrated story video. Use EXACTLY this plain-text format so it can be produced automatically.

FORMAT
- Line 1: # Title
- [scene: ...] starts a new scene. Describe ONE clear, concrete image for that moment: setting, key object, lighting, mood. Keep the main subject in the centre of the frame. Prefer objects, rooms, documents, silhouettes and atmosphere over detailed faces. Do not include art-style words; the style is added automatically.
- Optional motion, on the line right under a [scene: ...]: [fx: effect, effect]. Use only these effects: ${effects}. Add motion only where the scene really calls for it (about one scene in three), at most two effects.
- NAME: text is a spoken line. Use NARRATOR for narration. Other characters use a short name in capitals, the same spelling every time (e.g. CLERK, MOTHER, DR HALE).
- Delivery cue, optional, in brackets after the name: NAME (cue): text. Use only these cues: ${cues}. Combine at most two with a comma. Most lines need no cue.
- [pause 2s] on its own line adds silence (use for dramatic beats, 1 to 3 seconds). [pause] alone is 1 second.
- A short pause inside a line: words [pause 1s] words.
- *word* marks emphasis (shown in italics in the captions). Use sparingly.
- // starts a note that is never read aloud.
- Do not use any other brackets, stage directions, sound descriptions or markdown.

STYLE
- New scene roughly every 2 to 4 spoken lines, so the picture changes regularly.
- Short, clear sentences that sound natural read aloud. One idea per line.
- Keep lines under about 40 words.

EXAMPLE
${EXAMPLE_SCRIPT_V2}

Now write the script about: [YOUR IDEA HERE]`;
}
