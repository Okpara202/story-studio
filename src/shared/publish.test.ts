import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScript } from "./script/parse.ts";
import { changesSinceRender, hookOf, suggestPublishText, TAGS_MAX_CHARS } from "./publish.ts";

const SCRIPT = `# The Letter from Room 9
[scene: an envelope]
NARRATOR: The letter arrived three days late.
CLERK (whispering): Nobody has stayed in that room in *years*.
[scene: a desk]
NARRATOR: The handwriting was my own.`;

test("the hook is the opening lines as plain text", () => {
  const hook = hookOf(parseScript(SCRIPT));
  assert.equal(hook, "The letter arrived three days late. Nobody has stayed in that room in years.");
  assert.ok(!hook.includes("*"));
});

test("a very long first line is cut at a word", () => {
  const long = "# T\n[scene: x]\nNARRATOR: " + "word ".repeat(80);
  const hook = hookOf(parseScript(long), 50);
  assert.ok(hook.length <= 51);
  assert.ok(hook.endsWith("…"));
  assert.ok(!hook.includes("wor…"));
});

test("suggested text has the title, the fiction and AI notes, and tidy tags", () => {
  const text = suggestPublishText(parseScript(SCRIPT));
  assert.equal(text.title, "The Letter from Room 9");
  assert.match(text.description, /^The letter arrived/);
  assert.match(text.description, /original work of fiction/);
  assert.match(text.description, /AI tools/);
  assert.equal(text.tags[0], "the letter from room 9");
  assert.equal(new Set(text.tags).size, text.tags.length);
  assert.ok(text.tags.join(",").length <= TAGS_MAX_CHARS);
});

test("an empty script still gets usable text", () => {
  const text = suggestPublishText(parseScript(""));
  assert.equal(text.title, "Untitled story");
  assert.match(text.description, /^"Untitled story" is an original/);
});

test("changes since render: only edits saved after the videos finished", () => {
  const status = { state: "done" as const, finishedAt: "2026-10-18T10:00:00Z" };
  const before = { createdAt: "2026-10-18T09:59:00Z" };
  const after = { createdAt: "2026-10-18T10:05:00Z" };
  assert.deepEqual(changesSinceRender(status, "2026-10-18T09:00:00Z", [1, 2, 3], { 1: before, 2: after }), {
    script: false,
    scenes: [2, 3],
  });
  assert.equal(changesSinceRender(status, "2026-10-18T11:00:00Z", [], {}).script, true);
  assert.deepEqual(changesSinceRender({ state: "running" }, "2026-10-18T11:00:00Z", [1], {}), { script: false, scenes: [] });
  assert.deepEqual(changesSinceRender(null, "2026-10-18T11:00:00Z", [1], {}), { script: false, scenes: [] });
});
