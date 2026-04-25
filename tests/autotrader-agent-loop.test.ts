import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyAutoTradingAgentDecisionPlan,
  buildAutoTradingAgentBrief,
  buildResearchEvidenceTemplate,
  runAutoTradingIteration
} from "../packages/auto-trader/src/index.js";
import { openStateStore, type StoredUniverseMarketInput } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-agent-loop-"));
  const store = openStateStore(path.join(dir, "polymarket.sqlite"));
  try {
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function isoAfter(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function marketFixture(runId: string, now: Date): StoredUniverseMarketInput {
  return {
    runId,
    marketKey: "condition:agent-pick",
    conditionId: "agent-pick",
    slug: "agent-pick",
    eventSlug: "agent-event",
    eventTitle: "Agent event",
    title: "Agent-selected market",
    category: "sports",
    tags: ["sports"],
    outcomes: ["Yes", "No"],
    outcomePrices: [0.42, 0.58],
    clobTokenIds: ["agent-yes", "agent-no"],
    yesTokenId: "agent-yes",
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
    endDate: isoAfter(now, 12),
    liquidityUsd: 40_000,
    volume24hUsd: 10_000,
    impliedProb: 0.42,
    bestBid: 0.42,
    bestAsk: 0.44,
    midpoint: 0.43,
    spreadCents: 2,
    categoryGroup: "sports",
    structuralType: "single-binary",
    horizonBucket: "resolves-today",
    priceBucket: "balanced-30-70c",
    liquidityBucket: "tradable",
    spreadBucket: "normal-1-3c",
    opportunityMode: "execution-ready",
    modelabilityScore: 80,
    tradabilityScore: 85,
    catalystScore: 86,
    resolutionAmbiguityScore: 20,
    attentionGapScore: 55,
    crossMarketScore: 20,
    researchPriorityScore: 85,
    tradeOpportunityScore: 94,
    makerScore: 50,
    riskScore: 14,
    reasonCodes: ["defined_catalyst_window"],
    disqualifiers: [],
    rawJson: {
      independentForecast: {
        sealed: true,
        probability: 0.62,
        uncertainty: 0.02,
        forecastedAt: now.toISOString(),
        expiresAt: isoAfter(now, 12),
        numericalChecks: ["fixture_base_rate"],
        usesVenuePrice: false
      }
    },
    capturedAt: now.toISOString()
  };
}

test("agent loop emits a compact decision brief and paper-fills approved agent action", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [marketFixture(runId, now)]);

    const iteration = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5
      }
    });
    const brief = buildAutoTradingAgentBrief({ iteration, candidateLimit: 3 });

    assert.equal(brief.kind, "polymarket_autotrader_agent_brief_v1");
    assert.equal(brief.candidates.length, 1);
    assert.equal(brief.candidates[0]?.decisionRef, "candidate-01");
    assert.equal(brief.candidates[0]?.marketKey, "condition:agent-pick");
    assert.ok(brief.prompt?.includes("Return only JSON"));

    const applied = applyAutoTradingAgentDecisionPlan(store, brief, {
      kind: "polymarket_autotrader_agent_decision_plan_v1",
      sessionId: brief.session.sessionId,
      agentName: "fixture-agent",
      decisions: [{
        decisionRef: "candidate-01",
        action: "paper_buy_yes",
        confidence: 0.74,
        rationale: "Independent forecast edge is large enough for a small aggressive paper buy.",
        limitPrice: 0.44,
        maxSpendUsdc: 5,
        nextCheckMinutes: 10
      }]
    }, { now });

    assert.equal(applied.recorded, 1);
    assert.equal(applied.blocked, 0);
    assert.equal(applied.ledger.summary.spentUsdc, 5);
    assert.equal(applied.ledger.summary.remainingBudgetUsdc, 25);
    assert.equal(applied.ledger.summary.openPositionCount, 1);
    assert.equal(applied.decisions[0]?.storedDecision?.action, "paper_buy_yes");
    assert.equal(applied.decisions[0]?.paperOrder?.status, "filled");
    assert.equal(applied.liveSubmissionBlocked, true);
  });
});

test("agent loop records but blocks live execution requests in paper sessions", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [marketFixture(runId, now)]);

    const iteration = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5
      }
    });
    const brief = buildAutoTradingAgentBrief({ iteration });
    const applied = applyAutoTradingAgentDecisionPlan(store, brief, {
      sessionId: brief.session.sessionId,
      decisions: [{
        decisionRef: "candidate-01",
        action: "live_buy_yes",
        confidence: 0.8,
        rationale: "This should never live execute from a paper session.",
        limitPrice: 0.44,
        maxSpendUsdc: 5
      }]
    }, { now });

    assert.equal(applied.recorded, 0);
    assert.equal(applied.blocked, 1);
    assert.ok(applied.decisions[0]?.blockers.includes("live_action_blocked_in_paper_session"));
    assert.ok(applied.decisions[0]?.blockers.includes("live_submission_blocked_agent_loop"));
    assert.equal(applied.ledger.summary.spentUsdc, 0);
  });
});

test("agent loop persists research requests for agent research-required decisions", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [marketFixture(runId, now)]);

    const iteration = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5
      }
    });
    const brief = buildAutoTradingAgentBrief({ iteration, candidateLimit: 3 });
    const candidate = brief.candidates[0];
    assert.ok(candidate);
    candidate.blockers = ["independent_forecast_screening_only"];
    candidate.reasonCodes = ["forecast_gate:screening_only"];

    const applied = applyAutoTradingAgentDecisionPlan(store, brief, {
      kind: "polymarket_autotrader_agent_decision_plan_v1",
      sessionId: brief.session.sessionId,
      agentName: "fixture-agent",
      decisions: [{
        decisionRef: "candidate-01",
        action: "research_required",
        confidence: 0.66,
        rationale: "External evidence is required before this can become a tradable forecast.",
        nextCheckMinutes: 20
      }]
    }, {
      now,
      iterationId: "agent-research-iteration-1"
    });

    assert.equal(applied.recorded, 1);
    assert.equal(applied.blocked, 0);
    assert.equal(applied.ledger.summary.spentUsdc, 0);
    assert.equal(applied.ledger.summary.openPositionCount, 0);
    assert.equal(applied.decisions[0]?.storedDecision?.action, "research_required");

    const template = buildResearchEvidenceTemplate(store, {
      sessionId: brief.session.sessionId,
      now,
      limit: 10
    });

    assert.equal(template.scannedDecisions, 1);
    assert.equal(template.pendingRequests, 1);
    assert.equal(template.templates.length, 1);
    assert.equal(template.templates[0]?.marketKey, "condition:agent-pick");
    assert.equal(template.templates[0]?.requiredArtifact.method, "deep_research_forecast_v1");
    assert.ok(template.templates[0]?.forecastBlockers.includes("independent_forecast_screening_only"));
    assert.match(template.templates[0]?.researchQuestion ?? "", /Agent-selected market/);
  });
});
