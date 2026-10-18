import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "./storage/local.ts";
import { createStore } from "./storage/index.ts";
import {
  createStory,
  freeStorySpace,
  deleteStory,
  getStory,
  getStyle,
  keys,
  listStories,
  markDownloaded,
  musicKey,
  newJobId,
  saveStyle,
  storyMedia,
  updateStory,
} from "./jobs.ts";
import { DEFAULT_STYLE } from "../shared/job.ts";
import { storageByStory } from "./usage/storage-breakdown.ts";

async function withStore(fn: (store: LocalStore) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "svs-test-"));
  try {
    await fn(new LocalStore(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("job ids are sortable and url-safe", () => {
  const id = newJobId(new Date("2026-10-18T12:00:00Z"));
  assert.match(id, /^20261018-[a-z0-9]{6}$/);
});

test("story lifecycle: create, update, list, status, delete", () =>
  withStore(async (store) => {
    const a = await createStory(store, "# First\n[scene: x]\nNARRATOR: One.", new Date("2026-10-01"));
    const b = await createStory(store, "", new Date("2026-10-02"));
    assert.equal(a.title, "First");

    await updateStory(store, b.jobId, { script: "# Second\n[scene: y]\nHi there.\nCLERK: Yes." });
    let list = await listStories(store);
    assert.deepEqual(list.map((s) => s.title), ["Second", "First"]); // most recently edited first
    assert.equal(list[0].lineCount, 2);
    assert.equal(list[0].status, "draft");

    await store.putText(keys.status(a.jobId), JSON.stringify({ state: "done", stage: "render", progress: 1 }));
    list = await listStories(store);
    assert.equal(list.find((s) => s.id === a.jobId)?.status, "ready");

    await updateStory(store, a.jobId, { downloadedAt: new Date().toISOString() });
    assert.equal((await getStory(store, a.jobId))?.storyStatus, "downloaded");

    assert.equal(await deleteStory(store, a.jobId), 2);
    assert.equal(await getStory(store, a.jobId), null);
    assert.equal((await listStories(store)).length, 1);
  }));

test("a partial update keeps fields it does not mention", () =>
  withStore(async (store) => {
    const job = await createStory(store, "# Keep\n[scene: a]\nHi.");
    await updateStory(store, job.jobId, { script: undefined, voices: { NARRATOR: "x" } });
    const after = await getStory(store, job.jobId);
    assert.equal(after?.job.script, "# Keep\n[scene: a]\nHi.");
    assert.equal(after?.job.title, "Keep");
    assert.deepEqual(after?.job.voices, { NARRATOR: "x" });
  }));

test("invalid ids are rejected before touching storage", () =>
  withStore(async (store) => {
    await assert.rejects(getStory(store, "../settings"));
    await assert.rejects(deleteStory(store, "a/b"));
  }));

test("style falls back to defaults and merges partial saves", () =>
  withStore(async (store) => {
    assert.deepEqual(await getStyle(store), DEFAULT_STYLE);
    await store.putText(keys.style, JSON.stringify({ artStyle: "pencil", music: { volumeDb: -12 } }));
    const style = await getStyle(store);
    assert.equal(style.artStyle, "pencil");
    assert.equal(style.music.volumeDb, -12);
    assert.equal(style.music.file, null);
    assert.equal(style.captions.enabled, true);
    await saveStyle(store, { ...style, narratorVoice: "x" });
    assert.equal((await getStyle(store)).narratorVoice, "x");
  }));

test("local store refuses keys that escape its folder", () =>
  withStore(async (store) => {
    assert.throws(() => store.resolve("../x"));
    assert.throws(() => store.resolve("a//b"));
    assert.throws(() => store.resolve("a\\b"));
    assert.ok(store.resolve("jobs/a/job.json").startsWith(store.root));
  }));

test("local store lists folders with a delimiter", () =>
  withStore(async (store) => {
    await store.putText("jobs/a/job.json", "{}");
    await store.putText("jobs/a/audio/1.mp3", "x");
    await store.putText("jobs/b/job.json", "{}");
    await store.putText("settings/style.json", "{}");
    assert.deepEqual(await store.list("jobs/", { delimiter: "/" }), { keys: [], prefixes: ["jobs/a/", "jobs/b/"] });
    assert.deepEqual((await store.list("jobs/a/")).keys, ["jobs/a/audio/1.mp3", "jobs/a/job.json"]);
  }));

test("music file names become safe keys", () => {
  assert.equal(musicKey("Dark Ambience (1).MP3", "audio/mpeg"), "settings/music/dark-ambience-1.mp3");
  assert.equal(musicKey("???.wav", "audio/wav"), "settings/music/music.wav");
});

test("store selection from environment", () => {
  assert.equal(createStore({}).kind, "local");
  assert.throws(() => createStore({ R2_BUCKET: "b" }), /Missing environment variables: R2_ACCOUNT_ID/);
  assert.throws(() => createStore({ VERCEL: "1" }), /Storage is not configured/);
  const r2 = createStore({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b" });
  assert.equal(r2.kind, "r2");
});

test("free space deletes voices, images and videos but keeps the script", () =>
  withStore(async (store) => {
    const job = await createStory(store, "# Keep me\n[scene: a]\nHi.");
    const dir = keys.jobDir(job.jobId);
    for (const f of ["audio/s01-l01.mp3", "images/scene-01.jpg", "images/scene-01.json", "output/full-16x9.mp4", "status.json"]) {
      await store.putText(dir + f, "x");
    }
    assert.equal(await freeStorySpace(store, job.jobId), 4);
    assert.deepEqual((await store.list(dir)).keys, [keys.job(job.jobId)]);
    assert.equal((await getStory(store, job.jobId))?.job.title, "Keep me");
  }));

test("story media lists what free space would delete, counting uploads", () =>
  withStore(async (store) => {
    const job = await createStory(store, "# M\n[scene: a]\nHi.");
    const dir = keys.jobDir(job.jobId);
    await store.putBuffer(dir + "output/full-16x9.mp4", Buffer.alloc(4000));
    await store.putBuffer(dir + "output/full-9x16.mp4", Buffer.alloc(3000));
    await store.putBuffer(dir + "images/scene-01.jpg", Buffer.alloc(500));
    await store.putText(dir + "images/scene-01.json", JSON.stringify({ source: "upload" }));
    await store.putBuffer(dir + "images/scene-02.png", Buffer.alloc(400));
    await store.putText(dir + "images/scene-02.json", JSON.stringify({ source: "generated" }));
    await store.putBuffer(dir + "audio/s01-l01.mp3", Buffer.alloc(100));
    const media = await storyMedia(store, job.jobId);
    assert.deepEqual(
      media.groups.map((g) => [g.kind, g.files]),
      [["videos", 2], ["images", 2], ["voices", 1]],
    );
    assert.equal(media.groups[0].bytes, 7000);
    assert.equal(media.uploadedImages, 1);
    assert.ok(media.totalBytes > 8000);
  }));

test("mark as downloaded frees space, keeps the script, and a new run clears it", () =>
  withStore(async (store) => {
    const job = await createStory(store, "# D\n[scene: a]\nHi.");
    const dir = keys.jobDir(job.jobId);
    await store.putText(dir + "output/full-16x9.mp4", "x");
    await store.putText(keys.status(job.jobId), JSON.stringify({ state: "running" }));
    await assert.rejects(markDownloaded(store, job.jobId), /being generated/);
    assert.ok((await store.list(dir)).keys.includes(dir + "output/full-16x9.mp4"));

    await store.putText(keys.status(job.jobId), JSON.stringify({ state: "done" }));
    assert.equal(await markDownloaded(store, job.jobId), 1);
    const after = await getStory(store, job.jobId);
    assert.equal(after?.storyStatus, "downloaded");
    assert.deepEqual((await store.list(dir)).keys, [keys.job(job.jobId)]);

    await updateStory(store, job.jobId, { downloadedAt: null });
    const job2 = (await getStory(store, job.jobId))?.job;
    assert.equal(job2 && "downloadedAt" in job2, false);
  }));

test("storage by story groups sizes per story and kind, largest first", () =>
  withStore(async (store) => {
    const small = await createStory(store, "# Small\n[scene: a]\nHi.");
    const big = await createStory(store, "# Big\n[scene: a]\nHi.");
    await store.putBuffer(keys.jobDir(big.jobId) + "output/full-16x9.mp4", Buffer.alloc(5000));
    await store.putBuffer(keys.jobDir(big.jobId) + "images/scene-01.jpg", Buffer.alloc(300));
    await store.putBuffer(keys.jobDir(small.jobId) + "audio/s01-l01.mp3", Buffer.alloc(100));
    await store.putText("settings/style.json", "{}");
    const b = await storageByStory(store);
    assert.deepEqual(b.stories.map((s) => s.title), ["Big", "Small"]);
    assert.equal(b.stories[0].parts.videos, 5000);
    assert.equal(b.stories[0].parts.images, 300);
    assert.equal(b.stories[1].parts.voices, 100);
    assert.deepEqual(b.shared, { bytes: 2, files: 1 });
    assert.equal(b.totalBytes, b.stories.reduce((n, s) => n + s.bytes, 0) + 2);
  }));
