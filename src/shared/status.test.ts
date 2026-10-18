import { test } from "node:test";
import assert from "node:assert/strict";
import { overallPercent } from "./status.ts";

test("overall percent weights the stages and only reaches 100 when done", () => {
  assert.equal(overallPercent({ state: "queued", stage: null, progress: 0 }), 0);
  assert.equal(overallPercent({ state: "running", stage: "voices", progress: 0.5 }), 17);
  assert.equal(overallPercent({ state: "running", stage: "images", progress: 0 }), 35);
  assert.equal(overallPercent({ state: "running", stage: "render", progress: 0.5 }), 77);
  assert.equal(overallPercent({ state: "running", stage: "render", progress: 1 }), 99);
  assert.equal(overallPercent({ state: "done", stage: "render", progress: 1 }), 100);
  assert.equal(overallPercent({ state: "running", stage: "voices", progress: 7 }), 35);
});
