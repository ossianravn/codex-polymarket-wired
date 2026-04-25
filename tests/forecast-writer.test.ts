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
