import { test } from "node:test";
import assert from "node:assert/strict";
import { driftGraph, planEffects } from "./effects.ts";

const frame = { w: 1280, h: 720 };

test("no effects add nothing to the scene's filters", () => {
  assert.deepEqual(planEffects([], frame), { jitterX: "", jitterY: "", after: [], drift: false });
});

test("light effects share one per-frame eq filter", () => {
  const p = planEffects(["flicker", "pulse"], frame);
  assert.equal(p.after.length, 1);
  assert.match(p.after[0], /^eq=brightness='[^']+':gamma='1-0\.38\*[^']+':eval=frame$/);
});

test("shake jitters the pan crop, scaled to the frame", () => {
  const p = planEffects(["shake"], frame);
  assert.match(p.jitterX, /^\+4\*sin/);
  assert.match(planEffects(["shake"], { w: 720, h: 1280 }).jitterY, /^\+4\*sin/);
  assert.deepEqual(p.after, []);
});

test("glitch is switched on only on some frames; drift builds a labelled sub-graph", () => {
  const p = planEffects(["glitch", "drift"], frame);
  assert.equal(p.drift, true);
  assert.ok(p.after.every((f) => f.includes(":enable='")));
  const g = driftGraph("p1", "d1", frame);
  assert.match(g, /^\[p1\]split\[p1a\]\[p1b\];/);
  assert.match(g, /scale=1664:936/);
  assert.match(g, /\[d1\]$/);
});
