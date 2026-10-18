// Records one short sample per catalog voice into public/voices/{id}.mp3,
// so the editor's play buttons work instantly and without calling Microsoft.
//
//   node worker/dev/make-voice-samples.ts [--only <voiceId>]
// Re-run after adding voices to src/shared/voices.ts; existing samples are kept.
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { VOICES } from "../../src/shared/voices.ts";
import { EdgeProvider } from "../tts/edge.ts";
import { finishClip } from "../lib/voices.ts";

export const SAMPLE_TEXT = "The letter arrived three days late. The handwriting on the envelope was my own.";

async function main() {
  const { values } = parseArgs({ options: { only: { type: "string" }, force: { type: "boolean", default: false } } });
  const outDir = path.resolve("public", "voices");
  await mkdir(outDir, { recursive: true });
  const edge = new EdgeProvider();
  const voices = values.only ? VOICES.filter((v) => v.id === values.only) : VOICES;
  for (const v of voices) {
    const out = path.join(outDir, `${v.id}.mp3`);
    if (existsSync(out) && !values.force) continue;
    const raw = await edge.synthesize(SAMPLE_TEXT, v.id, path.join(outDir, `${v.id}.raw`));
    await finishClip(raw, out);
    await rm(raw, { force: true });
    console.log(`  ${v.id}`);
  }
  console.log(`Samples in ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
