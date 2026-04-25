import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildResearchEvidenceBundles,
  buildResearchEvidenceTemplate,
  runIndependentForecastWriter,
  runResearchRequestWorker,
  type AutoTradingResearchRequest,
  type ResearchSourcePack
} from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-research-provider-"));
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

function fixtureResearchRequest(now: Date): AutoTradingResearchRequest {
  return {
    requestId: "research:test:condition:provider",
    createdAt: now.toISOString(),
    dueAt: isoAfter(now, 0.5),
    priority: "high",
    marketKey: "condition:provider",
    title: "Provider market",
    score: 91,
    forecastBlockers: ["independent_forecast_screening_only"],
    reasonCodes: ["forecast_gate:screening_only"],
    requiredArtifact: {
      method: "deep_research_forecast_v1",
      minimumEvidenceItems: 2,
      requiresCounterEvidence: true,
      requiredFields: [
        "fairValueLow",
        "fairValueBase",
        "fairValueHigh",
        "supportsYes",
        "supportsNo",
        "openQuestions",
        "providers",
        "completedAt"
      ],
      forbiddenEvidence: [
        "Polymarket odds",
        "venue price",
        "orderbook",
        "best bid",
        "best ask",
        "spread",
        "recent venue trades",
        "market-implied probability"
      ],
      freshnessHours: 24
    },
    researchQuestion: "Will Provider market resolve YES?",
    marketContext: {
      eventTitle: "Provider event",
      eventSlug: "provider-event",
      categoryGroup: "politics",
      structuralType: "single-binary",
      opportunityMode: "resolution-watch",
      horizonBucket: "short-0-7d",
      endDate: isoAfter(now, 12),
      outcomes: ["Yes", "No"],
      reasonCodes: ["clear_resolution_text"]
    }
  };
}

function validSourcePack(now: Date): ResearchSourcePack {
  return {
    marketKey: "condition:provider",
    title: "Provider market",
    question: "Will Provider market resolve YES?",
    thesis: "Official schedule evidence and independent reporting favor completion inside the stated window, with timing risk still material.",
    fairValueBase: 0.64,
    uncertainty: 0.08,
    supportsYes: [{
      source: "Official schedule",
      title: "Deadline remains listed",
      url: "https://example.com/schedule",
      summary: "The official schedule keeps the relevant milestone inside the forecast window.",
      stance: "supports_yes",
      confidence: "medium"
    }],
    supportsNo: [{
      source: "Independent report",
      title: "Timing risk remains",
      url: "https://example.com/report",
      summary: "A current independent report identifies unresolved procedural constraints.",
      stance: "supports_no",
      confidence: "medium"
    }],
    openQuestions: ["Whether the final procedural step occurs before cutoff."],
    providers: ["unit-test-source-pack"],
    notes: "External evidence pack prepared for the research provider test.",
    completedAt: now.toISOString(),
    numericalAnchors: [
      "Base rate 0.50 adjusted up by schedule evidence and down for timing risk to 0.64."
    ],
    counterCase: "The strongest rival case is a procedural delay outside the window.",
    sourceCutoff: now.toISOString()
  };
}

test("research evidence provider builds bundles and unlocks deep research forecasts", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
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
      marketKey: "condition:provider",
      conditionId: "provider",
      slug: "provider",
      title: "Provider market",
      tags: ["test"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.2, 0.8],
      clobTokenIds: ["yes", "no"],
      yesTokenId: "yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 25_000,
      impliedProb: 0.2,
      bestBid: 0.2,
      bestAsk: 0.22,
      midpoint: 0.21,
      spreadCents: 2,
      structuralType: "single-binary",
      categoryGroup: "politics",
      modelabilityScore: 85,
      catalystScore: 85,
      resolutionAmbiguityScore: 15,
      riskScore: 10,
      researchPriorityScore: 90,
      tradeOpportunityScore: 95,
      tradabilityScore: 90,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {}
    }]);
    const session = store.createAutoTradingSession({
      sessionId: "research-provider-session",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:provider",
      title: "Provider market",
      action: "research_required",
      status: "research",
      score: 91,
      reasonCodes: ["forecast_gate:screening_only"],
      blockers: ["independent_forecast_screening_only"],
      payload: {
        researchRequest: fixtureResearchRequest(now)
      }
    });

    const templates = buildResearchEvidenceTemplate(store, { sessionId: session.sessionId, now, limit: 10 });
    const provider = buildResearchEvidenceBundles({
      templates,
      sourcePacks: [validSourcePack(now)],
      now
    });

    assert.equal(provider.writtenBundles, 1);
    assert.equal(provider.evidenceBundles[0]?.fairValueLow, 0.56);
    assert.equal(provider.evidenceBundles[0]?.fairValueBase, 0.64);
    assert.equal(provider.evidenceBundles[0]?.fairValueHigh, 0.72);

    const research = runResearchRequestWorker(store, {
      sessionId: session.sessionId,
      now,
      limit: 10,
      evidenceBundles: provider.evidenceBundles
    });
    assert.equal(research.recordedResearchRuns, 1);

    const forecasts = runIndependentForecastWriter(store, { runId, now, limit: 10 });
    assert.equal(forecasts.written, 1);
    assert.equal(forecasts.forecasts[0]?.method, "deep_research_forecast_v1");
    assert.equal(forecasts.forecasts[0]?.probability, 0.64);
    const market = store.getUniverseMarket(runId, "condition:provider");
    const forecast = (market?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>;
    assert.equal(forecast.method, "deep_research_forecast_v1");
    assert.equal((forecast.evidence as Record<string, unknown>).confidenceTier, "researched");
  });
});

test("research evidence provider rejects contaminated source packs", () => {
  const now = new Date("2026-04-25T12:00:00.000Z");
  const template = {
    decisionId: "decision-1",
    sessionId: "session-1",
    marketKey: "condition:provider",
    title: "Provider market",
    score: 91,
    dueAt: isoAfter(now, 1),
    priority: "high" as const,
    reasonCodes: ["forecast_gate:screening_only"],
    forecastBlockers: ["independent_forecast_screening_only"],
    requiredArtifact: fixtureResearchRequest(now).requiredArtifact,
    marketContext: fixtureResearchRequest(now).marketContext,
    researchQuestion: "Will Provider market resolve YES?",
    evidenceBundleTemplate: {
      marketKey: "condition:provider",
      title: "Provider market",
      question: "Will Provider market resolve YES?",
      thesis: "",
      fairValueLow: null,
      fairValueBase: null,
      fairValueHigh: null,
      supportsYes: [],
      supportsNo: [],
      openQuestions: [],
      providers: [],
      notes: "",
      completedAt: null,
      automationName: "test"
    }
  };
  const contaminated = {
    ...validSourcePack(now),
    thesis: "This forecast starts from Polymarket odds, which must be rejected."
  };

  const result = buildResearchEvidenceBundles({
    templates: [template],
    sourcePacks: [contaminated],
    now
  });

  assert.equal(result.writtenBundles, 0);
  assert.equal(result.skippedInvalid, 1);
  assert.equal(result.issues[0]?.status, "invalid_source_pack");
  assert.equal(result.issues[0]?.reasonCodes.includes("venue_price_contaminated_source_pack"), true);
});
