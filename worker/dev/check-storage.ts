// Checks that storage works end to end with the current environment
// (run via `npm run check:storage`, which loads .env.local). Prints
// pass/fail per step and never prints credentials.
import { createStore } from "../../src/server/storage/index.ts";

const ORIGIN = process.env.CHECK_ORIGIN ?? "http://localhost:3000";
const key = `_healthcheck/${Date.now()}.txt`;
let failed = 0;

async function step(name: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    console.log(`  PASS  ${name}${note ? ` (${note})` : ""}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function expect(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

async function main() {
  const store = createStore();
  console.log(`Storage: ${store.kind === "r2" ? `Cloudflare R2, bucket "${process.env.R2_BUCKET}"` : "local folder"}`);

  await step("write a file", () => store.putText(key, "hello"));
  await step("read it back", async () => expect((await store.getText(key)) === "hello", "content did not match"));
  await step("list it", async () => expect((await store.list("_healthcheck/")).keys.includes(key), "not in listing"));
  await step("missing file reads as empty", async () =>
    expect((await store.getText(`${key}.nope`)) === null, "expected null"),
  );

  if (store.kind === "r2") {
    await step("download link works", async () => {
      const res = await fetch(await store.presignGet(key));
      expect(res.ok, `HTTP ${res.status}`);
      expect((await res.text()) === "hello", "wrong content");
    });
    await step(`browser upload allowed from ${ORIGIN} (CORS)`, async () => {
      const url = await store.presignPut(`${key}.upload`, "text/plain");
      const pre = await fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      const allowed = pre.headers.get("access-control-allow-origin");
      expect(
        allowed === ORIGIN || allowed === "*",
        `R2 did not allow ${ORIGIN} (HTTP ${pre.status}). Add the CORS policy from the README to the bucket.`,
      );
    });
    await step("upload with a presigned link", async () => {
      const res = await fetch(await store.presignPut(`${key}.upload`, "text/plain"), {
        method: "PUT",
        headers: { "Content-Type": "text/plain", Origin: ORIGIN },
        body: "uploaded",
      });
      expect(res.ok, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      expect((await store.getText(`${key}.upload`)) === "uploaded", "uploaded content not found");
    });
  }

  await step("delete test files", async () => {
    const n = await store.deletePrefix("_healthcheck/");
    expect((await store.getText(key)) === null, "file still there");
    return `${n} removed`;
  });

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(`Could not start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
