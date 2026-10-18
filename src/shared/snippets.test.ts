import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScript } from "./script/parse.ts";
import { platformPosts } from "./publish.ts";
import {
  MAX_SNIPPETS,
  nextSnippet,
  rangeTime,
  sameSnippet,
  snippetError,
  storyLengths,
  suggestRange,
  type SceneLength,
} from "./snippets.ts";

const lengths = (secs: number[]): SceneLength[] => {
  let start = 0;
  return secs.map((sec, i) => {
    const l = { index: i + 1, start, sec };
    start += sec;
    return l;
  });
};

const SCRIPT = `# Room 9
[scene: a]
NARRATOR: The letter arrived three days late.
[scene: b]
NARRATOR: Nobody had stayed there in years.`;

test("measured scene times are used when they match the script, estimates otherwise", () => {
  const scenes = parseScript(SCRIPT).scenes;
  const measured = [
    { index: 1, start: 0, sec: 4.2 },
    { index: 2, start: 4.2, sec: 3.9 },
  ];
  assert.deepEqual(storyLengths(scenes, measured), { scenes: measured, exact: true });
  const est = storyLengths(scenes, [{ index: 1, start: 0, sec: 4.2 }]);
  assert.equal(est.exact, false);
  assert.equal(est.scenes.length, 2);
  assert.equal(est.scenes[1].start, est.scenes[0].sec);
});

test("a range's start and length", () => {
  assert.deepEqual(rangeTime(lengths([10, 20, 30]), 2, 3), { start: 10, sec: 50 });
  assert.deepEqual(rangeTime(lengths([10]), 4, 5), { start: 0, sec: 0 });
});

test("suggested ranges fill about a minute with whole scenes and stay under 90 s", () => {
  assert.deepEqual(suggestRange(lengths([20, 25, 20, 30])), { from: 1, to: 3 });
  assert.deepEqual(suggestRange(lengths([50, 45, 10])), { from: 1, to: 1 }); // 95 s would be too long
  assert.deepEqual(suggestRange(lengths([120, 10])), { from: 1, to: 1 }); // one long scene is still a snippet
  assert.deepEqual(suggestRange(lengths([20, 25, 20, 30]), 4), { from: 4, to: 4 });
});

test("new snippets start with the hook, then continue after the last one", () => {
  const l = lengths([30, 30, 30, 30, 30]);
  const first = nextSnippet([], l, "aaaaaa");
  assert.deepEqual(first, { id: "aaaaaa", name: "Hook", from: 1, to: 2 });
  const second = nextSnippet([first!], l, "bbbbbb");
  assert.deepEqual(second, { id: "bbbbbb", name: "Teaser 2", from: 3, to: 4 });
  const full = Array.from({ length: MAX_SNIPPETS }, (_, i) => ({ id: String(i), name: "x", from: 1, to: 1 }));
  assert.equal(nextSnippet(full, l), null);
  assert.equal(nextSnippet([], []), null);
});

test("snippet errors and render matching", () => {
  assert.equal(snippetError({ from: 1, to: 3 }, 5), null);
  assert.match(snippetError({ from: 4, to: 6 }, 5)!, /don't exist/);
  assert.match(snippetError({ from: 3, to: 2 }, 5)!, /before/);
  const s = { id: "a", name: "Hook", from: 1, to: 2 };
  assert.equal(sameSnippet(s, { ...s, name: "Renamed" }), true);
  assert.equal(sameSnippet(s, { ...s, to: 3 }), false);
  assert.equal(sameSnippet(undefined, s), false);
});

test("platform captions differ per app and carry the AI label step", () => {
  const posts = platformPosts(parseScript(SCRIPT), { name: "Hook" });
  assert.deepEqual(posts.map((p) => p.platform), ["shorts", "reels", "tiktok"]);
  assert.equal(new Set(posts.map((p) => p.caption)).size, 3);
  for (const p of posts) {
    assert.ok(p.caption.startsWith("The letter arrived"));
    assert.ok(p.checklist.some((c) => c.id === "ai-label"));
  }
  assert.ok(platformPosts(parseScript(SCRIPT))[0].caption.startsWith("Room 9."));
});
