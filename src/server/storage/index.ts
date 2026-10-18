import { LocalStore } from "./local.ts";
import { R2Store } from "./r2.ts";
import type { ObjectStore } from "./types.ts";

export type { ObjectStore } from "./types.ts";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
export const LOCAL_STORAGE_DIR = ".local/storage";

/**
 * Pick the store from environment variables:
 * all R2_* set -> Cloudflare R2; none set -> local folder (development only).
 */
export function createStore(env: Record<string, string | undefined> = process.env): ObjectStore {
  const missing = R2_VARS.filter((v) => !env[v]);
  if (missing.length === 0) {
    return new R2Store({
      accountId: env.R2_ACCOUNT_ID!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucket: env.R2_BUCKET!,
    });
  }
  if (missing.length < R2_VARS.length) {
    throw new Error(`Cloudflare R2 is partly configured. Missing environment variables: ${missing.join(", ")}`);
  }
  if (env.VERCEL) {
    throw new Error(
      `Storage is not configured. Add ${R2_VARS.join(", ")} in Vercel → Project → Settings → Environment Variables.`,
    );
  }
  return new LocalStore(env.LOCAL_STORAGE_DIR || LOCAL_STORAGE_DIR);
}

let store: ObjectStore | undefined;

/** Shared store for the app process. */
export function getStore(): ObjectStore {
  store ??= createStore();
  return store;
}
