import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScript } from "./script/parse.ts";
import { findEffect, suggestEffects } from "./effects.ts";

const story = (body: string) => parseScript(`# T\n${body}`);

test("[fx: ...] sets the scene's effects, with aliases", () => {
  const p = story("[scene: a winch]\n[fx: Flicker, vibrate]\nNARRATOR: It turned.\n[scene: a door]\nNARRATOR: Quiet.");
  assert.deepEqual(p.scenes[0].effects, ["flicker", "shake"]);
  assert.deepEqual(p.scenes[1].effects, []);
  assert.equal(p.issues.length, 0);
});

test("[fx] also works after the scene's lines and can be repeated", () => {
  const p = story("[scene: a lab]\nNARRATOR: The screens died.\n[fx: glitch]\n[fx: glitch, fog]");
  assert.deepEqual(p.scenes[0].effects, ["glitch", "drift"]);
});

test("unknown, empty, too many and misplaced effects are warnings", () => {
  const unknown = story("[scene: a]\n[fx: sparkle]\nNARRATOR: Hi.");
  assert.match(unknown.issues[0].message, /Unknown effect "sparkle"/);
  assert.deepEqual(unknown.scenes[0].effects, []);

  assert.match(story("[scene: a]\n[fx]\nNARRATOR: Hi.").issues[0].message, /needs at least one effect/);

  const many = story("[scene: a]\n[fx: flicker, shake, pulse, drift]\nNARRATOR: Hi.");
  assert.deepEqual(many.scenes[0].effects, ["flicker", "shake", "pulse"]);
  assert.match(many.issues[0].message, /At most 3/);

  assert.match(parseScript("# T\n[fx: shake]\n[scene: a]\nNARRATOR: Hi.").issues[0].message, /goes under a \[scene/);
});

test("effects are suggested from the scene description", () => {
  assert.deepEqual(suggestEffects("a giant steel winch spinning rapidly under harsh fluorescent white lights"), [
    "flicker",
    "shake",
  ]);
  assert.deepEqual(suggestEffects("a dark control room with glowing blue screens and sonar wave patterns"), ["pulse", "glitch"]);
  assert.deepEqual(suggestEffects("an envelope on a desk"), []);
  assert.deepEqual(suggestEffects("fluorescent lights", ["flicker"]), []);
  assert.deepEqual(suggestEffects(null), []);
  assert.equal(findEffect("FOG")?.name, "drift");
});
