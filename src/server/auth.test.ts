import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authMode,
  clearFailures,
  createSession,
  isAllowed,
  lockedOut,
  passwordMatches,
  recordFailure,
  verifySession,
} from "./auth.ts";

test("mode: password set = on; local without = off; deployed without = refuse", () => {
  assert.equal(authMode({ APP_PASSWORD: "x" }).kind, "on");
  assert.equal(authMode({}).kind, "off");
  assert.equal(authMode({ APP_PASSWORD: "  " }).kind, "off");
  assert.equal(authMode({ VERCEL: "1" }).kind, "misconfigured");
  assert.equal(isAllowed(undefined, { VERCEL: "1" }), false);
  assert.equal(isAllowed(undefined, {}), true);
});

test("sessions verify, expire, and die when the password changes", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const s = createSession("secret-1", now);
  assert.equal(verifySession("secret-1", s.value, now), true);
  assert.equal(verifySession("secret-1", s.value, now + 31 * 86_400_000), false, "expired after 30 days");
  assert.equal(verifySession("secret-2", s.value, now), false, "new password signs everyone out");
  const [exp, sig] = s.value.split(".");
  assert.equal(verifySession("secret-1", `${Number(exp) + 1}.${sig}`, now), false, "tampered expiry");
  assert.equal(verifySession("secret-1", "garbage", now), false);
  assert.equal(isAllowed(s.value, { APP_PASSWORD: "secret-1" }, now), true);
  assert.equal(isAllowed(undefined, { APP_PASSWORD: "secret-1" }, now), false);
});

test("password comparison", () => {
  assert.equal(passwordMatches("correct horse", "correct horse"), true);
  assert.equal(passwordMatches("correct horse", "correct hors"), false);
  assert.equal(passwordMatches("correct horse", ""), false);
});

test("five wrong attempts lock an address for 15 minutes", () => {
  const ip = "203.0.113.9";
  const t = 1_000_000;
  for (let i = 0; i < 4; i++) recordFailure(ip, t);
  assert.equal(lockedOut(ip, t), false);
  recordFailure(ip, t);
  assert.equal(lockedOut(ip, t + 60_000), true);
  assert.equal(lockedOut(ip, t + 16 * 60_000), false);
  clearFailures(ip);
  assert.equal(lockedOut(ip, t), false);
});
