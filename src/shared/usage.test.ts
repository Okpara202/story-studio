import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAmount,
  meterLevel,
  meterPercent,
  nextUtcMidnight,
  nextUtcMonth,
  r2OperationClass,
} from "./usage.ts";

test("meter levels: green below 70%, amber from 70%, red from 90%", () => {
  assert.equal(meterLevel({ used: 0, limit: 100 }), "ok");
  assert.equal(meterLevel({ used: 69, limit: 100 }), "ok");
  assert.equal(meterLevel({ used: 70, limit: 100 }), "warn");
  assert.equal(meterLevel({ used: 90, limit: 100 }), "danger");
  assert.equal(meterPercent({ used: 150, limit: 100 }), 100);
});

test("reset times are UTC midnight and the first of next month", () => {
  const now = new Date("2026-12-31T23:30:00Z");
  assert.equal(nextUtcMidnight(now).toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(nextUtcMonth(now).toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(nextUtcMonth(new Date("2026-10-18T12:00:00Z")).toISOString(), "2026-11-01T00:00:00.000Z");
});

test("R2 operation classes", () => {
  assert.equal(r2OperationClass("PutObject"), "A");
  assert.equal(r2OperationClass("ListObjectsV2"), "A");
  assert.equal(r2OperationClass("GetObject"), "B");
  assert.equal(r2OperationClass("HeadObject"), "B");
  assert.equal(r2OperationClass("DeleteObject"), "free");
  assert.equal(r2OperationClass("SomethingNew"), "A");
});

test("amount formatting", () => {
  assert.equal(formatAmount(512, "bytes"), "512 B");
  assert.equal(formatAmount(3_100_000, "bytes"), "3.1 MB");
  assert.equal(formatAmount(10 * 1000 ** 3, "bytes"), "10.00 GB");
  assert.equal(formatAmount(1_000_000, "operations"), "1M");
  assert.equal(formatAmount(10_000, "neurons"), "10k");
  assert.equal(formatAmount(640, "neurons"), "640");
});
