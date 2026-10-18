#!/usr/bin/env node
// Blocks commits and pushes that contain secrets. No dependencies.
//
//   node tools/check-secrets.mjs          scan files staged for commit (git pre-commit hook)
//   node tools/check-secrets.mjs --all    scan every tracked file (CI, npm run check:secrets)
//
// Finds well-known key formats, env-style "SECRET=value" lines, and, when
// .env.local exists, any of its actual values.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const RULES = [
  { name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { name: "Cloudflare API token", re: /\bcf[a-z]{2}_[A-Za-z0-9]{30,}\b/ },
  { name: "AWS-style access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "Private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "64-character hex secret (e.g. R2 secret key)", re: /\b[0-9a-f]{64}\b/ },
  {
    name: "Secret assigned in an env-style line",
    re: /^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|ACCESS_KEY)[A-Z0-9_]*\s*=\s*["']?[^\s"'#]{12,}/m,
  },
];

const MAX_BYTES = 2 * 1024 * 1024;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Real values from .env.local (8+ characters), so even unknown key formats are caught. */
function localValues() {
  if (!existsSync(".env.local")) return [];
  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*["']?(.*?)["']?\s*$/.exec(l)?.[1] ?? "")
    .filter((v) => v.length >= 8 && !/^(true|false|story-studio)$/i.test(v) && !v.includes("/"));
}

function filesToScan(all) {
  const out = all
    ? git("ls-files", "-z")
    : git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z");
  return out.split("\0").filter(Boolean);
}

function contentOf(file, all) {
  // Staged content for commits (what will actually be committed), working copy for --all.
  if (all) return existsSync(file) ? readFileSync(file) : null;
  return execFileSync("git", ["show", `:${file}`], { maxBuffer: 64 * 1024 * 1024 });
}

const redact = (s) => (s.length <= 8 ? "****" : `${s.slice(0, 4)}…(${s.length} chars)`);

function main() {
  const all = process.argv.includes("--all");
  const values = localValues();
  const findings = [];

  for (const file of filesToScan(all)) {
    if (file.startsWith(".env") || file.endsWith("/.env.local")) {
      findings.push(`${file}: environment files must never be committed`);
      continue;
    }
    const buf = contentOf(file, all);
    if (!buf || buf.length > MAX_BYTES || buf.includes(0)) continue; // binary or huge
    const lines = buf.toString("utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        const m = rule.re.exec(line);
        if (m) findings.push(`${file}:${i + 1}: ${rule.name} (${redact(m[0])})`);
      }
      for (const v of values) {
        if (line.includes(v)) findings.push(`${file}:${i + 1}: a value from .env.local (${redact(v)})`);
      }
    });
  }

  if (findings.length) {
    console.error("\nSecret check FAILED. Nothing was committed. Remove these before committing:\n");
    for (const f of findings) console.error(`  ${f}`);
    console.error("\nKeys belong in .env.local (ignored by git), Vercel settings or GitHub secrets.\n");
    process.exit(1);
  }
  console.log(`Secret check passed (${all ? "all tracked files" : "staged files"}).`);
}

main();
