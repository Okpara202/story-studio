#!/usr/bin/env node
// Voice every line of a job with text-to-speech.
//
//   node worker/voices.ts <jobDir> [--provider edge|piper] [--force] [--no-status]
//
// Unchanged lines are reused from audio/manifest.json, so editing one line re-voices only that line.
import path from "node:path";
import { parseArgs } from "node:util";
import { voiceJob } from "./lib/voices.ts";
import { statusWriter } from "./lib/status.ts";
import { defaultProviders, type ProviderName } from "./tts/index.ts";

const USAGE = "Usage: node worker/voices.ts <jobDir> [--provider edge|piper] [--force] [--no-status]";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: "string" },
      force: { type: "boolean", default: false },
      "no-status": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || positionals.length !== 1) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }
  const provider = values.provider as ProviderName | undefined;
  if (provider && provider !== "edge" && provider !== "piper") throw new Error(`Unknown --provider "${provider}"`);

  const jobDir = path.resolve(positionals[0]);
  const status = statusWriter(jobDir, "voices", { enabled: !values["no-status"] });
  const started = Date.now();
  try {
    const result = await voiceJob({
      jobDir,
      providers: defaultProviders(provider),
      force: values.force,
      onLog: (m) => console.log(m),
      onProgress: (done, total, message) => {
        process.stdout.write(`\r  ${message}   `);
        status.running(done / total, message);
      },
    });
    process.stdout.write("\n");
    for (const w of result.warnings) console.warn(`Warning: ${w}`);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `Done with ${result.provider}: ${result.synthesized} voiced, ${result.reused} reused, ${result.total} lines in ${secs} s`,
    );
    await status.done({ message: `${result.total} lines voiced with ${result.provider}`, warnings: result.warnings });
  } catch (err) {
    await status.failed(err);
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(`\nVoicing failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
