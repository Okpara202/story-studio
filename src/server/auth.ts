import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-owner password protection. Not a user system: one password from
 * APP_PASSWORD, and a signed cookie that remembers the browser for 30 days.
 * Changing APP_PASSWORD signs out every browser (the signing key derives from it).
 */
export const SESSION_COOKIE = "svs_session";
export const SESSION_DAYS = 30;

type Env = Record<string, string | undefined>;

export type AuthMode =
  | { kind: "on"; password: string }
  /** Local development without a password: open, with a reminder in the UI. */
  | { kind: "off" }
  /** Deployed without a password: refuse everything rather than run open. */
  | { kind: "misconfigured" };

export function authMode(env: Env = process.env): AuthMode {
  const password = env.APP_PASSWORD?.trim();
  if (password) return { kind: "on", password };
  // Vercel sets VERCEL=1 on every deployment.
  return env.VERCEL ? { kind: "misconfigured" } : { kind: "off" };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const signingKey = (password: string) => sha256(`story-studio-session:${password}`);

function sign(password: string, expiresAt: number): string {
  return createHmac("sha256", signingKey(password)).update(String(expiresAt)).digest("base64url");
}

export function createSession(password: string, now = Date.now()): { value: string; maxAge: number } {
  const maxAge = SESSION_DAYS * 86_400;
  const expiresAt = now + maxAge * 1000;
  return { value: `${expiresAt}.${sign(password, expiresAt)}`, maxAge };
}

export function verifySession(password: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !sig) return false;
  const expected = Buffer.from(sign(password, expiresAt));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Constant-time comparison (hashing first makes the lengths equal). */
export function passwordMatches(password: string, attempt: string): boolean {
  return timingSafeEqual(sha256(password), sha256(attempt));
}

/** Whether a request carrying this cookie may use the app. */
export function isAllowed(cookie: string | undefined, env: Env = process.env, now = Date.now()): boolean {
  const mode = authMode(env);
  if (mode.kind === "off") return true;
  if (mode.kind === "misconfigured") return false;
  return verifySession(mode.password, cookie, now);
}

// Slow down guessing: after 5 wrong passwords from one address, refuse for 15 minutes.
// In-memory, so per server instance; the 1-second delay per failure applies everywhere.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

export function lockedOut(ip: string, now = Date.now()): boolean {
  const f = failures.get(ip);
  return Boolean(f && f.count >= MAX_FAILURES && f.until > now);
}

export function recordFailure(ip: string, now = Date.now()): void {
  const f = failures.get(ip);
  const count = f && f.until > now ? f.count + 1 : 1;
  failures.set(ip, { count, until: now + LOCK_MS });
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
