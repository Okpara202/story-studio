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
  const story = parseScript("# T\n[music: rain]\n[scene: a]\nHi.");
  assert.equal(story.scenes.length, 1);
  assert.ok(story.issues.some((i) => i.line === 2 && i.message.includes("Unknown tag")));
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
