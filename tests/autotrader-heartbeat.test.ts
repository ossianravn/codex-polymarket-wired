import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error The heartbeat runner is an executable ESM script with tested pure exports.
import { schedulerDecision } from "../scripts/autotrader-heartbeat.mjs";

test("autotrader heartbeat scheduler skips before nextRunAt", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const decision = schedulerDecision(
    { nextRunAt: "2026-04-24T12:10:00.000Z" },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(decision.skipped, true);
  assert.equal(decision.reason, "not_due");
  assert.equal(decision.dueInSeconds, 600);
});

test("autotrader heartbeat scheduler runs when nextRunAt is due", () => {
  const now = new Date("2026-04-24T12:10:00.000Z");
  const decision = schedulerDecision(
    { nextRunAt: "2026-04-24T12:10:00.000Z" },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(decision.skipped, false);
  assert.equal(decision.reason, "due");
});

test("autotrader heartbeat scheduler can be forced to ignore nextRunAt", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const decision = schedulerDecision(
    { nextRunAt: "2026-04-24T12:10:00.000Z" },
    { respectNextRunAt: false, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(decision.skipped, false);
  assert.equal(decision.reason, "forced");
});
