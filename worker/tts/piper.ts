import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PIPER_POOL, voiceById } from "../../src/shared/voices.ts";
import type { Availability, TtsProvider } from "./types.ts";

/**
 * Piper: open-source offline TTS (https://github.com/OHF-Voice/piper1-gpl,
 * `pip install piper-tts`). The fallback for when the Edge service is down.
 * It runs as a separate program, so its GPL licence does not extend to this code.
 * Voice models (~60 MB each) download on first use into PIPER_DATA_DIR.
 */
export class PiperProvider implements TtsProvider {
  readonly name = "piper";
  private readonly python: string;
  private readonly dataDir: string;
  /** Edge voice id -> Piper voice, distinct per character where possible. */
  private cast = new Map<string, string>();

  constructor(opts: { python?: string; dataDir?: string } = {}) {
    this.python = opts.python ?? process.env.PIPER_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    this.dataDir = opts.dataDir ?? process.env.PIPER_DATA_DIR ?? path.join(os.homedir(), ".cache", "piper-voices");
  }

  async available(): Promise<Availability> {
    try {
      await run(this.python, ["-c", "import piper"]);
      return { ok: true };
    } catch {
      return { ok: false, reason: `Piper is not installed (run: ${this.python} -m pip install piper-tts)` };
    }
  }

  async prepare(voiceIds: string[]): Promise<void> {
    this.cast = assignPiperVoices(voiceIds);
    await mkdir(this.dataDir, { recursive: true });
    for (const model of new Set(this.cast.values())) {
      if (existsSync(path.join(this.dataDir, `${model}.onnx`))) continue;
      await run(this.python, ["-m", "piper.download_voices", model, "--data-dir", this.dataDir]);
    }
  }

  async synthesize(text: string, voiceId: string, outBase: string): Promise<string> {
    const model = this.cast.get(voiceId) ?? voiceById(voiceId)?.piper;
    if (!model) throw new Error(`No Piper voice for "${voiceId}"`);
    const outFile = `${outBase}.wav`;
    await run(this.python, ["-m", "piper", "-m", model, "--data-dir", this.dataDir, "-f", outFile, "--", text]);
    return outFile;
  }
}

/**
 * Map each cast voice to a Piper voice of the same gender, avoiding repeats
 * so characters stay distinguishable even in fallback mode.
 */
export function assignPiperVoices(voiceIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const id of new Set(voiceIds)) {
    const voice = voiceById(id);
    if (!voice) continue;
    const pool = PIPER_POOL[voice.gender];
    const pick = [voice.piper, ...pool].find((p) => !used.has(p)) ?? voice.piper;
    used.add(pick);
    result.set(id, pick);
  }
  return result;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (${code}): ${stderr.trim()}`)),
    );
  });
}
