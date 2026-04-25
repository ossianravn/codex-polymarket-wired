import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error The scheduler helper is an ESM utility consumed by executable scripts.
import { dueStatus, schedulerDecision } from "../scripts/autotrader-scheduler.mjs";

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

test("autotrader due status stays quiet before nextRunAt without material changes", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const report = dueStatus(
    {
      sessionId: "session-1",
      nextRunAt: "2026-04-24T12:10:00.000Z",
      materialChanges: ["heartbeat_deferred_until_next_run"],
      noSubmitInvariantHeld: true,
      submittedOrders: 0
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "quiet");
  assert.equal(report.shouldRunHeartbeat, false);
  assert.equal(report.shouldNotify, false);
});

test("autotrader due status requests heartbeat when nextRunAt is due", () => {
  const now = new Date("2026-04-24T12:10:00.000Z");
  const report = dueStatus(
    {
      sessionId: "session-1",
      nextRunAt: "2026-04-24T12:10:00.000Z",
      materialChanges: [],
      noSubmitInvariantHeld: true,
      submittedOrders: 0
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "run_heartbeat");
  assert.equal(report.shouldRunHeartbeat, true);
  assert.equal(report.shouldNotify, false);
});

test("autotrader due status escalates safety issues", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const report = dueStatus(
    {
      sessionId: "session-1",
      nextRunAt: "2026-04-24T12:10:00.000Z",
      materialChanges: [],
      noSubmitInvariantHeld: false,
      submittedOrders: 1
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "notify_safety_issue");
  assert.equal(report.shouldNotify, true);
  assert.equal(report.safetyIssue, true);
});

test("autotrader due status surfaces material paper changes before nextRunAt", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const report = dueStatus(
    {
      sessionId: "session-1",
      nextRunAt: "2026-04-24T12:10:00.000Z",
      materialChanges: ["candidate_count_changed"],
      noSubmitInvariantHeld: true,
      submittedOrders: 0
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "notify_material_change");
  assert.equal(report.shouldRunHeartbeat, false);
  assert.equal(report.shouldNotify, true);
  assert.deepEqual(report.materialPaperChanges, ["candidate_count_changed"]);
});
