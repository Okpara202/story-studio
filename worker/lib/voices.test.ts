import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clipHash, planLines, voiceJob, VoicesInterruptedError, type AudioManifest } from "./voices.ts";
import { runFfmpeg } from "./ffmpeg.ts";
import { assignPiperVoices } from "../tts/piper.ts";
import { suggestVoices, VOICES } from "../../src/shared/voices.ts";
import type { JobFile } from "../../src/shared/job.ts";
import type { TtsProvider } from "../tts/types.ts";

const job = (script: string, voices: Record<string, string> = {}): JobFile => ({
  version: 1,
  jobId: "t",
  title: "",
  createdAt: "",
  updatedAt: "",
  script,
  voices,
});

/** Writes a short tone with half a second of silence around it, like a real TTS clip. */
class FakeProvider implements TtsProvider {
  calls: string[] = [];
  readonly name: string;
  readonly nativeProsody = false;
  private readonly failAt: number;
  constructor(name: string, failAt = Infinity) {
    this.name = name;
    this.failAt = failAt;
  }
  async available() {
    return { ok: true as const };
  }
  async synthesize(text: string, _voice: string, outBase: string) {
    if (this.calls.length >= this.failAt) throw new Error(`${this.name} is down`);
    this.calls.push(text);
    const out = `${outBase}.wav`;
    await runFfmpeg([
      "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono:d=0.5",
      "-f", "lavfi", "-i", "sine=f=300:d=1:r=24000",
      "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono:d=0.5",
      "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", "-y", out,
    ]);
    return out;
  }
}

async function withJob(script: string, fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "svs-voices-"));
  try {
    await mkdir(path.join(dir, "audio"));
    await writeFile(path.join(dir, "job.json"), JSON.stringify(job(script)));
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SCRIPT = "# T\n[scene: a]\nNARRATOR: One.\nCLERK: Two.\n[scene: b]\nNARRATOR: Three.";

test("planLines casts like the editor and names clips by scene and line", () => {
  const lines = planLines(job(SCRIPT, { CLERK: "en-US-GuyNeural" }));
  assert.deepEqual(
    lines.map((l) => [l.key, l.speakerId, l.voiceId]),
    [
      ["s01-l01", "NARRATOR", "en-GB-RyanNeural"],
      ["s01-l02", "CLERK", "en-US-GuyNeural"],
      ["s02-l01", "NARRATOR", "en-GB-RyanNeural"],
    ],
  );
});

test("clip hash changes with provider, voice or text only", () => {
  const h = clipHash("edge", "v", "text");
  assert.equal(h, clipHash("edge", "v", "text"));
  assert.notEqual(h, clipHash("piper", "v", "text"));
  assert.notEqual(h, clipHash("edge", "w", "text"));
  assert.notEqual(h, clipHash("edge", "v", "text!"));
});

test("unknown saved voices are replaced, and every catalog voice has a Piper fallback", () => {
  const cast = suggestVoices(["NARRATOR", "OLD"], { OLD: "en-AU-WilliamNeural" }, "en-GB-RyanNeural");
  assert.notEqual(cast.OLD, "en-AU-WilliamNeural");
  assert.ok(VOICES.every((v) => v.piper));
});

test("Piper fallback keeps characters on different voices of the same gender", () => {
  const ids = ["en-US-GuyNeural", "en-US-AndrewNeural", "en-US-AvaNeural", "en-US-AriaNeural"];
  const map = assignPiperVoices(ids);
  assert.equal(new Set(map.values()).size, 4);
  assert.ok(map.get("en-US-AvaNeural")?.match(/amy|kristin|lessac|hfc_female|jenny|cori|alba/));
});

test("voices every line, trims silence, then reuses unchanged lines", () =>
  withJob(SCRIPT, async (dir) => {
    const p = new FakeProvider("fake");
    const first = await voiceJob({ jobDir: dir, providers: [p] });
    assert.deepEqual([first.synthesized, first.reused], [3, 0]);

    const manifest = JSON.parse(await readFile(path.join(dir, "audio", "manifest.json"), "utf8")) as AudioManifest;
    const d = manifest.clips["s01-l01"].durationSec;
    assert.ok(d > 1 && d < 1.4, `silence trimmed: ${d}s from a 2s raw clip`);

    // Insert a new line at the top of scene 1: keys shift, but only the new line is voiced.
    await writeFile(
      path.join(dir, "job.json"),
      JSON.stringify(job("# T\n[scene: a]\nNARRATOR: Zero.\nNARRATOR: One.\nCLERK: Two.\n[scene: b]\nNARRATOR: Three.")),
    );
    const second = await voiceJob({ jobDir: dir, providers: [p] });
    assert.deepEqual([second.synthesized, second.reused], [1, 3]);
    assert.deepEqual(p.calls, ["One.", "Two.", "Three.", "Zero."]);
    const files = (await readdir(path.join(dir, "audio"))).sort();
    assert.deepEqual(files, ["manifest.json", "s01-l01.mp3", "s01-l02.mp3", "s01-l03.mp3", "s02-l01.mp3"]);
  }));

test("interrupted part-way: stops (no voice switch), keeps finished lines, and the retry finishes", () =>
  withJob(SCRIPT, async (dir) => {
    const busy = new FakeProvider("edge", 2);
    const backup = new FakeProvider("piper");
    await assert.rejects(voiceJob({ jobDir: dir, providers: [busy, backup] }), (err: Error) => {
      assert.ok(err instanceof VoicesInterruptedError);
      assert.match(err.message, /after 2 new lines[^]*Try again/);
      return true;
    });
    assert.equal(backup.calls.length, 0, "the backup voices were not used");
    const kept = JSON.parse(await readFile(path.join(dir, "audio", "manifest.json"), "utf8")) as AudioManifest;
    assert.deepEqual(Object.keys(kept.clips).sort(), ["s01-l01", "s01-l02"]);

    const again = new FakeProvider("edge");
    const result = await voiceJob({ jobDir: dir, providers: [again, backup] });
    assert.deepEqual([result.provider, result.synthesized, result.reused], ["edge", 1, 2]);
    assert.deepEqual(again.calls, ["Three."]);
  }));

test("falls back to the next provider for the whole story when the first can't start", () =>
  withJob(SCRIPT, async (dir) => {
    const broken = new FakeProvider("edge", 0);
    const backup = new FakeProvider("piper");
    const result = await voiceJob({ jobDir: dir, providers: [broken, backup] });
    assert.equal(result.provider, "piper");
    assert.equal(backup.calls.length, 3, "all lines re-voiced by the fallback, none mixed");
    assert.match(result.warnings[0], /edge is down/);
  }));

test("when every provider fails, existing audio is left untouched", () =>
  withJob(SCRIPT, async (dir) => {
    await voiceJob({ jobDir: dir, providers: [new FakeProvider("fake")] });
    const before = await readFile(path.join(dir, "audio", "manifest.json"), "utf8");
    await assert.rejects(voiceJob({ jobDir: dir, providers: [new FakeProvider("x", 0)], force: true }), /No voice provider/);
    assert.equal(await readFile(path.join(dir, "audio", "manifest.json"), "utf8"), before);
    assert.equal((await readdir(path.join(dir, "audio"))).length, 4);
  }));

test("delivery cues and inline pauses shape the clip", () =>
  withJob("# T\n[scene: a]\nNARRATOR: Plain.\nNARRATOR (slow): Slow.\nNARRATOR: One [pause 2s] two.", async (dir) => {
    const p = new FakeProvider("fake");
    await voiceJob({ jobDir: dir, providers: [p] });
    const m = JSON.parse(await readFile(path.join(dir, "audio", "manifest.json"), "utf8")) as AudioManifest;
    const [plain, slow, paused] = ["s01-l01", "s01-l02", "s01-l03"].map((k) => m.clips[k].durationSec);
    // Fake clips are 1 s of tone; "(slow)" is 25% slower, and the inline pause adds 2 s between two parts.
    assert.ok(slow > plain * 1.25, `slow ${slow} vs plain ${plain}`);
    assert.ok(paused > plain * 2 + 1.9 && paused < plain * 2 + 2.3, `paused ${paused}`);
    assert.deepEqual(p.calls, ["Plain.", "Slow.", "One", "two."]);
  }));

test("plain lines keep the same clip hash as before cues existed", () => {
  assert.equal(clipHash("edge", "v", "Hi."), clipHash("edge", "v", "Hi.", { parts: ["Hi."], cues: [] }));
  assert.notEqual(clipHash("edge", "v", "Hi."), clipHash("edge", "v", "Hi.", { parts: ["Hi."], cues: ["sad"] }));
});
