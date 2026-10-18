import { test } from "node:test";
import assert from "node:assert/strict";
import { lerpExpr, planMotion } from "./motion.ts";
import { assText, assTime } from "./ass.ts";
import { parseSceneRange } from "./render.ts";

const FRAME_16x9 = { w: 1280, h: 720 };
const FRAME_9x16 = { w: 720, h: 1280 };

test("motion keeps the crop window inside the scaled image", () => {
  for (let scene = 1; scene <= 6; scene++) {
    for (const frame of [FRAME_16x9, FRAME_9x16]) {
      const p = planMotion({ w: 1024, h: 768 }, frame, scene);
      for (const pt of [p.from, p.to]) {
        assert.ok(pt.x >= 0 && pt.x + frame.w <= p.scaled.w, `x in bounds (scene ${scene})`);
        assert.ok(pt.y >= 0 && pt.y + frame.h <= p.scaled.h, `y in bounds (scene ${scene})`);
      }
      assert.ok(p.from.x !== p.to.x || p.from.y !== p.to.y, "the image actually moves");
    }
  }
});

test("vertical framing centres on the focus point", () => {
  const centre = planMotion({ w: 1024, h: 768 }, FRAME_9x16, 3);
  const midX = centre.from.x + FRAME_9x16.w / 2;
  assert.ok(Math.abs(midX - centre.scaled.w / 2) < 2);
  const left = planMotion({ w: 1024, h: 768 }, FRAME_9x16, 3, { x: 0.3, y: 0.5 });
  assert.ok(left.from.x < centre.from.x);
});

test("lerpExpr", () => {
  assert.equal(lerpExpr(10, 50, 99), "10+40*n/99");
  assert.equal(lerpExpr(50, 10, 99), "50-40*n/99");
  assert.equal(lerpExpr(7, 7, 99), "7");
});

test("ASS helpers", () => {
  assert.equal(assTime(3725.456), "1:02:05.46");
  assert.equal(assText("a {b} c\\d\ne"), "a (b) c/d\\Ne");
});

test("scene range parsing", () => {
  assert.deepEqual(parseSceneRange("2-4", 6), { from: 2, to: 4 });
  assert.deepEqual(parseSceneRange("3", 6), { from: 3, to: 3 });
  assert.throws(() => parseSceneRange("4-2", 6));
  assert.throws(() => parseSceneRange("1-9", 6));
  assert.throws(() => parseSceneRange("x", 6));
});

test("emphasis becomes ASS italics, word by word, surviving caption splits", async () => {
  const { emphasisPerWord, splitCaption } = await import("../../src/shared/captions.ts");
  assert.equal(emphasisPerWord("It was *all mine*, every word."), "It was *all* *mine,* every word.");
  const events = splitCaption(emphasisPerWord("aaa *bbb ccc ddd* eee"), 0, 4, 8, 1);
  assert.deepEqual(events.map((e) => assText(e.text)), [
    "aaa {\\i1}bbb{\\i0}",
    "{\\i1}ccc{\\i0} {\\i1}ddd{\\i0}",
    "eee",
  ]);
  assert.equal(assText("2 * 3 = 6"), "2 * 3 = 6");
});
