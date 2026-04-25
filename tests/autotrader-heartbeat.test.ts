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

test("autotrader due status stays quiet for acknowledged material paper changes", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const report = dueStatus(
    {
      sessionId: "session-1",
      nextRunAt: "2026-04-24T12:10:00.000Z",
      materialChanges: ["candidate_count_changed"],
      materialChangesAckFingerprint: "candidate_count_changed",
      noSubmitInvariantHeld: true,
      submittedOrders: 0
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "quiet");
  assert.equal(report.shouldRunHeartbeat, false);
  assert.equal(report.shouldNotify, false);
  assert.equal(report.materialChangesAcknowledged, true);
});

test("autotrader due status includes latest paper financial summary", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const report = dueStatus(
    {
      sessionId: "session-1",
      nextRunAt: "2026-04-24T12:10:00.000Z",
      materialChanges: [],
      noSubmitInvariantHeld: true,
      submittedOrders: 0,
      budgetUsdc: 30,
      spentUsdc: 27.5,
      remainingBudgetUsdc: 2.5,
      unrealizedPnlUsdc: -0.25,
      realizedPnlUsdc: 1.75,
      totalPnlUsdc: 1.5,
      openPositions: 4,
      paperBuyProposalCount: 1,
      paperExitProposalCount: 2,
      paperBuyProposals: [{ marketKey: "buy-1" }],
      paperExitProposals: [{ marketKey: "exit-1" }, { marketKey: "exit-2" }],
      positionDiagnosticCount: 1,
      positionDiagnostics: [{ marketKey: "position-1", action: "hold" }]
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "quiet");
  assert.equal(report.budgetUsdc, 30);
  assert.equal(report.spentUsdc, 27.5);
  assert.equal(report.remainingBudgetUsdc, 2.5);
  assert.equal(report.unrealizedPnlUsdc, -0.25);
  assert.equal(report.realizedPnlUsdc, 1.75);
  assert.equal(report.totalPnlUsdc, 1.5);
  assert.equal(report.openPositions, 4);
  assert.equal(report.paperBuyProposalCount, 1);
  assert.equal(report.paperExitProposalCount, 2);
  assert.deepEqual(report.paperBuyProposals, [{ marketKey: "buy-1" }]);
  assert.deepEqual(report.paperExitProposals, [{ marketKey: "exit-1" }, { marketKey: "exit-2" }]);
  assert.equal(report.positionDiagnosticCount, 1);
  assert.deepEqual(report.positionDiagnostics, [{ marketKey: "position-1", action: "hold" }]);
});

test("autotrader due status reads nested daemon observations and execution report", () => {
  const now = new Date("2026-04-24T12:00:00.000Z");
  const paperExecutionReport = {
    orderCount: 3,
    notionalFillRate: 0.25,
    missedCount: 2,
    partialFillCount: 1,
    rejectedCount: 0
  };
  const report = dueStatus(
    {
      noSubmitInvariantHeld: true,
      submittedOrders: 0,
      observations: [{
        sessionId: "daemon-session",
        ran: true,
        nextRunAt: "2026-04-24T12:10:00.000Z",
        materialChanges: ["paper_execution_low_fill_rate"],
        summary: {
          budgetUsdc: 30,
          spentUsdc: 12,
          remainingBudgetUsdc: 18,
          unrealizedPnlUsdc: -0.5,
          realizedPnlUsdc: 0.25,
          totalPnlUsdc: -0.25,
          openPositions: 2
        },
        paperExecutionReport
      }]
    },
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(report.automationDecision, "notify_material_change");
  assert.equal(report.sessionId, "daemon-session");
  assert.equal(report.spentUsdc, 12);
  assert.equal(report.remainingBudgetUsdc, 18);
  assert.equal(report.openPositions, 2);
  assert.deepEqual(report.materialPaperChanges, ["paper_execution_low_fill_rate"]);
  assert.deepEqual(report.paperExecutionReport, paperExecutionReport);
});
