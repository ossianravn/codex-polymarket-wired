import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseDaemonArgs,
  runDaemonOnce,
  sessionDueStatus,
  type AutotraderDaemonOptions
} from "../scripts/autotrader-daemon.js";
import { openStateStore, type StoredAutoTradingSessionRecord } from "../packages/state-store/src/index.js";

async function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-autotrader-daemon-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function session(input: Partial<StoredAutoTradingSessionRecord> = {}): StoredAutoTradingSessionRecord {
  return {
    sessionId: input.sessionId ?? "session-1",
    name: input.name,
    status: input.status ?? "active",
    mode: input.mode ?? "paper",
    riskProfile: input.riskProfile ?? "aggressive",
    budgetUsdc: input.budgetUsdc ?? 30,
    timeframeHours: input.timeframeHours ?? 24,
    startedAt: input.startedAt ?? "2026-04-25T12:00:00.000Z",
    endsAt: input.endsAt ?? "2026-04-26T12:00:00.000Z",
    heartbeatMinutes: input.heartbeatMinutes ?? 15,
    mandate: input.mandate ?? {
      budgetUsdc: 30,
      timeframeHours: 24,
      riskProfile: "aggressive",
      mode: "paper"
    },
    constraints: input.constraints ?? {},
    metadata: input.metadata ?? {},
    updatedAt: input.updatedAt
  };
}

test("daemon argument parser defaults to paper loop and supports once mode", () => {
  const options = parseDaemonArgs([
    "--once",
    "--session-id",
    "abc",
    "--limit=7",
    "--state-db",
    "state/test.sqlite"
  ]);

  assert.equal(options.loop, false);
  assert.equal(options.mode, "paper");
  assert.equal(options.sessionId, "abc");
  assert.equal(options.limit, 7);
  assert.equal(options.stateDbPath, "state/test.sqlite");
});

test("daemon due status respects latest iteration next_check_at", () => {
  const now = new Date("2026-04-25T12:00:00.000Z");
  const notDue = sessionDueStatus(
    session(),
    [{
      decisionId: "decision-1",
      sessionId: "session-1",
      iterationId: "iteration-1",
      action: "monitor",
      status: "watch",
      nextCheckAt: "2026-04-25T12:10:00.000Z",
      reasonCodes: [],
      blockers: [],
      payload: {},
      createdAt: "2026-04-25T11:59:00.000Z"
    }],
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(notDue.due, false);
  assert.equal(notDue.skipped, true);
  assert.equal(notDue.skipReason, "not_due");

  const due = sessionDueStatus(
    session(),
    [{
      decisionId: "decision-1",
      sessionId: "session-1",
      iterationId: "iteration-1",
      action: "monitor",
      status: "watch",
      nextCheckAt: "2026-04-25T12:00:20.000Z",
      reasonCodes: [],
      blockers: [],
      payload: {},
      createdAt: "2026-04-25T11:59:00.000Z"
    }],
    { respectNextRunAt: true, schedulerSlackSeconds: 30 },
    now
  );

  assert.equal(due.due, true);
  assert.equal(due.skipReason, "due");
});

test("daemon once skips a not-due paper session without MCP or live execution", async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, "state.sqlite");
    const store = openStateStore(dbPath);
    const stored = store.createAutoTradingSession({
      sessionId: "daemon-session",
      name: "daemon test",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      startedAt: "2026-04-25T12:00:00.000Z",
      endsAt: "2026-04-26T12:00:00.000Z",
      heartbeatMinutes: 15,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    store.recordAutoTradingDecision({
      sessionId: stored.sessionId,
      iterationId: "iteration-1",
      action: "monitor",
      status: "watch",
      nextCheckAt: "2026-04-25T12:30:00.000Z",
      reasonCodes: [],
      blockers: []
    });
    store.close();

    const previousTradingFlag = process.env.POLYMARKET_ENABLE_TRADING;
    process.env.POLYMARKET_ENABLE_TRADING = "false";
    try {
      const options: AutotraderDaemonOptions = {
        sessionId: "daemon-session",
        mode: "paper",
        loop: false,
        intervalSeconds: 30,
        respectNextRunAt: true,
        schedulerSlackSeconds: 30,
        limit: 5,
        autoForecast: false,
        stateDbPath: dbPath,
        latestReportPath: path.join(dir, "latest.json"),
        observationLogPath: path.join(dir, "daemon.jsonl"),
        lockDir: path.join(dir, "daemon.lock"),
        staleLockSeconds: 60,
        json: true
      };
      const report = await runDaemonOnce(options, new Date("2026-04-25T12:00:00.000Z"));
      const observations = report.observations as Array<Record<string, unknown>>;
      assert.equal(report.ok, true);
      assert.equal(observations.length, 1);
      assert.equal(observations[0]?.sessionId, "daemon-session");
      assert.equal(observations[0]?.ran, false);
      assert.equal(observations[0]?.skipReason, "not_due");
      assert.equal(report.noSubmitInvariantHeld, true);
    } finally {
      if (previousTradingFlag === undefined) {
        delete process.env.POLYMARKET_ENABLE_TRADING;
      } else {
        process.env.POLYMARKET_ENABLE_TRADING = previousTradingFlag;
      }
    }
  });
});
