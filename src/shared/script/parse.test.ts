import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScript } from "./parse.ts";

const SAMPLE = `# The Letter from Room 9
[scene: dim hotel corridor at night, one door slightly open, noir, ink-wash style]
NARRATOR: The letter arrived three days late.
CLERK: Nobody has stayed in that room in years.
[scene: close-up of an old envelope on a wooden desk, warm lamp light]
NARRATOR: The handwriting was my own.
`;

test("parses the sample script", () => {
  const story = parseScript(SAMPLE);
  assert.equal(story.ok, true);
  assert.deepEqual(story.issues, []);
  assert.equal(story.title, "The Letter from Room 9");
  assert.equal(story.scenes.length, 2);
  assert.equal(story.scenes[0].description, "dim hotel corridor at night, one door slightly open, noir, ink-wash style");
  assert.deepEqual(
    story.scenes[0].lines.map((l) => [l.speakerId, l.text, l.sourceLine]),
    [
      ["NARRATOR", "The letter arrived three days late.", 3],
      ["CLERK", "Nobody has stayed in that room in years.", 4],
    ],
  );
  assert.deepEqual(
    story.characters.map((c) => [c.id, c.lineCount]),
    [["NARRATOR", 2], ["CLERK", 1]],
  );
});

test("speaker names are case-insensitive and keep first spelling", () => {
  const story = parseScript("# T\n[scene: x]\nOld Man: Hi.\nOLD MAN: Again.\nold man: Third.");
  assert.equal(story.characters.length, 1);
  assert.deepEqual(story.characters[0], { id: "OLD MAN", name: "Old Man", lineCount: 3 });
});

test("unattributed text defaults to the narrator", () => {
  const story = parseScript("# T\n[scene: x]\nThe rain did not stop.");
  assert.equal(story.scenes[0].lines[0].speakerId, "NARRATOR");
});

test("wrapped text joins the open line; after a blank line it is a new line by the same speaker", () => {
  const story = parseScript("# T\n[scene: x]\nCLERK: Nobody has\nstayed there.\n\nNot for years.");
  assert.deepEqual(
    story.scenes[0].lines.map((l) => [l.speakerId, l.text]),
    [
      ["CLERK", "Nobody has stayed there."],
      ["CLERK", "Not for years."],
    ],
  );
});

test("speaker with text on the following line", () => {
  const story = parseScript("# T\n[scene: x]\nCLERK:\nRoom nine is closed.");
  assert.deepEqual(story.scenes[0].lines.map((l) => l.text), ["Room nine is closed."]);
  assert.equal(story.ok, true);
});

test("[scene] without description gives null description", () => {
  const story = parseScript("# T\n[scene]\nHello.\n[Scene:   ]\nBye.");
  assert.equal(story.scenes.length, 2);
  assert.equal(story.scenes[0].description, null);
  assert.equal(story.scenes[1].description, null);
});

test("missing title is an error with line number", () => {
  const story = parseScript("[scene: x]\nHello.");
  assert.equal(story.ok, false);
  assert.deepEqual(story.issues.filter((i) => i.severity === "error").map((i) => i.line), [1]);
});

test("text before first scene starts a scene with a warning", () => {
  const story = parseScript("# T\nNARRATOR: Before.\n[scene: x]\nAfter.");
  assert.equal(story.scenes.length, 2);
  assert.equal(story.scenes[0].description, null);
  assert.ok(story.issues.some((i) => i.severity === "warning" && i.line === 2));
  assert.equal(story.ok, true);
});

test("empty scene and long line produce warnings", () => {
  const long = "word ".repeat(100).trim();
  const story = parseScript(`# T\n[scene: a]\n[scene: b]\nNARRATOR: ${long}`);
  const warnings = story.issues.filter((i) => i.severity === "warning");
  assert.deepEqual(warnings.map((w) => w.line), [2, 4]);
  assert.equal(story.ok, true);
});

test("script without lines is an error", () => {
  const story = parseScript("# T\n[scene: a]");
  assert.equal(story.ok, false);
});

test("unknown tags warn and are ignored", () => {
  const story = parseScript("# T\n[lighting: dim]\n[scene: a]\nHi.");
  assert.equal(story.scenes.length, 1);
  assert.ok(story.issues.some((i) => i.line === 2 && i.message.includes("Unknown tag")));
});

test("music and sfx tags are recognised with a 'not yet' note", () => {
  const story = parseScript("# T\n[scene: a]\n[music: rain]\nHi.\n[sfx: door-creak]");
  assert.equal(story.ok, true);
  assert.ok(story.issues.some((i) => i.line === 3 && i.message.startsWith("Music cues")));
  assert.ok(story.issues.some((i) => i.line === 5 && i.message.startsWith("Sound effects")));
});

test("comments are ignored and do not break a wrapped line", () => {
  const story = parseScript("# T\n// planning note\n[scene: a]\nNARRATOR: The letter\n// TODO tighten\narrived late.");
  assert.deepEqual(story.scenes[0].lines.map((l) => l.text), ["The letter arrived late."]);
  assert.deepEqual(story.issues, []);
});

test("delivery cues after the name, with aliases and several cues", () => {
  const story = parseScript("# T\n[scene: a]\nCLERK (whisper): Leave now.\nCLERK (Terrified, slow): Please.\nCLERK: Normal.");
  const [a, b, c] = story.scenes[0].lines;
  assert.deepEqual([a.speakerId, a.cues, a.text], ["CLERK", ["whispering"], "Leave now."]);
  assert.deepEqual(b.cues, ["scared", "slow"]);
  assert.deepEqual(c.cues, []);
  assert.equal(story.characters.length, 1);
});

test("unknown cues warn and are dropped", () => {
  const story = parseScript("# T\n[scene: a]\nCLERK (giggling): Hi.");
  assert.deepEqual(story.scenes[0].lines[0].cues, []);
  assert.ok(story.issues.some((i) => i.line === 3 && i.message.includes('"(giggling)"')));
});

test("[pause] lines add silence before the next line, or after the scene", () => {
  const story = parseScript("# T\n[scene: a]\nOne.\n[pause 2s]\n[pause]\nTwo.\n[pause 500ms]\n[scene: b]\n[pause 1.5s]\nThree.\n[pause 30s]");
  const [a, b] = story.scenes;
  assert.deepEqual(a.lines.map((l) => l.pauseBefore), [0, 3]);
  assert.equal(a.pauseAfter, 0.5);
  assert.equal(b.lines[0].pauseBefore, 1.5);
  assert.equal(b.pauseAfter, 10, "capped at 10 s");
  assert.ok(story.issues.some((i) => i.line === 11 && i.message.includes("longer than")));
});

test("inline pauses split what the voice says but not the captions", () => {
  const story = parseScript("# T\n[scene: a]\nNARRATOR: I waited [pause 2s] and waited. [pause]");
  const line = story.scenes[0].lines[0];
  assert.deepEqual(line.parts, ["I waited", 2, "and waited."]);
  assert.equal(line.text, "I waited and waited.");
  assert.equal(line.caption, "I waited and waited.");
});

test("*emphasis* is kept for captions and removed for the voice", () => {
  const story = parseScript("# T\n[scene: a]\nNARRATOR: The handwriting was *mine*. *Every word.*");
  const line = story.scenes[0].lines[0];
  assert.equal(line.text, "The handwriting was mine. Every word.");
  assert.equal(line.caption, "The handwriting was *mine*. *Every word.*");
  const bad = parseScript("# T\n[scene: a]\nIt was *mine.");
  assert.equal(bad.scenes[0].lines[0].caption, "It was mine.");
  assert.ok(bad.issues.some((i) => i.message.includes("not closed")));
});

test("multi-word one-off speaker gets a 'was that narration?' warning", () => {
  const story = parseScript("# T\n[scene: a]\nIt said: run.\nNARRATOR: Then silence.");
  assert.ok(story.issues.some((i) => i.line === 3 && i.message.includes("colon")));
});

test("handles CRLF line endings and second title", () => {
  const story = parseScript("# T\r\n[scene: a]\r\nHi.\r\n# Again\r\n");
  assert.equal(story.title, "T");
  assert.equal(story.scenes[0].lines[0].text, "Hi.");
  assert.ok(story.issues.some((i) => i.line === 4));
});

test("the guide's example script and AI prompt example parse cleanly", async () => {
  const { EXAMPLE_SCRIPT_V2, aiPrompt } = await import("./guide.ts");
  const story = parseScript(EXAMPLE_SCRIPT_V2);
  assert.equal(story.ok, true);
  assert.deepEqual(story.issues, []);
  assert.equal(story.scenes.length, 3);
  assert.deepEqual(story.scenes[2].lines[0].cues, ["whispering", "scared"]);
  assert.ok(aiPrompt().includes(EXAMPLE_SCRIPT_V2));
});
