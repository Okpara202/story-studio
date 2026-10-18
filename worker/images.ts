#!/usr/bin/env node
// Give every scene an up-to-date image.
//
//   node worker/images.ts <jobDir> [--scene N] [--force] [--no-status]
//
// Uploaded images are never replaced. Generated images are redone only when
// the scene's prompt changed (or with --force, which also picks a new seed).
// Needs CLOUDFLARE_API_TOKEN (and optionally AI_HORDE_API_KEY); `npm run images` loads .env.local.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { JobFile } from "../src/shared/job.ts";
import { LocalStore } from "../src/server/storage/local.ts";
import { ensureSceneImages } from "../src/server/scene-images.ts";
import { imageProviders } from "../src/server/images/index.ts";
import { statusWriter } from "./lib/status.ts";

const USAGE = "Usage: node worker/images.ts <jobDir> [--scene N] [--force] [--no-status]";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      scene: { type: "string" },
      force: { type: "boolean", default: false },
      "no-status": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || positionals.length !== 1) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }
  const jobDir = path.resolve(positionals[0]);
  const job = JSON.parse(await readFile(path.join(jobDir, "job.json"), "utf8")) as JobFile;
  const providers = imageProviders();
  console.log(`Image providers: ${providers.map((p) => p.name).join(", ") || "none (uploads only)"}`);

  const status = statusWriter(jobDir, "images", { enabled: !values["no-status"] });
  const started = Date.now();
  const results = await ensureSceneImages({ store: new LocalStore(jobDir), prefix: "" }, job, providers, {
    force: values.force,
    only: values.scene ? Number(values.scene) : undefined,
    onProgress: (done, total, message) => {
      process.stdout.write(`\r  ${message}   `);
      status.running(done / total, message);
    },
  });
  process.stdout.write("\n");

  for (const r of results) console.log(`  scene ${r.scene}: ${r.result}${r.error ? ` (${r.error})` : ""}`);
  const failed = results.filter((r) => r.result === "failed");
  const scenes = results.map((r) => ({
    index: r.scene,
    state: r.result === "failed" ? ("failed" as const) : ("ok" as const),
    error: r.error,
  }));
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (failed.length) {
    await status.failed(new Error(`${failed.length} scene image(s) failed. Retry, or upload images for them.`), { scenes });
    console.error(`${failed.length} of ${results.length} scenes failed (${secs} s).`);
    process.exit(1);
  }
  await status.done({ message: `${results.length} scene images ready`, scenes });
  console.log(`All ${results.length} scenes have images (${secs} s).`);
}

main().catch((err: unknown) => {
  console.error(`\nImages failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
