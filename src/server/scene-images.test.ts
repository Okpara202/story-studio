import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "./storage/local.ts";
import { ensureSceneImages, generateSceneImage, listSceneImages, recordUpload, type JobFiles } from "./scene-images.ts";
import { CloudflareImageProvider } from "./images/cloudflare.ts";
import { imageProviders } from "./images/index.ts";
import { ConfigError, QuotaError, type ImageProvider } from "./images/types.ts";
import { buildImagePrompt, sceneSeed } from "../shared/images.ts";
import { parseScript } from "../shared/script/parse.ts";
import type { JobFile } from "../shared/job.ts";

class FakeImages implements ImageProvider {
  readonly name: string;
  readonly typicalSeconds = 1;
  prompts: string[] = [];
  private readonly fail: (n: number) => Error | null;
  constructor(name: string, fail: (n: number) => Error | null = () => null) {
    this.name = name;
    this.fail = fail;
  }
  async generate(prompt: string, opts: { seed: number }) {
    const err = this.fail(this.prompts.length);
    this.prompts.push(prompt);
    if (err) throw err;
    return { data: Buffer.from(`img:${opts.seed}`), ext: "jpg" };
  }
}

const job = (script: string): JobFile => ({
  version: 1,
  jobId: "20261018-abcdef",
  title: "",
  createdAt: "",
  updatedAt: "",
  script,
  voices: {},
  style: {
    artStyle: "ink-wash",
    narratorVoice: "x",
    music: { file: null, volumeDb: -20 },
    captions: { enabled: true, font: "x" },
  },
});
const SCRIPT = "# T\n[scene: a corridor]\nHi.\n[scene: a key]\nBye.\n[scene]\nThe lamp flickered twice.";

async function withFiles(fn: (j: JobFiles, dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "svs-img-"));
  try {
    await fn({ store: new LocalStore(dir), prefix: "jobs/x/" }, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("prompt = style first, then description + composition; falls back to the scene's words", () => {
  const [a, , c] = parseScript(SCRIPT).scenes;
  assert.match(buildImagePrompt(a, "ink-wash, "), /^ink-wash\. Scene: a corridor, centred composition/);
  assert.match(buildImagePrompt(c, ""), /^a moody scene illustrating: The lamp flickered twice/);
  assert.ok(buildImagePrompt({ description: "x".repeat(5000), lines: [] }, "s").length <= 1500);
});

test("seeds are stable per scene and change with the variant", () => {
  assert.equal(sceneSeed("j", 1, 1), sceneSeed("j", 1, 1));
  assert.notEqual(sceneSeed("j", 1, 1), sceneSeed("j", 1, 2));
  assert.notEqual(sceneSeed("j", 1, 1), sceneSeed("j", 2, 1));
});

test("generates every scene once, then only scenes whose prompt changed", () =>
  withFiles(async (j, dir) => {
    const p = new FakeImages("fake");
    let r = await ensureSceneImages(j, job(SCRIPT), [p]);
    assert.deepEqual(r.map((x) => x.result), ["generated", "generated", "generated"]);
    r = await ensureSceneImages(j, job(SCRIPT), [p]);
    assert.deepEqual(r.map((x) => x.result), ["kept", "kept", "kept"]);
    r = await ensureSceneImages(j, job(SCRIPT.replace("a key", "a brass key")), [p]);
    assert.deepEqual(r.map((x) => x.result), ["kept", "generated", "kept"]);
    assert.equal(p.prompts.length, 4);
    const files = (await readdir(path.join(dir, "jobs", "x", "images"))).sort();
    assert.deepEqual(files, ["scene-01.jpg", "scene-01.json", "scene-02.jpg", "scene-02.json", "scene-03.jpg", "scene-03.json"]);
  }));

test("uploads are never replaced, even when the description changed", () =>
  withFiles(async (j) => {
    const scene = parseScript(SCRIPT).scenes[0];
    await j.store.putBuffer("jobs/x/images/scene-01.png", Buffer.from("mine"), "image/png");
    await recordUpload(j, scene, "png");
    const p = new FakeImages("fake");
    const r = await ensureSceneImages(j, job(SCRIPT.replace("a corridor", "a hallway")), [p]);
    assert.equal(r[0].result, "kept-upload");
    assert.equal(await j.store.getText("jobs/x/images/scene-01.png"), "mine");
  }));

test("a new image in another format replaces the old file", () =>
  withFiles(async (j, dir) => {
    const scene = parseScript(SCRIPT).scenes[0];
    await j.store.putBuffer("jobs/x/images/scene-01.png", Buffer.from("mine"), "image/png");
    await recordUpload(j, scene, "png");
    const entry = await generateSceneImage(j, {
      jobId: "j",
      scene,
      artStyle: "",
      providers: [new FakeImages("fake")],
      newVariant: true,
    });
    assert.equal(entry.variant, 2);
    assert.deepEqual((await readdir(path.join(dir, "jobs", "x", "images"))).sort(), ["scene-01.jpg", "scene-01.json"]);
    assert.equal((await listSceneImages(j)).get(1)?.source, "generated");
  }));

test("quota on the first provider moves the rest of the story to the next one", () =>
  withFiles(async (j) => {
    const first = new FakeImages("cloudflare", (n) => (n >= 1 ? new QuotaError("used up") : null));
    const second = new FakeImages("horde");
    const r = await ensureSceneImages(j, job(SCRIPT), [first, second]);
    assert.deepEqual(r.map((x) => x.result), ["generated", "generated", "generated"]);
    assert.equal(first.prompts.length, 2, "not asked again after its quota ran out");
    assert.equal(second.prompts.length, 2);
    const images = await listSceneImages(j);
    assert.deepEqual([1, 2, 3].map((n) => images.get(n)?.provider), ["cloudflare", "horde", "horde"]);
  }));

test("a failing scene is reported without stopping the others", () =>
  withFiles(async (j) => {
    const flaky = new FakeImages("fake", (n) => (n === 1 ? new Error("flagged prompt") : null));
    const r = await ensureSceneImages(j, job(SCRIPT), [flaky]);
    assert.deepEqual(r.map((x) => x.result), ["generated", "failed", "generated"]);
    assert.match(r[1].error ?? "", /flagged prompt/);
  }));

test("no providers configured gives a clear message", () =>
  withFiles(async (j) => {
    const r = await ensureSceneImages(j, job(SCRIPT), []);
    assert.match(r[0].error ?? "", /No image generator is set up/);
  }));

test("provider selection from environment", () => {
  assert.deepEqual(imageProviders({}).map((p) => p.name), []);
  assert.deepEqual(imageProviders({ CLOUDFLARE_API_TOKEN: "t", R2_ACCOUNT_ID: "a" }).map((p) => p.name), ["cloudflare-flux2", "cloudflare-flux1"]);
  assert.deepEqual(
    imageProviders({ CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a", AI_HORDE_API_KEY: "k" }).map((p) => p.name),
    ["cloudflare-flux2", "cloudflare-flux1", "horde"],
  );
});

test("Cloudflare responses map to image, config error, quota error and retry", async () => {
  const realFetch = globalThis.fetch;
  const replies: (() => Response)[] = [];
  globalThis.fetch = (async () => replies.shift()!()) as typeof fetch;
  const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });
  const cf = new CloudflareImageProvider({ accountId: "a", apiToken: "t", retryDelayMs: 1, model: "flux1" });
  try {
    replies.push(json(200, { success: true, result: { image: Buffer.from("jpeg!").toString("base64") } }));
    assert.equal((await cf.generate("p", { seed: 1 })).data.toString(), "jpeg!");

    replies.push(json(401, { success: false, errors: [{ code: 10000, message: "Authentication error" }] }));
    await assert.rejects(cf.generate("p", { seed: 1 }), ConfigError);

    replies.push(json(429, { success: false, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] }));
    await assert.rejects(cf.generate("p", { seed: 1 }), QuotaError);

    replies.push(json(429, { errors: [{ message: "Too many requests" }] }));
    replies.push(json(200, { result: { image: Buffer.from("ok").toString("base64") } }));
    assert.equal((await cf.generate("p", { seed: 1 })).data.toString(), "ok");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("pruning removes images of deleted scenes and strays from interrupted uploads", () =>
  withFiles(async (j, dir) => {
    await ensureSceneImages(j, job(SCRIPT), [new FakeImages("fake")]);
    // Stray: an upload reached storage but was never confirmed (record still says .jpg).
    await j.store.putBuffer("jobs/x/images/scene-02.png", Buffer.from("stray"), "image/png");
    // Script shrinks to two scenes: scene 3's image is now unused.
    const r = await ensureSceneImages(j, job("# T\n[scene: a corridor]\nHi.\n[scene: a key]\nBye."), [new FakeImages("fake")]);
    assert.deepEqual(r.map((x) => x.result), ["kept", "kept"]);
    assert.deepEqual((await readdir(path.join(dir, "jobs", "x", "images"))).sort(), [
      "scene-01.jpg",
      "scene-01.json",
      "scene-02.jpg",
      "scene-02.json",
    ]);
  }));
