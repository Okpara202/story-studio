// Builds a self-contained sample job folder with placeholder assets, so the
// renderer can be tested before TTS and image providers exist.
//
//   node worker/dev/make-sample-job.ts [outDir]   (default: .local/jobs/sample)
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseScript } from "../../src/shared/script/parse.ts";
import { estimateLineSec } from "../../src/shared/timing.ts";
import { DEFAULT_STYLE, lineAudioBase, sceneImageBase, type JobFile } from "../../src/shared/job.ts";
import { runFfmpeg } from "../lib/ffmpeg.ts";

const SCRIPT = `# The Letter from Room 9
[scene: dim hotel corridor at night, one door slightly open]
NARRATOR: The letter arrived three days late, which was strange, because it had been posted from the room next to mine.
CLERK: Nobody has stayed in that room in years.
[scene: close-up of an old envelope on a wooden desk, warm lamp light]
NARRATOR: The handwriting was my own. The date on the postmark was tomorrow.
[scene: a hand-drawn floor plan of the hotel, room nine circled in red ink]
NARRATOR: I asked to see the register.
CLERK: Sir, the ninth floor was sealed after the fire.
[scene: a brass key with a paper tag, lying on a dark carpet]
NARRATOR: That night, a key was waiting outside my door.
`;

// Muted placeholder palettes, one per scene.
const PALETTES = [
  ["0x1b2333", "0x4a3b2a"],
  ["0x2b1d1d", "0x7a5a35"],
  ["0x1d2b26", "0x3e4c6b"],
  ["0x2a2233", "0x6b4a3e"],
];
// Placeholder "voices": a soft tone per speaker so mixing and timing are audible.
const TONES: Record<string, number> = { NARRATOR: 196, CLERK: 294 };

async function main() {
  const outDir = path.resolve(process.argv[2] ?? ".local/jobs/sample");
  await rm(outDir, { recursive: true, force: true });
  for (const d of ["images", "audio", "music"]) await mkdir(path.join(outDir, d), { recursive: true });

  const story = parseScript(SCRIPT);
  if (!story.ok) throw new Error(JSON.stringify(story.issues));

  for (const scene of story.scenes) {
    const [c0, c1] = PALETTES[(scene.index - 1) % PALETTES.length];
    // 4:3 gradient with a grid and a centred box marking the focal point, so panning is visible.
    await runFfmpeg([
      "-f", "lavfi",
      "-i", `gradients=s=1024x768:c0=${c0}:c1=${c1}:n=2:seed=${scene.index}:d=1`,
      "-vf",
      "drawgrid=w=64:h=64:t=1:c=white@0.12,drawbox=x=432:y=304:w=160:h=160:t=6:c=0xd9b36c@0.9",
      "-frames:v", "1", "-y", path.join(outDir, "images", `${sceneImageBase(scene.index)}.png`),
    ]);
    for (const [i, line] of scene.lines.entries()) {
      const sec = Math.max(1, estimateLineSec(line.text));
      const freq = TONES[line.speakerId] ?? 247;
      await runFfmpeg([
        "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${sec}`,
        "-af", "volume=0.25,tremolo=f=4:d=0.6,afade=t=in:d=0.05,afade=t=out:st=" + (sec - 0.1) + ":d=0.1",
        "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-ar", "24000",
        "-y", path.join(outDir, "audio", `${lineAudioBase(scene.index, i + 1)}.mp3`),
      ]);
    }
  }
  // Placeholder music bed: quiet brown noise, shorter than the story so looping is exercised.
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.4:duration=12",
    "-af", "lowpass=f=400",
    "-c:a", "libmp3lame", "-b:a", "96k", "-y", path.join(outDir, "music", "bed.mp3"),
  ]);

  const now = new Date().toISOString();
  const job: JobFile = {
    version: 1,
    jobId: "sample",
    title: story.title,
    createdAt: now,
    updatedAt: now,
    script: SCRIPT,
    voices: { NARRATOR: "en-GB-RyanNeural", CLERK: "en-US-GuyNeural" },
    style: { ...DEFAULT_STYLE, music: { file: "music/bed.mp3", volumeDb: -14 } },
  };
  await writeFile(path.join(outDir, "job.json"), JSON.stringify(job, null, 2));
  console.log(`Sample job written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
