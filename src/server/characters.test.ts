import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { parseScript } from "../shared/script/parse.ts";
import { buildImagePrompt, characterSlug, portraitPrompt, portraitState } from "../shared/images.ts";
import { LocalStore } from "./storage/local.ts";
import { generatePortrait, prunePortraits, readPortrait, recordPortraitUpload, sceneReferences } from "./characters.ts";
import { generateSceneImage } from "./scene-images.ts";
import type { ImageOptions, ImageProvider } from "./images/types.ts";

const SCRIPT = `# T
[character: Dr. Hale | a woman in her 50s, short grey hair, navy diving jacket]
[character: CLARA | a girl of ten, yellow raincoat]
[scene: DR HALE at the control desk]
NARRATOR: She waited.
[scene: Clara and dr hale by the hatch]
NARRATOR: Together.
[scene: an empty corridor]
NARRATOR: Nobody.`;

test("[character] lines describe people; scenes that name them pick them up, in order", () => {
  const p = parseScript(SCRIPT);
  assert.deepEqual(p.looks.map((l) => [l.id, l.look]), [
    ["DR. HALE", "a woman in her 50s, short grey hair, navy diving jacket"],
    ["CLARA", "a girl of ten, yellow raincoat"],
  ]);
  assert.deepEqual(p.scenes.map((s) => s.characters), [["DR. HALE"], ["CLARA", "DR. HALE"], []]);
  assert.equal(p.issues.length, 0);
});

test("malformed, duplicate and unused character lines are warnings", () => {
  const p = parseScript("# T\n[character: CLARA]\n[character: BOB | tall]\n[character: BOB | short]\n[scene: BOB]\nNARRATOR: Hi.");
  assert.match(p.issues[0].message, /Write characters as/);
  assert.match(p.issues[1].message, /described twice/);
  assert.deepEqual(p.looks.map((l) => l.look), ["short"]);
  const unused = parseScript("# T\n[character: ANNA | tall]\n[scene: a room]\nNARRATOR: Hi.");
  assert.match(unused.issues[0].message, /never used/);
  // "ANNA" must not match inside "Annapolis".
  assert.deepEqual(parseScript("# T\n[character: ANNA | tall]\n[scene: Annapolis harbour]\nNARRATOR: Hi.").scenes[0].characters, []);
});

test("scene prompts carry each character's look and point to their reference image", () => {
  const p = parseScript(SCRIPT);
  const prompt = buildImagePrompt(p.scenes[1], "ink", p.looks);
  assert.match(prompt, /CLARA is a girl of ten, yellow raincoat, the same person as in image 0/);
  assert.match(prompt, /Dr\. Hale is a woman in her 50s.*the same person as in image 1/);
  assert.doesNotMatch(buildImagePrompt(p.scenes[2], "ink", p.looks), /image 0/);
  assert.equal(characterSlug("DR. HALE"), "dr-hale");
  assert.match(portraitPrompt(p.looks[0], "ink"), /^ink\. character reference portrait of a woman/);
});

/** Records every call; returns a small real JPEG. */
class FakeImages implements ImageProvider {
  readonly name = "fake";
  readonly typicalSeconds = 1;
  calls: { prompt: string; opts: ImageOptions }[] = [];
  async generate(prompt: string, opts: ImageOptions) {
    this.calls.push({ prompt, opts });
    const size = opts.size ?? { width: 64, height: 48 };
    const data = await sharp({ create: { width: size.width, height: size.height, channels: 3, background: "#345" } }).jpeg().toBuffer();
    return { data, ext: "jpg" };
  }
}

async function withStore(fn: (j: { store: LocalStore; prefix: string }) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "svs-chars-"));
  try {
    await fn({ store: new LocalStore(dir), prefix: "jobs/t/" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a scene with characters draws missing portraits first and sends them as references", () =>
  withStore(async (j) => {
    const p = parseScript(SCRIPT);
    const images = new FakeImages();
    const portraits: string[] = [];
    await generateSceneImage(j, {
      jobId: "t",
      scene: p.scenes[1],
      artStyle: "ink",
      providers: [images],
      looks: p.looks,
      onPortrait: (e) => portraits.push(e.file),
    });
    assert.deepEqual(portraits, ["clara.jpg", "dr-hale.jpg"]);
    assert.equal(images.calls.length, 3);
    assert.deepEqual(images.calls[0].opts.size, { width: 512, height: 512 });
    const sceneCall = images.calls[2];
    assert.equal(sceneCall.opts.references?.length, 2);
    for (const ref of sceneCall.opts.references ?? []) {
      const meta = await sharp(ref).metadata();
      assert.ok(meta.width! < 512 && meta.height! < 512, "references are under 512x512");
      assert.equal(meta.format, "jpeg");
    }
    // Second scene with DR HALE reuses the portrait.
    await generateSceneImage(j, { jobId: "t", scene: p.scenes[0], artStyle: "ink", providers: [images], looks: p.looks });
    assert.equal(images.calls.length, 4);
  }));

test("uploaded portraits are used as they are; a changed look makes them outdated", () =>
  withStore(async (j) => {
    const p = parseScript(SCRIPT);
    const big = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#900" } }).png().toBuffer();
    await j.store.putBuffer(`${j.prefix}characters/clara.png`, big);
    const entry = await recordPortraitUpload(j, p.looks[1], "png");
    assert.equal(portraitState(entry, p.looks[1], "ink"), "ok");
    assert.equal(portraitState(entry, { look: "older now" }, "ink"), "outdated");
    const images = new FakeImages();
    const refs = await sceneReferences(j, { jobId: "t", looks: [p.looks[1]], artStyle: "ink", providers: [images] });
    assert.equal(images.calls.length, 0, "an upload is never redrawn");
    assert.equal((await sharp(refs[0]).metadata()).width, 496);
  }));

test("portraits of characters no longer in the script are pruned", () =>
  withStore(async (j) => {
    const p = parseScript(SCRIPT);
    const images = new FakeImages();
    for (const look of p.looks) await generatePortrait(j, { jobId: "t", look, artStyle: "ink", providers: [images] });
    const deleted = await prunePortraits(j, [p.looks[1]]);
    assert.deepEqual(deleted.sort(), ["jobs/t/characters/dr-hale.jpg", "jobs/t/characters/dr-hale.json"]);
    assert.equal(await readPortrait(j, "DR. HALE"), null);
    assert.ok(await readPortrait(j, "CLARA"));
  }));
