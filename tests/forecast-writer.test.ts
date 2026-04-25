import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runAutoTradingIteration,
  runIndependentForecastWriter
} from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-forecast-writer-"));
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

test("forecast writer seals independent forecast artifacts without venue-price evidence", async () => {
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
      marketKey: "condition:forecast-me",
      conditionId: "forecast-me",
      slug: "forecast-me",
      title: "Forecast me",
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

    const result = runIndependentForecastWriter(store, { runId, now, limit: 10 });

    assert.equal(result.written, 1);
    const market = store.getUniverseMarket(runId, "condition:forecast-me");
    const forecast = (market?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>;
    assert.equal(forecast.sealed, true);
    assert.equal(forecast.usesVenuePrice, false);
    assert.equal(forecast.method, "screening_forecast_v0");
    assert.ok((forecast.probability as number) > 0.5);
    assert.deepEqual(
      (forecast.evidence as Record<string, unknown>).sourceFields,
      [
        "structuralType",
        "catalystScore",
        "modelabilityScore",
        "resolutionAmbiguityScore",
        "riskScore",
        "reasonCodes",
        "resolutionText",
        "resolutionSource"
      ]
    );
  });
});

test("forecast writer uses exclusive-field base rates and keeps low-confidence screening research-only", async () => {
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
    const eventMarkets = [
      ...Array.from({ length: 20 }, (_, index) => ({
      id: `candidate-${index}`,
      active: true,
      closed: false
      })),
      { id: "closed-candidate", active: "true", closed: "true" },
      { id: "archived-candidate", active: "true", archived: "true" }
    ];
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:exclusive-outsider",
      conditionId: "exclusive-outsider",
      slug: "exclusive-outsider",
      eventSlug: "many-candidate-election",
      title: "Will Candidate 17 win?",
      tags: ["test"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.03, 0.97],
      clobTokenIds: ["yes", "no"],
      yesTokenId: "yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 25_000,
      impliedProb: 0.03,
      bestBid: 0.03,
      bestAsk: 0.031,
      midpoint: 0.0305,
      spreadCents: 0.1,
      negRisk: true,
      structuralType: "single-binary",
      categoryGroup: "politics",
      modelabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 10,
      riskScore: 5,
      researchPriorityScore: 95,
      tradeOpportunityScore: 98,
      tradabilityScore: 95,
      reasonCodes: ["clear_resolution_text", "neg_risk_cluster"],
      disqualifiers: [],
      rawJson: {
        rawGammaEvent: {
          negRisk: true,
          enableNegRisk: true,
          markets: eventMarkets
        }
      }
    }]);

    runIndependentForecastWriter(store, { runId, now, limit: 10 });
    const market = store.getUniverseMarket(runId, "condition:exclusive-outsider");
    const forecast = (market?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>;
    const evidence = forecast.evidence as Record<string, unknown>;
    assert.equal(evidence.baseRateReason, "exclusive_field_uniform_prior");
    assert.equal(evidence.exclusiveGroupSize, 20);
    assert.equal(evidence.confidenceTier, "screening-low");
    assert.equal((evidence.sourceFields as string[]).includes("rawGammaEvent.markets"), true);
    assert.ok((forecast.probability as number) < 0.15);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.equal(result.summary.proposedOrders, 0);
    assert.equal(result.summary.blockerCounts.independent_forecast_low_confidence_screening, 1);
    assert.equal(result.candidates[0]?.action, "research_required");
    assert.equal(result.candidates[0]?.blockers.includes("independent_forecast_low_confidence_screening"), true);
    assert.equal(result.candidates[0]?.reasonCodes.includes("exclusive_group_size:20"), true);
  });
});

test("forecast writer does not treat ordinary multi-market events as exclusive fields", async () => {
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
      marketKey: "condition:ordinary-series-market",
      conditionId: "ordinary-series-market",
      slug: "ordinary-series-market",
      eventSlug: "ordinary-token-launch-deadlines",
      title: "Will Example launch a token by June 30?",
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
      bestAsk: 0.205,
      midpoint: 0.2025,
      spreadCents: 0.5,
      negRisk: false,
      structuralType: "single-binary",
      categoryGroup: "crypto",
      modelabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 10,
      riskScore: 5,
      researchPriorityScore: 95,
      tradeOpportunityScore: 98,
      tradabilityScore: 95,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {
        rawGammaEvent: {
          negRisk: false,
          enableNegRisk: false,
          markets: Array.from({ length: 6 }, (_, index) => ({
            id: `deadline-${index}`,
            active: true,
            closed: false
          }))
        }
      }
    }]);

    runIndependentForecastWriter(store, { runId, now, limit: 10 });
    const market = store.getUniverseMarket(runId, "condition:ordinary-series-market");
    const forecast = (market?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>;
    const evidence = forecast.evidence as Record<string, unknown>;
    assert.equal(evidence.baseRateReason, "binary_balanced_prior");
    assert.equal(evidence.exclusiveGroupSize, undefined);
    assert.equal(evidence.confidenceTier, "screening-medium");
    assert.equal((evidence.sourceFields as string[]).includes("rawGammaEvent.markets"), false);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.notEqual(result.summary.blockerCounts.independent_forecast_low_confidence_screening, 1);
    assert.equal(result.candidates[0]?.blockers.includes("independent_forecast_low_confidence_screening"), false);
  });
});

test("auto-trader treats legacy screening forecasts on exclusive fields as research-only", async () => {
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
      marketKey: "condition:legacy-exclusive",
      conditionId: "legacy-exclusive",
      slug: "legacy-exclusive",
      eventSlug: "legacy-exclusive-field",
      title: "Will Legacy Candidate win?",
      tags: ["test"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.03, 0.97],
      clobTokenIds: ["yes", "no"],
      yesTokenId: "yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 25_000,
      impliedProb: 0.03,
      bestBid: 0.03,
      bestAsk: 0.031,
      midpoint: 0.0305,
      spreadCents: 0.1,
      negRisk: true,
      structuralType: "single-binary",
      categoryGroup: "politics",
      modelabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 10,
      riskScore: 5,
      researchPriorityScore: 95,
      tradeOpportunityScore: 98,
      tradabilityScore: 95,
      reasonCodes: ["clear_resolution_text", "neg_risk_cluster"],
      disqualifiers: [],
      rawJson: {
        rawGammaEvent: {
          negRisk: true,
          enableNegRisk: true,
          markets: Array.from({ length: 20 }, (_, index) => ({
            id: `candidate-${index}`,
            active: true,
            closed: false
          }))
        },
        independentForecast: {
          sealed: true,
          probability: 0.65,
          uncertainty: 0.06,
          forecastedAt: now.toISOString(),
          expiresAt: isoAfter(now, 6),
          numericalChecks: ["legacy_screening_fixture"],
          usesVenuePrice: false,
          method: "screening_forecast_v0"
        }
      }
    }]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.equal(result.summary.proposedOrders, 0);
    assert.equal(result.summary.blockerCounts.independent_forecast_low_confidence_screening, 1);
    assert.equal(result.candidates[0]?.action, "research_required");
    assert.equal(result.candidates[0]?.blockers.includes("independent_forecast_low_confidence_screening"), true);
  });
});

test("forecast writer lets paper auto-trader propose entries under forecast gate", async () => {
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
      marketKey: "condition:paper-ready",
      conditionId: "paper-ready",
      slug: "paper-ready",
      title: "Paper ready",
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
      modelabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 10,
      riskScore: 5,
      researchPriorityScore: 95,
      tradeOpportunityScore: 98,
      tradabilityScore: 95,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {}
    }]);

    const before = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    assert.equal(before.summary.proposedOrders, 0);
    assert.equal(before.candidates[0]?.action, "research_required");

    runIndependentForecastWriter(store, { runId, now, limit: 10 });
    const after = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.equal(after.summary.proposedOrders, 1);
    assert.equal(after.candidates[0]?.action, "paper_buy_yes");
    assert.ok((after.candidates[0]?.forecastEdge?.adjustedEdge ?? 0) >= 0.02);
  });
});

test("forecast writer covers ending-soon planner candidates beyond trade-score leaders", async () => {
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
    const market = (input: { key: string; endHours: number; tradeScore: number }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key,
      slug: input.key,
      title: input.key,
      tags: ["test"],
      outcomes: ["Yes", "No"],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, input.endHours),
      liquidityUsd: 25_000,
      volume24hUsd: 20_000,
      impliedProb: 0.2,
      bestBid: 0.2,
      bestAsk: 0.22,
      midpoint: 0.21,
      spreadCents: 2,
      structuralType: "single-binary",
      categoryGroup: "politics",
      modelabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 10,
      riskScore: 5,
      researchPriorityScore: 95,
      tradeOpportunityScore: input.tradeScore,
      tradabilityScore: 95,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {}
    });
    store.recordUniverseMarkets(runId, [
      ...Array.from({ length: 80 }, (_, index) => market({
        key: `condition:trade-leader-${index}`,
        endHours: 24 * 30,
        tradeScore: 100 - index * 0.01
      })),
      market({ key: "condition:ending-soon", endHours: 12, tradeScore: 60 })
    ]);

    const result = runIndependentForecastWriter(store, { runId, now, limit: 100 });

    assert.equal(result.forecasts.some((forecast) => forecast.marketKey === "condition:ending-soon"), true);
    const endingSoon = store.getUniverseMarket(runId, "condition:ending-soon");
    assert.ok((endingSoon?.rawJson as Record<string, unknown>).independentForecast);
  });
});

test("screening forecasts do not unlock live-mode entries", async () => {
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
      marketKey: "condition:screening-live-blocked",
      conditionId: "screening-live-blocked",
      slug: "screening-live-blocked",
      title: "Screening live blocked",
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
      modelabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 10,
      riskScore: 5,
      researchPriorityScore: 95,
      tradeOpportunityScore: 98,
      tradabilityScore: 95,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: {}
    }]);
    runIndependentForecastWriter(store, { runId, now, limit: 10 });

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      persist: false,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "live_guarded"
      }
    });

    assert.equal(result.summary.proposedOrders, 0);
    assert.equal(result.candidates[0]?.action, "research_required");
    assert.equal(result.candidates[0]?.blockers.includes("independent_forecast_screening_only"), true);
  });
});

test("forecast writer skips existing forecasts unless overwrite is requested", async () => {
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
      marketKey: "condition:existing",
      conditionId: "existing",
      slug: "existing",
      title: "Existing",
      outcomes: ["Yes", "No"],
      clobTokenIds: ["yes", "no"],
      yesTokenId: "yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 25_000,
      spreadCents: 2,
      structuralType: "single-binary",
      modelabilityScore: 80,
      catalystScore: 80,
      resolutionAmbiguityScore: 20,
      riskScore: 10,
      rawJson: {
        independentForecast: {
          sealed: true,
          probability: 0.4,
          uncertainty: 0.1,
          forecastedAt: now.toISOString(),
          expiresAt: isoAfter(now, 6),
          numericalChecks: ["existing"],
          usesVenuePrice: false
        }
      }
    }]);

    const skipped = runIndependentForecastWriter(store, { runId, now, limit: 10 });
    assert.equal(skipped.written, 0);
    assert.equal(skipped.skippedExisting, 1);
    assert.equal(((store.getUniverseMarket(runId, "condition:existing")?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>).probability, 0.4);

    const overwritten = runIndependentForecastWriter(store, { runId, now, limit: 10, overwrite: true });
    assert.equal(overwritten.written, 1);
    assert.notEqual(((store.getUniverseMarket(runId, "condition:existing")?.rawJson as Record<string, unknown>).independentForecast as Record<string, unknown>).probability, 0.4);
  });
});
