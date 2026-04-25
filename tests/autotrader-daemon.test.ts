import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseDaemonArgs,
  runDaemonOnce,
  sessionDueStatus,
  universeRefreshDecision,
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
  assert.equal(options.autoRefreshUniverse, true);
  assert.equal(options.autoRefreshSnapshots, true);
  assert.equal(options.refreshSnapshotLimit, 50);
  assert.equal(options.refreshSnapshotMaxAgeMinutes, 5);
  assert.equal(options.researchSourceFile, undefined);
  assert.equal(options.stateDbPath, "state/test.sqlite");
});

test("universe refresh decision only refreshes missing or stale discovery runs", () => {
  const now = new Date("2026-04-25T12:00:00.000Z");
  const disabled = universeRefreshDecision(null, { autoRefreshUniverse: false, maxUniverseAgeMinutes: 10 }, now);
  assert.equal(disabled.shouldRefresh, false);
  assert.equal(disabled.reason, "disabled");
  assert.equal(disabled.maxAgeMinutes, 10);
  assert.equal(disabled.latestRunId, undefined);
  assert.deepEqual(
    universeRefreshDecision(null, { autoRefreshUniverse: true, maxUniverseAgeMinutes: 10 }, now),
    {
      shouldRefresh: true,
      reason: "missing",
      maxAgeMinutes: 10
    }
  );

  const fresh = universeRefreshDecision(
    { runId: "run-1", completedAt: "2026-04-25T11:55:00.000Z" },
    { autoRefreshUniverse: true, maxUniverseAgeMinutes: 10 },
    now
  );
  assert.equal(fresh.shouldRefresh, false);
  assert.equal(fresh.reason, "fresh");
  assert.equal(fresh.latestRunId, "run-1");
  assert.equal(fresh.ageMinutes, 5);

  const stale = universeRefreshDecision(
    { runId: "run-2", completedAt: "2026-04-25T11:40:00.000Z" },
    { autoRefreshUniverse: true, maxUniverseAgeMinutes: 10 },
    now
  );
  assert.equal(stale.shouldRefresh, true);
  assert.equal(stale.reason, "stale");
  assert.equal(stale.latestRunId, "run-2");
  assert.equal(stale.ageMinutes, 20);
});

test("daemon once records source-pack research and upgrades forecasts before planning", async () => {
  await withTempDir(async (dir) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const dbPath = path.join(dir, "state.sqlite");
    const sourcePath = path.join(dir, "source-packs.json");
    const marketKey = "condition:daemon-research";
    const store = openStateStore(dbPath);
    const runId = store.startUniverseRun({
      source: "test",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey,
      conditionId: "daemon-research",
      title: "Daemon research market",
      outcomes: ["Yes", "No"],
      clobTokenIds: ["yes-token", "no-token"],
      yesTokenId: "yes-token",
      noTokenId: "no-token",
      active: true,
      closed: false,
      acceptingOrders: true,
      endDate: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(),
      liquidityUsd: 25_000,
      volume24hUsd: 5_000,
      impliedProb: 0.24,
      bestBid: 0.23,
      bestAsk: 0.24,
      midpoint: 0.235,
      spreadCents: 1,
      categoryGroup: "politics",
      structuralType: "single-binary",
      horizonBucket: "resolves-today",
      opportunityMode: "resolution-watch",
      tradabilityScore: 90,
      researchPriorityScore: 90,
      tradeOpportunityScore: 95,
      resolutionAmbiguityScore: 10,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {},
      capturedAt: now.toISOString()
    }]);
    store.createAutoTradingSession({
      sessionId: "daemon-research-session",
      name: "daemon research test",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      heartbeatMinutes: 15,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    store.recordAutoTradingDecision({
      sessionId: "daemon-research-session",
      iterationId: "iteration-1",
      marketKey,
      title: "Daemon research market",
      action: "research_required",
      status: "research",
      score: 91,
      reasonCodes: ["forecast_gate:screening_only"],
      blockers: ["independent_forecast_screening_only"],
      payload: {
        researchRequest: {
          requestId: "research:daemon",
          createdAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
          priority: "high",
          marketKey,
          title: "Daemon research market",
          score: 91,
          forecastBlockers: ["independent_forecast_screening_only"],
          reasonCodes: ["forecast_gate:screening_only"],
          requiredArtifact: {
            method: "deep_research_forecast_v1",
            minimumEvidenceItems: 2,
            requiresCounterEvidence: true,
            requiredFields: ["fairValueLow", "fairValueBase", "fairValueHigh"],
            forbiddenEvidence: ["Polymarket odds", "venue price", "orderbook"],
            freshnessHours: 24
          },
          researchQuestion: "Will Daemon research market resolve YES?",
          marketContext: {
            categoryGroup: "politics",
            structuralType: "single-binary",
            opportunityMode: "resolution-watch",
            horizonBucket: "resolves-today",
            endDate: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(),
            outcomes: ["Yes", "No"],
            reasonCodes: ["clear_resolution_text"]
          }
        }
      }
    });
    store.close();

    await writeFile(sourcePath, `${JSON.stringify({
      sourcePacks: [{
        marketKey,
        title: "Daemon research market",
        question: "Will Daemon research market resolve YES?",
        thesis: "Official status evidence favors completion inside the window, while procedural timing remains the main counter-case.",
        fairValueBase: 0.62,
        uncertainty: 0.08,
        supportsYes: [{
          source: "Official status source",
          title: "Milestone remains scheduled",
          url: "https://example.com/status",
          summary: "The official source keeps the relevant milestone inside the market window.",
          stance: "supports_yes",
          confidence: "medium"
        }],
        supportsNo: [{
          source: "Independent counter source",
          title: "Timing dependency remains",
          url: "https://example.com/counter",
          summary: "A non-venue source identifies an unresolved dependency that can delay resolution.",
          stance: "supports_no",
          confidence: "medium"
        }],
        openQuestions: ["Whether the dependency clears before cutoff."],
        providers: ["daemon-test-source-pack"],
        numericalAnchors: ["Base 0.50 adjusted to 0.62 for status evidence, with 0.08 uncertainty."],
        counterCase: "The unresolved dependency can delay completion.",
        completedAt: now.toISOString()
      }]
    }, null, 2)}\n`, "utf8");

    const previousTradingFlag = process.env.POLYMARKET_ENABLE_TRADING;
    process.env.POLYMARKET_ENABLE_TRADING = "false";
    try {
      const options: AutotraderDaemonOptions = {
        sessionId: "daemon-research-session",
        mode: "paper",
        loop: false,
        intervalSeconds: 30,
        respectNextRunAt: false,
        schedulerSlackSeconds: 30,
        limit: 10,
        autoForecast: true,
        autoRefreshUniverse: false,
        autoRefreshSnapshots: true,
        refreshSnapshotLimit: 10,
        refreshSnapshotMaxAgeMinutes: 5,
        researchSourceFile: sourcePath,
        stateDbPath: dbPath,
        latestReportPath: path.join(dir, "latest.json"),
        observationLogPath: path.join(dir, "daemon.jsonl"),
        lockDir: path.join(dir, "daemon.lock"),
        staleLockSeconds: 60,
        json: true
      };
      const report = await runDaemonOnce(options, now);
      const observations = report.observations as Array<Record<string, unknown>>;
      const researchPipeline = observations[0]?.researchPipeline as {
        provider?: { writtenBundles?: number };
        worker?: { recordedResearchRuns?: number };
      } | undefined;
      const forecastWriter = observations[0]?.forecastWriter as { written?: number; forecasts?: Array<{ method?: string }> } | undefined;

      assert.equal(report.ok, true);
      assert.equal(researchPipeline?.provider?.writtenBundles, 1);
      assert.equal(researchPipeline?.worker?.recordedResearchRuns, 1);
      assert.equal(forecastWriter?.written, 1);
      assert.equal(forecastWriter?.forecasts?.[0]?.method, "deep_research_forecast_v1");
    } finally {
      if (previousTradingFlag === undefined) {
        delete process.env.POLYMARKET_ENABLE_TRADING;
      } else {
        process.env.POLYMARKET_ENABLE_TRADING = previousTradingFlag;
      }
    }

    const verifyStore = openStateStore(dbPath);
    try {
      const market = verifyStore.getUniverseMarket(runId, marketKey);
      const forecast = (market?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>;
      assert.equal(forecast.method, "deep_research_forecast_v1");
    } finally {
      verifyStore.close();
    }
  });
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
        autoRefreshUniverse: false,
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

test("daemon once includes paper execution report on run observations", async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, "state.sqlite");
    const store = openStateStore(dbPath);
    store.createAutoTradingSession({
      sessionId: "daemon-session",
      name: "daemon run test",
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
        autoRefreshUniverse: false,
        stateDbPath: dbPath,
        latestReportPath: path.join(dir, "latest.json"),
        observationLogPath: path.join(dir, "daemon.jsonl"),
        lockDir: path.join(dir, "daemon.lock"),
        staleLockSeconds: 60,
        json: true
      };
      const report = await runDaemonOnce(options, new Date("2026-04-25T12:00:00.000Z"));
      const observations = report.observations as Array<Record<string, unknown>>;
      const executionReport = observations[0]?.paperExecutionReport as Record<string, unknown> | undefined;
      const universeRefresh = observations[0]?.universeRefresh as Record<string, unknown> | undefined;
      const snapshotRefresh = observations[0]?.snapshotRefresh as Record<string, unknown> | undefined;
      assert.equal(report.ok, true);
      assert.equal(observations[0]?.ran, true);
      assert.equal(universeRefresh?.refreshed, false);
      assert.equal(universeRefresh?.reason, "disabled");
      assert.equal(snapshotRefresh?.scannedMarkets, 0);
      assert.equal(snapshotRefresh?.refreshed, 0);
      assert.equal(executionReport?.orderCount, 0);
      assert.equal(executionReport?.notionalFillRate, 0);
      assert.deepEqual(observations[0]?.materialChanges, []);
    } finally {
      if (previousTradingFlag === undefined) {
        delete process.env.POLYMARKET_ENABLE_TRADING;
      } else {
        process.env.POLYMARKET_ENABLE_TRADING = previousTradingFlag;
      }
    }
  });
});

test("daemon agent loop applies an agent plan instead of deterministic paper execution", async () => {
  await withTempDir(async (dir) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const dbPath = path.join(dir, "state.sqlite");
    const planPath = path.join(dir, "agent-plan.json");
    const briefPath = path.join(dir, "agent-brief.json");
    const promptPath = path.join(dir, "agent-prompt.md");
    const store = openStateStore(dbPath);
    const runId = store.startUniverseRun({
      source: "test",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:daemon-agent",
      conditionId: "daemon-agent",
      title: "Daemon agent market",
      outcomes: ["Yes", "No"],
      clobTokenIds: ["agent-yes", "agent-no"],
      yesTokenId: "agent-yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      endDate: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(),
      liquidityUsd: 25_000,
      volume24hUsd: 5_000,
      impliedProb: 0.4,
      bestBid: 0.39,
      bestAsk: 0.4,
      midpoint: 0.395,
      spreadCents: 1,
      categoryGroup: "sports",
      structuralType: "single-binary",
      horizonBucket: "resolves-today",
      opportunityMode: "resolution-watch",
      tradabilityScore: 90,
      researchPriorityScore: 90,
      tradeOpportunityScore: 95,
      resolutionAmbiguityScore: 10,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {
        independentForecast: {
          sealed: true,
          probability: 0.62,
          uncertainty: 0.02,
          forecastedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(),
          numericalChecks: ["daemon_agent_fixture"],
          usesVenuePrice: false
        }
      },
      capturedAt: now.toISOString()
    }]);
    store.createAutoTradingSession({
      sessionId: "daemon-agent-session",
      name: "daemon agent test",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      heartbeatMinutes: 15,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5
      }
    });
    store.close();

    await writeFile(planPath, `${JSON.stringify({
      kind: "polymarket_autotrader_agent_decision_plan_v1",
      sessionId: "daemon-agent-session",
      agentName: "test-agent",
      decisions: [{
        decisionRef: "candidate-01",
        action: "paper_buy_yes",
        confidence: 0.76,
        rationale: "Agent selected this because the independent forecast edge clears the aggressive threshold.",
        limitPrice: 0.4,
        maxSpendUsdc: 5
      }]
    }, null, 2)}\n`, "utf8");

    const previousTradingFlag = process.env.POLYMARKET_ENABLE_TRADING;
    process.env.POLYMARKET_ENABLE_TRADING = "false";
    try {
      const options: AutotraderDaemonOptions = {
        sessionId: "daemon-agent-session",
        mode: "paper",
        loop: false,
        intervalSeconds: 30,
        respectNextRunAt: false,
        schedulerSlackSeconds: 30,
        limit: 5,
        autoForecast: false,
        agentLoop: true,
        agentCandidateLimit: 5,
        agentPlanFile: planPath,
        agentBriefPath: briefPath,
        agentPromptPath: promptPath,
        autoRefreshUniverse: false,
        autoRefreshSnapshots: false,
        stateDbPath: dbPath,
        latestReportPath: path.join(dir, "latest.json"),
        observationLogPath: path.join(dir, "daemon.jsonl"),
        lockDir: path.join(dir, "daemon.lock"),
        staleLockSeconds: 60,
        json: true
      };
      const report = await runDaemonOnce(options, now);
      const observation = (report.observations as Array<Record<string, unknown>>)[0];
      const agentLoop = observation?.agentLoop as {
        enabled?: boolean;
        candidateCount?: number;
        planProvided?: boolean;
        applied?: { recorded?: number; blocked?: number };
      } | undefined;

      assert.equal(report.ok, true);
      assert.equal(agentLoop?.enabled, true);
      assert.equal(agentLoop?.candidateCount, 1);
      assert.equal(agentLoop?.planProvided, true);
      assert.equal(agentLoop?.applied?.recorded, 1);
      assert.equal(agentLoop?.applied?.blocked, 0);
      assert.equal(observation?.spentUsdc, 5);
      assert.equal(observation?.remainingBudgetUsdc, 25);
    } finally {
      if (previousTradingFlag === undefined) {
        delete process.env.POLYMARKET_ENABLE_TRADING;
      } else {
        process.env.POLYMARKET_ENABLE_TRADING = previousTradingFlag;
      }
    }
  });
});
