import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTimeline, estimateLineSec, formatDuration, type TimingOptions } from "./timing.ts";
import { splitCaption, wrapWords } from "./captions.ts";

const OPTS: TimingOptions = { fps: 30, leadInSec: 0.3, lineGapSec: 0.4, tailSec: 0.8, emptySceneSec: 3 };

test("scene length is lead-in + lines + gaps + tail", () => {
  const t = computeTimeline([[2, 1]], OPTS);
  // 0.3 + 2 + 0.4 + 1 + 0.8 = 4.5 s = 135 frames
  assert.equal(t.scenes[0].frames, 135);
  assert.equal(t.totalSec, 4.5);
  assert.deepEqual(t.scenes[0].lines, [
    { start: 0.3, end: 2.3 },
    { start: 2.7, end: 3.7 },
  ]);
});

test("scenes are rounded up to whole frames and laid back to back", () => {
  const t = computeTimeline([[1.01], [1]], OPTS);
  // scene 1: 0.3 + 1.01 + 0.8 = 2.11 s -> 63.3 frames -> 64
  assert.equal(t.scenes[0].frames, 64);
  assert.equal(t.scenes[1].start, 2.133);
  assert.equal(t.scenes[1].lines[0].start, 2.433);
  assert.equal(t.totalFrames, 64 + 63);
});

test("empty scene uses fixed duration", () => {
  const t = computeTimeline([[], [1]], OPTS);
  assert.equal(t.scenes[0].duration, 3);
  assert.equal(t.scenes[1].start, 3);
});

test("estimates and formatting", () => {
  assert.equal(estimateLineSec("one two three four five six seven"), 2);
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(125.4), "2:05");
});

test("wrapWords keeps lines under the limit", () => {
  assert.deepEqual(wrapWords("the quick brown fox jumps", 10), ["the quick", "brown fox", "jumps"]);
  assert.deepEqual(wrapWords("supercalifragilistic x", 5), ["supercalifragilistic", "x"]);
});

test("splitCaption makes 2-line chunks with proportional, contiguous times", () => {
  const events = splitCaption("aaaa bbbb cccc dddd eeee", 10, 20, 9, 2);
  assert.deepEqual(events.map((e) => e.text), ["aaaa bbbb\ncccc dddd", "eeee"]);
  assert.equal(events[0].start, 10);
  assert.equal(events[0].end, events[1].start);
  assert.equal(events[1].end, 20);
  assert.ok(events[0].end - events[0].start > events[1].end - events[1].start);
});

test("[pause] lines add silence before lines and after the scene", () => {
  const plain = computeTimeline([[1, 1]], OPTS);
  const paused = computeTimeline([[1, 1]], OPTS, [{ before: [0, 2], after: 1.5 }]);
  assert.equal(paused.scenes[0].lines[1].start, plain.scenes[0].lines[1].start + 2);
  assert.equal(paused.totalSec, plain.totalSec + 3.5);
});

test("estimates include inline and line pauses", () => {
  assert.equal(estimateLineSec("one two three four five six seven", ["a", 1.5, "b"]), 3.5);
});
