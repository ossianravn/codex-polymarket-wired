import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAutoTradingExecutionGate,
  compactAutoTradingIterationResult,
  runAutoTradingIteration
} from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-autotrader-"));
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

function independentForecastRawJson(
  price: number,
  input: {
    probability?: number;
    uncertainty?: number;
    forecastedAt?: string;
    expiresAt?: string;
    sealed?: boolean;
    usesVenuePrice?: boolean;
    numericalChecks?: string[];
  } = {}
): Record<string, unknown> {
  return {
    independentForecast: {
      sealed: input.sealed ?? true,
      probability: input.probability ?? Number(Math.min(0.98, price + 0.18).toFixed(4)),
      uncertainty: input.uncertainty ?? 0.02,
      forecastedAt: input.forecastedAt ?? "2026-04-24T00:00:00.000Z",
      expiresAt: input.expiresAt ?? "2026-04-30T00:00:00.000Z",
      numericalChecks: input.numericalChecks ?? ["fixture_base_rate_check"],
      usesVenuePrice: input.usesVenuePrice ?? false
    }
  };
}

test("auto-trader creates paper session and filters markets by mandate timeframe", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "markets_keyset",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });

    const market = (input: {
      key: string;
      title: string;
      endHours: number;
      liquidity: number;
      spread: number;
      price: number;
      researchScore?: number;
      tradabilityScore?: number;
      resolutionAmbiguityScore?: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      title: input.title,
      category: "politics",
      tags: ["politics"],
      outcomes: ["Yes", "No"],
      outcomePrices: [input.price, Number((1 - input.price).toFixed(4))],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, input.endHours),
      liquidityUsd: input.liquidity,
      volume24hUsd: 2000,
      impliedProb: input.price,
      bestBid: Number(Math.max(0.001, input.price - input.spread / 200).toFixed(4)),
      bestAsk: Number(Math.min(0.999, input.price + input.spread / 200).toFixed(4)),
      midpoint: input.price,
      spreadCents: input.spread,
      categoryGroup: "politics",
      structuralType: "single-binary",
      horizonBucket: "short-0-7d",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "execution-ready",
      modelabilityScore: 78,
      tradabilityScore: input.tradabilityScore ?? 78,
      catalystScore: 82,
      resolutionAmbiguityScore: input.resolutionAmbiguityScore ?? 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: input.researchScore ?? 80,
      tradeOpportunityScore: 78,
      makerScore: 55,
      riskScore: 18,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(input.price)
    });

    store.recordUniverseMarkets(runId, [
      market({ key: "condition:short-clean", title: "Short clean market", endHours: 48, liquidity: 50_000, spread: 2, price: 0.42 }),
      market({ key: "condition:six-months", title: "Six-month market", endHours: 24 * 180, liquidity: 80_000, spread: 2, price: 0.44 }),
      market({ key: "condition:wide", title: "Wide spread market", endHours: 24, liquidity: 60_000, spread: 12, price: 0.40 }),
      market({ key: "condition:ambiguous", title: "Ambiguous market", endHours: 24, liquidity: 60_000, spread: 2, price: 0.40, resolutionAmbiguityScore: 85 })
    ]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 10,
      mandate: {
        budgetUsdc: 50,
        timeframeHours: 72,
        riskProfile: "conservative",
        mode: "paper"
      }
    });

    assert.equal(result.summary.mode, "paper");
    assert.equal(result.summary.proposedOrders, 1);
    assert.equal(result.summary.proposedBudgetUsdc, 4);
    assert.equal(result.candidates[0]?.marketKey, "condition:short-clean");
    assert.equal(result.candidates[0]?.action, "paper_buy_yes");
    assert.ok(result.candidates.every((decision) => decision.action !== "paper_buy_yes" || decision.marketKey !== "condition:six-months"));
    assert.ok(result.candidates.find((decision) => decision.marketKey === "condition:six-months")?.blockers.includes("outside_session_timeframe"));
    const compact = compactAutoTradingIterationResult(result);
    assert.equal(compact.candidates[0]?.marketKey, "condition:short-clean");
    assert.equal(compact.candidates[0]?.market?.liquidityUsd, 50_000);
    assert.equal("rawJson" in (compact.candidates[0]?.market ?? {}), false);

    const session = store.getAutoTradingSession(result.session.sessionId);
    assert.equal(session?.budgetUsdc, 50);
    assert.equal(session?.riskProfile, "conservative");
    const decisions = store.listAutoTradingDecisions({ sessionId: result.session.sessionId, limit: 20 });
    assert.equal(decisions.length, result.candidates.length);
    assert.equal(decisions.find((decision) => decision.marketKey === "condition:short-clean")?.action, "paper_buy_yes");
  });
});

test("auto-trader blocks heuristic-only entries until independent fair value exists", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "markets_keyset",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });

    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:heuristic-only",
      conditionId: "heuristic-only",
      slug: "heuristic-only",
      title: "High-scoring market without independent forecast",
      category: "politics",
      tags: ["politics"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.42, 0.58],
      clobTokenIds: ["condition:heuristic-only:yes", "condition:heuristic-only:no"],
      yesTokenId: "condition:heuristic-only:yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 10_000,
      impliedProb: 0.42,
      bestBid: 0.42,
      bestAsk: 0.44,
      midpoint: 0.43,
      spreadCents: 2,
      categoryGroup: "politics",
      structuralType: "single-binary",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "execution-ready",
      modelabilityScore: 85,
      tradabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 70,
      crossMarketScore: 30,
      researchPriorityScore: 90,
      tradeOpportunityScore: 95,
      makerScore: 50,
      riskScore: 10,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: {}
    }]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    const decision = result.candidates.find((candidate) => candidate.marketKey === "condition:heuristic-only");
    assert.equal(decision?.action, "research_required");
    assert.equal(decision?.status, "research");
    assert.equal(decision?.blockers.includes("missing_independent_forecast"), true);
    assert.equal(result.summary.proposedOrders, 0);
    assert.equal(result.ledger.fills.length, 0);
  });
});

test("auto-trader persists paper fills and spends from ledger on later iterations", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const market = (runId: string, input: {
      key: string;
      title: string;
      eventSlug: string;
      price: number;
      tradeScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.title,
      category: "sports",
      tags: ["sports"],
      outcomes: ["Yes", "No"],
      outcomePrices: [input.price, Number((1 - input.price).toFixed(4))],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 40_000,
      volume24hUsd: 90_000,
      impliedProb: input.price,
      bestBid: input.price,
      bestAsk: Number(Math.min(0.99, input.price + 0.02).toFixed(4)),
      midpoint: input.price,
      spreadCents: 2,
      categoryGroup: "sports",
      structuralType: "live-sports",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 82,
      catalystScore: 90,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 82,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(input.price)
    });

    const runId1 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId1, [
      market(runId1, { key: "condition:first", title: "First event", eventSlug: "event-one", price: 0.3, tradeScore: 92 })
    ]);

    const first = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 6,
        maxEventExposureUsdc: 6
      }
    });

    assert.equal(first.summary.proposedOrders, 1);
    assert.equal(first.summary.spentUsdc, 6);
    assert.equal(first.summary.remainingBudgetUsdc, 4);
    assert.equal(first.ledger.fills.length, 1);
    assert.equal(first.ledger.positions.length, 1);

    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const runId2 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: later.toISOString(),
      completedAt: later.toISOString()
    });
    store.recordUniverseMarkets(runId2, [
      market(runId2, { key: "condition:first", title: "First event", eventSlug: "event-one", price: 0.4, tradeScore: 93 }),
      market(runId2, { key: "condition:second", title: "Second event", eventSlug: "event-two", price: 0.25, tradeScore: 91 })
    ]);

    const second = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: later,
      limit: 4
    });

    assert.equal(second.candidates.find((candidate) => candidate.marketKey === "condition:first")?.action, "monitor");
    assert.ok(second.candidates.find((candidate) => candidate.marketKey === "condition:first")?.blockers.includes("event_position_cap_reached"));
    assert.equal(second.candidates.find((candidate) => candidate.marketKey === "condition:second")?.action, "paper_buy_yes");
    assert.equal(second.summary.spentUsdc, 10);
    assert.equal(second.summary.remainingBudgetUsdc, 0);
    assert.equal(second.ledger.fills.length, 2);
    assert.equal(second.ledger.summary.openPositionCount, 2);
    assert.ok((second.ledger.positions.find((position) => position.marketKey === "condition:first")?.unrealizedPnlUsdc ?? 0) > 0);
  });
});

test("auto-trader records missed paper orders without spending ledger budget", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:wide-paper-miss",
      conditionId: "wide-paper-miss",
      slug: "wide-paper-miss",
      eventSlug: "paper-miss-event",
      eventTitle: "Paper miss event",
      title: "Wide paper miss market",
      category: "sports",
      tags: ["sports"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.4, 0.6],
      clobTokenIds: ["wide-miss-yes", "wide-miss-no"],
      yesTokenId: "wide-miss-yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 40_000,
      volume24hUsd: 90_000,
      impliedProb: 0.4,
      bestBid: 0.38,
      bestAsk: 0.42,
      midpoint: 0.4,
      spreadCents: 4,
      categoryGroup: "sports",
      structuralType: "live-sports",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "wide-3-8c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 82,
      catalystScore: 90,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 82,
      tradeOpportunityScore: 92,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.4)
    }]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 6,
        maxSpreadCents: 8
      }
    });

    assert.equal(result.candidates[0]?.action, "paper_buy_yes");
    assert.equal(result.summary.proposedOrders, 1);
    assert.equal(result.summary.spentUsdc, 0);
    assert.equal(result.summary.remainingBudgetUsdc, 10);
    assert.equal(result.ledger.fills.length, 0);
    assert.equal(result.ledger.positions.length, 0);
    assert.equal(result.ledger.orders?.length, 1);
    assert.equal(result.ledger.orders?.[0]?.status, "missed");
    assert.deepEqual(result.ledger.orders?.[0]?.metadata.reasonCodes, ["limit_not_executable"]);
    const report = store.getPaperTradingExecutionReport({ sessionId: result.session.sessionId });
    assert.equal(report.orderCount, 1);
    assert.equal(report.missedCount, 1);
    assert.equal(report.fullFillCount, 0);
    assert.equal(report.filledNotionalUsdc, 0);
    assert.equal(report.requestedNotionalUsdc, result.ledger.orders?.[0]?.requestedNotionalUsdc);
    assert.equal(report.notionalFillRate, 0);
    assert.equal(report.reasonCodeCounts.limit_not_executable, 1);
  });
});

test("state store resets paper ledger while keeping decision history unless requested", async () => {
  await withTempStore((store) => {
    const session = store.createAutoTradingSession({
      sessionId: "reset-paper-session",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 10,
      timeframeHours: 24,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    const decision = store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:reset-test",
      action: "paper_buy_yes",
      status: "proposed",
      allocatedBudgetUsdc: 5,
      targetPrice: 0.5,
      reasonCodes: [],
      blockers: []
    });
    store.recordPaperTradingOrder({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      decisionId: decision.decisionId,
      marketKey: "condition:reset-test",
      side: "buy_yes",
      limitPrice: 0.5,
      requestedShares: 10,
      requestedNotionalUsdc: 5,
      filledShares: 10,
      filledNotionalUsdc: 5,
      status: "filled"
    });
    store.recordPaperTradingFill({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      decisionId: decision.decisionId,
      marketKey: "condition:reset-test",
      side: "buy_yes",
      price: 0.5,
      shares: 10,
      costUsdc: 5
    });

    const firstReset = store.resetPaperTradingSession(session.sessionId);
    assert.equal(firstReset.deletedOrders, 1);
    assert.equal(firstReset.deletedFills, 1);
    assert.equal(firstReset.deletedPositions, 1);
    assert.equal(firstReset.deletedDecisions, 0);
    assert.equal(store.getPaperTradingLedger(session.sessionId).summary.spentUsdc, 0);
    assert.equal(store.listAutoTradingDecisions({ sessionId: session.sessionId }).length, 1);

    const secondReset = store.resetPaperTradingSession(session.sessionId, { clearDecisions: true });
    assert.equal(secondReset.deletedDecisions, 1);
    assert.equal(store.listAutoTradingDecisions({ sessionId: session.sessionId }).length, 0);
  });
});

test("state store refuses to reset non-paper auto-trading sessions", async () => {
  await withTempStore((store) => {
    const session = store.createAutoTradingSession({
      sessionId: "live-session",
      status: "active",
      mode: "live_guarded",
      riskProfile: "aggressive",
      budgetUsdc: 10,
      timeframeHours: 24,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "live_guarded"
      }
    });
    assert.throws(
      () => store.resetPaperTradingSession(session.sessionId),
      /Refusing to reset non-paper/
    );
  });
});

test("auto-trader exits paper positions on take profit and realizes PnL", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const market = (runId: string, price: number) => ({
      runId,
      marketKey: "condition:take-profit",
      conditionId: "take-profit",
      slug: "take-profit",
      eventSlug: "profit-event",
      eventTitle: "Profit event",
      title: "Take profit market",
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [price, Number((1 - price).toFixed(4))],
      clobTokenIds: ["profit-yes", "profit-no"],
      yesTokenId: "profit-yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 20_000,
      impliedProb: price,
      bestBid: price,
      bestAsk: Number(Math.min(0.99, price + 0.02).toFixed(4)),
      midpoint: price,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "single-binary",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "execution-ready",
      modelabilityScore: 80,
      tradabilityScore: 85,
      catalystScore: 85,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 84,
      tradeOpportunityScore: 92,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(price)
    });

    const runId1 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId1, [market(runId1, 0.5)]);

    const first = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "balanced",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5,
        takeProfitPct: 20
      }
    });

    assert.equal(first.summary.proposedOrders, 1);
    assert.equal(first.summary.openPositions, 1);

    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const runId2 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: later.toISOString(),
      completedAt: later.toISOString()
    });
    store.recordUniverseMarkets(runId2, [market(runId2, 0.65)]);

    const second = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: later,
      limit: 4
    });

    const exit = second.candidates.find((candidate) => candidate.action === "paper_sell_yes");
    assert.equal(second.summary.exitOrders, 1);
    assert.equal(exit?.marketKey, "condition:take-profit");
    assert.ok(exit?.reasonCodes.includes("take_profit"));
    assert.equal(second.summary.openPositions, 0);
    assert.equal(second.ledger.summary.closedPositionCount, 1);
    assert.equal(second.ledger.summary.realizedProceedsUsdc, 6.5);
    assert.equal(second.ledger.summary.realizedPnlUsdc, 1.5);
    assert.equal(second.ledger.summary.remainingBudgetUsdc, 11.5);
  });
});

test("auto-trader waits through stop-loss grace before exiting fresh paper positions", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const market = (runId: string, capturedAt: Date, price: number) => ({
      runId,
      marketKey: "condition:fresh-stop",
      conditionId: "fresh-stop",
      slug: "fresh-stop",
      eventSlug: "fresh-stop-event",
      eventTitle: "Fresh stop event",
      title: "Fresh stop-loss market",
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [price, Number((1 - price).toFixed(4))],
      clobTokenIds: ["fresh-stop-yes", "fresh-stop-no"],
      yesTokenId: "fresh-stop-yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 20_000,
      impliedProb: price,
      bestBid: price,
      bestAsk: Number(Math.min(0.99, price + 0.02).toFixed(4)),
      midpoint: price,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "single-binary",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "execution-ready",
      modelabilityScore: 80,
      tradabilityScore: 85,
      catalystScore: 85,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 84,
      tradeOpportunityScore: 92,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(price, { forecastedAt: capturedAt.toISOString() }),
      capturedAt: capturedAt.toISOString()
    });

    const runId1 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId1, [market(runId1, now, 0.5)]);

    const first = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5,
        positionStopLossPct: 10,
        positionStopLossGraceMinutes: 30,
        paperReentryCooldownMinutes: 60,
        timeExitHours: 0
      }
    });

    assert.equal(first.summary.proposedOrders, 1);

    const insideGrace = new Date(now.getTime() + 5 * 60 * 1000);
    const runId2 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: insideGrace.toISOString(),
      completedAt: insideGrace.toISOString()
    });
    store.recordUniverseMarkets(runId2, [market(runId2, insideGrace, 0.41)]);

    const second = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: insideGrace,
      limit: 4
    });

    assert.equal(second.summary.exitOrders, 0);
    assert.equal(second.summary.openPositions, 1);
    assert.equal(second.candidates.some((candidate) => candidate.action === "paper_sell_yes"), false);

    const afterGrace = new Date(now.getTime() + 31 * 60 * 1000);
    const runId3 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: afterGrace.toISOString(),
      completedAt: afterGrace.toISOString()
    });
    store.recordUniverseMarkets(runId3, [market(runId3, afterGrace, 0.41)]);

    const third = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: afterGrace,
      limit: 4
    });

    const exit = third.candidates.find((candidate) => candidate.action === "paper_sell_yes");
    assert.equal(third.summary.exitOrders, 1);
    assert.equal(exit?.marketKey, "condition:fresh-stop");
    assert.ok(exit?.reasonCodes.includes("position_stop_loss"));

    const insideReentryCooldown = new Date(afterGrace.getTime() + 5 * 60 * 1000);
    const runId4 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: insideReentryCooldown.toISOString(),
      completedAt: insideReentryCooldown.toISOString()
    });
    store.recordUniverseMarkets(runId4, [market(runId4, insideReentryCooldown, 0.41)]);

    const fourth = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: insideReentryCooldown,
      limit: 4
    });
    const reentryCandidate = fourth.candidates.find((candidate) => candidate.marketKey === "condition:fresh-stop");
    assert.equal(fourth.summary.proposedOrders, 0);
    assert.equal(reentryCandidate?.action, "monitor");
    assert.ok(reentryCandidate?.blockers.includes("paper_recent_stop_loss_reentry_cooldown"));
  });
});

test("auto-trader blocks new paper buys after session stop loss", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const market = (runId: string, input: {
      key: string;
      eventSlug: string;
      price: number;
      tradeScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.key,
      category: "sports",
      tags: ["sports"],
      outcomes: ["Yes", "No"],
      outcomePrices: [input.price, Number((1 - input.price).toFixed(4))],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 20_000,
      impliedProb: input.price,
      bestBid: input.price,
      bestAsk: Number(Math.min(0.99, input.price + 0.02).toFixed(4)),
      midpoint: input.price,
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
      catalystScore: 85,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 84,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(input.price)
    });

    const runId1 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId1, [
      market(runId1, { key: "condition:loser", eventSlug: "event-loser", price: 0.5, tradeScore: 92 })
    ]);

    const first = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5,
        stopLossUsdc: 1,
        positionStopLossPct: 80
      }
    });

    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const runId2 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: later.toISOString(),
      completedAt: later.toISOString()
    });
    store.recordUniverseMarkets(runId2, [
      market(runId2, { key: "condition:loser", eventSlug: "event-loser", price: 0.3, tradeScore: 93 }),
      market(runId2, { key: "condition:fresh", eventSlug: "event-fresh", price: 0.4, tradeScore: 94 })
    ]);

    const second = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: later,
      limit: 4
    });

    assert.equal(second.summary.riskBlockedNewBuys, true);
    assert.equal(second.summary.proposedOrders, 0);
    assert.ok(second.candidates.find((candidate) => candidate.marketKey === "condition:fresh")?.blockers.includes("session_stop_loss_reached"));
    assert.ok(second.summary.unrealizedPnlUsdc < -1);
  });
});

test("auto-trader allocates limited budget by final decision score, not raw universe order", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    const market = (input: {
      key: string;
      eventSlug: string;
      tradeOpportunityScore: number;
      researchPriorityScore: number;
      tradabilityScore: number;
      catalystScore: number;
      riskScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.key,
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.5, 0.5],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 10_000,
      impliedProb: 0.5,
      bestBid: 0.49,
      bestAsk: 0.51,
      midpoint: 0.5,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "threshold-range",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: input.tradabilityScore,
      catalystScore: input.catalystScore,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 50,
      crossMarketScore: 20,
      researchPriorityScore: input.researchPriorityScore,
      tradeOpportunityScore: input.tradeOpportunityScore,
      makerScore: 50,
      riskScore: input.riskScore,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.5)
    });
    store.recordUniverseMarkets(runId, [
      market({
        key: "condition:raw-first-lower-final-score",
        eventSlug: "raw-first",
        tradeOpportunityScore: 100,
        researchPriorityScore: 50,
        tradabilityScore: 50,
        catalystScore: 50,
        riskScore: 20
      }),
      market({
        key: "condition:raw-second-higher-final-score",
        eventSlug: "raw-second",
        tradeOpportunityScore: 80,
        researchPriorityScore: 100,
        tradabilityScore: 100,
        catalystScore: 100,
        riskScore: 5
      })
    ]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 5,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5
      }
    });

    assert.equal(result.summary.proposedOrders, 1);
    assert.equal(result.candidates.find((candidate) => candidate.action === "paper_buy_yes")?.marketKey, "condition:raw-second-higher-final-score");
    assert.equal(result.candidates.find((candidate) => candidate.marketKey === "condition:raw-first-lower-final-score")?.blockers.includes("budget_exhausted"), true);
  });
});

test("auto-trader leaves sub-minimum leftover budget idle instead of creating dust paper orders", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    const market = (input: { key: string; eventSlug: string; tradeScore: number }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.key,
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.5, 0.5],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 10_000,
      impliedProb: 0.5,
      bestBid: 0.49,
      bestAsk: 0.51,
      midpoint: 0.5,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "threshold-range",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 50,
      crossMarketScore: 20,
      researchPriorityScore: 90,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 50,
      riskScore: 10,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.5)
    });
    store.recordUniverseMarkets(runId, [
      market({ key: "condition:first-full-order", eventSlug: "first-event", tradeScore: 95 }),
      market({ key: "condition:dust-leftover", eventSlug: "second-event", tradeScore: 90 })
    ]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 5.5,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5,
        minOrderUsdc: 1
      }
    });

    const proposed = result.candidates.filter((candidate) => candidate.action === "paper_buy_yes");
    assert.equal(proposed.length, 1);
    assert.equal(proposed[0]?.marketKey, "condition:first-full-order");
    assert.equal(result.summary.proposedBudgetUsdc, 5);
    assert.equal(result.summary.remainingBudgetUsdc, 0.5);
    assert.equal(result.candidates.find((candidate) => candidate.marketKey === "condition:dust-leftover")?.blockers.includes("remaining_budget_below_min_order"), true);
  });
});

test("auto-trader exits legacy dust paper positions during hygiene cleanup", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const sessionBootstrap = runAutoTradingIteration(store, {
      now,
      mandate: {
        budgetUsdc: 5,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        minOrderUsdc: 1
      }
    });

    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:legacy-dust",
      conditionId: "legacy-dust",
      slug: "legacy-dust",
      eventSlug: "legacy-dust-event",
      eventTitle: "legacy dust event",
      title: "Legacy dust market",
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.5, 0.5],
      clobTokenIds: ["legacy-dust:yes", "legacy-dust:no"],
      yesTokenId: "legacy-dust:yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 10_000,
      impliedProb: 0.5,
      bestBid: 0.5,
      bestAsk: 0.52,
      midpoint: 0.51,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "threshold-range",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 90,
      catalystScore: 90,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 50,
      crossMarketScore: 20,
      researchPriorityScore: 90,
      tradeOpportunityScore: 95,
      makerScore: 50,
      riskScore: 10,
      reasonCodes: ["clear_resolution_text"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.5)
    }]);

    store.recordPaperTradingFill({
      sessionId: sessionBootstrap.session.sessionId,
      marketKey: "condition:legacy-dust",
      title: "Legacy dust market",
      side: "buy_yes",
      price: 0.5,
      shares: 1,
      costUsdc: 0.5,
      filledAt: now.toISOString(),
      metadata: {
        eventKey: "eventSlug:legacy-dust-event",
        tokenId: "legacy-dust:yes",
        score: 95,
        mode: "paper",
        endDate: isoAfter(now, 12)
      }
    });

    const result = runAutoTradingIteration(store, {
      sessionId: sessionBootstrap.session.sessionId,
      now: new Date(now.getTime() + 60 * 1000),
      limit: 4
    });

    const hygieneExit = result.candidates.find((candidate) => candidate.action === "paper_sell_yes");
    assert.equal(result.summary.exitOrders, 1);
    assert.equal(hygieneExit?.marketKey, "condition:legacy-dust");
    assert.ok(hygieneExit?.reasonCodes.includes("paper_hygiene_dust_position"));
    assert.equal(result.ledger.summary.openPositionCount, 0);
    assert.equal(result.ledger.summary.closedPositionCount, 1);
    assert.equal(result.ledger.summary.remainingBudgetUsdc, 5);
  });
});

test("auto-trader rotates paper budget by exiting weak positions for stronger candidates", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const market = (runId: string, input: {
      key: string;
      eventSlug: string;
      price: number;
      tradeScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.key,
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [input.price, Number((1 - input.price).toFixed(4))],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 25_000,
      impliedProb: input.price,
      bestBid: input.price,
      bestAsk: Number(Math.min(0.99, input.price + 0.02).toFixed(4)),
      midpoint: input.price,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "threshold-range",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 84,
      catalystScore: 88,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 84,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.5)
    });

    const runId1 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId1, [
      market(runId1, { key: "condition:weak-held", eventSlug: "weak-held", price: 0.5, tradeScore: 60 })
    ]);

    const first = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 5,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5
      }
    });

    assert.equal(first.summary.proposedOrders, 1);
    assert.equal(first.summary.remainingBudgetUsdc, 0);

    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const runId2 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: later.toISOString(),
      completedAt: later.toISOString()
    });
    store.recordUniverseMarkets(runId2, [
      market(runId2, { key: "condition:weak-held", eventSlug: "weak-held", price: 0.45, tradeScore: 60 }),
      market(runId2, { key: "condition:strong-fresh", eventSlug: "strong-fresh", price: 0.42, tradeScore: 98 })
    ]);

    const second = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: later,
      limit: 4
    });

    const rotationExit = second.candidates.find((candidate) => candidate.action === "paper_sell_yes");
    assert.equal(second.summary.exitOrders, 1);
    assert.equal(rotationExit?.marketKey, "condition:weak-held");
    assert.ok(rotationExit?.reasonCodes.includes("budget_rotation"));
    assert.equal(second.candidates.find((candidate) => candidate.marketKey === "condition:strong-fresh")?.blockers.includes("budget_exhausted"), true);
    assert.equal(second.summary.openPositions, 0);
    assert.equal(second.summary.remainingBudgetUsdc, 4.5);
    assert.equal(second.summary.nextRunAt, isoAfter(later, 5 / 60));

    const redeployAt = new Date(later.getTime() + 60 * 1000);
    const third = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: redeployAt,
      limit: 4
    });

    const redeploy = third.candidates.find((candidate) => candidate.action === "paper_buy_yes");
    assert.equal(redeploy?.marketKey, "condition:strong-fresh");
    assert.equal(third.summary.spentUsdc, 5);
    assert.equal(third.summary.remainingBudgetUsdc, 0);
    assert.ok(third.ledger.summary.spentUsdc <= third.ledger.summary.budgetUsdc);
  });
});

test("auto-trader rotates same-event paper exposure when a stronger candidate is event-capped", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const market = (runId: string, input: {
      key: string;
      eventSlug: string;
      price: number;
      tradeScore: number;
      researchScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.key,
      category: "politics",
      tags: ["politics"],
      outcomes: ["Yes", "No"],
      outcomePrices: [input.price, Number((1 - input.price).toFixed(4))],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 12),
      liquidityUsd: 50_000,
      volume24hUsd: 30_000,
      impliedProb: input.price,
      bestBid: input.price,
      bestAsk: Number(Math.min(0.99, input.price + 0.02).toFixed(4)),
      midpoint: input.price,
      spreadCents: 2,
      categoryGroup: "politics",
      structuralType: "threshold-range",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 84,
      catalystScore: 88,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: input.researchScore,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(input.price)
    });

    const runId1 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId1, [
      market(runId1, {
        key: "condition:shared-weaker",
        eventSlug: "shared-event",
        price: 0.48,
        tradeScore: 70,
        researchScore: 70
      })
    ]);

    const first = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 5,
        maxEventPositions: 1,
        maxEventExposureUsdc: 10
      }
    });

    assert.equal(first.summary.proposedOrders, 1);

    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const runId2 = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: later.toISOString(),
      completedAt: later.toISOString()
    });
    store.recordUniverseMarkets(runId2, [
      market(runId2, {
        key: "condition:shared-weaker",
        eventSlug: "shared-event",
        price: 0.47,
        tradeScore: 70,
        researchScore: 70
      }),
      market(runId2, {
        key: "condition:shared-stronger",
        eventSlug: "shared-event",
        price: 0.35,
        tradeScore: 98,
        researchScore: 98
      })
    ]);

    const second = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: later,
      limit: 4
    });

    const eventExit = second.candidates.find((candidate) => candidate.action === "paper_sell_yes");
    assert.equal(second.summary.exitOrders, 1);
    assert.equal(eventExit?.marketKey, "condition:shared-weaker");
    assert.ok(eventExit?.reasonCodes.includes("event_rotation"));
    assert.equal(second.candidates.find((candidate) => candidate.marketKey === "condition:shared-stronger")?.blockers.includes("event_position_cap_reached"), true);

    const redeployAt = new Date(later.getTime() + 60 * 1000);
    const third = runAutoTradingIteration(store, {
      sessionId: first.session.sessionId,
      now: redeployAt,
      limit: 4
    });

    assert.equal(third.candidates.find((candidate) => candidate.action === "paper_buy_yes")?.marketKey, "condition:shared-stronger");
    assert.equal(third.ledger.summary.openPositionCount, 1);
  });
});

test("auto-trader uses live actions and gates live guarded previews behind approval", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:live-guarded",
      conditionId: "live-guarded",
      slug: "live-guarded",
      eventSlug: "live-guarded-event",
      eventTitle: "Live guarded event",
      title: "Live guarded market",
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.42, 0.58],
      clobTokenIds: ["live-yes", "live-no"],
      yesTokenId: "live-yes",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 10),
      liquidityUsd: 50_000,
      volume24hUsd: 20_000,
      impliedProb: 0.42,
      bestBid: 0.42,
      bestAsk: 0.44,
      midpoint: 0.43,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "single-binary",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "execution-ready",
      modelabilityScore: 80,
      tradabilityScore: 86,
      catalystScore: 88,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 86,
      tradeOpportunityScore: 94,
      makerScore: 50,
      riskScore: 15,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.42)
    }]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 4,
      mandate: {
        budgetUsdc: 20,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "live_guarded",
        maxSingleOrderUsdc: 5,
        maxEventExposureUsdc: 5
      }
    });

    assert.equal(result.summary.proposedOrders, 1);
    assert.equal(result.candidates[0]?.action, "live_buy_yes");
    assert.equal(result.ledger.fills.length, 0);
    const decision = store.listAutoTradingDecisions({ sessionId: result.session.sessionId, limit: 1 })[0];
    assert.ok(decision);
    const gate = buildAutoTradingExecutionGate(result.session, decision);
    assert.equal(gate.canPreview, true);
    assert.equal(gate.requiresApproval, true);
    assert.equal(gate.canSubmitAutonomously, false);
    assert.equal(gate.previewRequest?.side, "BUY");
    assert.equal(gate.previewRequest?.tokenId, "live-yes");
  });
});

test("auto-trader allows autonomous gate only for live autonomous sessions", async () => {
  await withTempStore((store) => {
    const session = store.createAutoTradingSession({
      sessionId: "session-live-autonomous",
      mode: "live_autonomous",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      mandate: {
        mode: "live_autonomous",
        riskProfile: "aggressive",
        budgetUsdc: 30,
        timeframeHours: 24
      }
    });
    const decision = store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:auto",
      title: "Autonomous market",
      action: "live_sell_yes",
      status: "proposed",
      score: 100,
      allocatedBudgetUsdc: 8,
      targetPrice: 0.8,
      payload: {
        tokenId: "auto-yes",
        shares: 10
      }
    });

    const gate = buildAutoTradingExecutionGate(session, decision);
    assert.equal(gate.canPreview, true);
    assert.equal(gate.requiresApproval, false);
    assert.equal(gate.canSubmitAutonomously, true);
    assert.equal(gate.previewRequest?.side, "SELL");
    assert.equal(gate.previewRequest?.size, 10);
  });
});

test("auto-trader execution gate blocks paper sessions from live execution", async () => {
  await withTempStore((store) => {
    const session = store.createAutoTradingSession({
      sessionId: "session-paper",
      mode: "paper",
      riskProfile: "balanced",
      budgetUsdc: 30,
      timeframeHours: 24,
      mandate: {
        mode: "paper",
        riskProfile: "balanced",
        budgetUsdc: 30,
        timeframeHours: 24
      }
    });
    const decision = store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:paper",
      title: "Paper market",
      action: "paper_buy_yes",
      status: "proposed",
      score: 90,
      allocatedBudgetUsdc: 5,
      targetPrice: 0.5,
      payload: {
        tokenId: "paper-yes",
        shares: 10
      }
    });

    const gate = buildAutoTradingExecutionGate(session, decision);
    assert.equal(gate.canPreview, false);
    assert.equal(gate.canSubmitAutonomously, false);
    assert.ok(gate.blockers.includes("paper_session_no_live_execution"));
  });
});

test("auto-trader decision payload can persist execution audit state", async () => {
  await withTempStore((store) => {
    const session = store.createAutoTradingSession({
      sessionId: "session-audit",
      mode: "live_guarded",
      riskProfile: "balanced",
      budgetUsdc: 30,
      timeframeHours: 24,
      mandate: {
        mode: "live_guarded",
        riskProfile: "balanced",
        budgetUsdc: 30,
        timeframeHours: 24
      }
    });
    const decision = store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:audit",
      title: "Audit market",
      action: "live_buy_yes",
      status: "proposed",
      score: 90,
      allocatedBudgetUsdc: 5,
      targetPrice: 0.5,
      payload: {
        tokenId: "audit-yes",
        shares: 10
      }
    });

    const updated = store.updateAutoTradingDecisionPayload(decision.decisionId, {
      execution: {
        status: "awaiting_approval",
        previewId: "preview-1"
      },
      executionHistory: [{
        status: "awaiting_approval",
        previewId: "preview-1"
      }]
    });

    assert.equal(updated.action, "live_buy_yes");
    assert.equal(updated.status, "proposed");
    assert.equal(updated.payload.tokenId, "audit-yes");
    assert.deepEqual(updated.payload.execution, {
      status: "awaiting_approval",
      previewId: "preview-1"
    });
    assert.equal((updated.payload.executionHistory as unknown[]).length, 1);
  });
});

test("auto-trader includes ending-soon markets beyond the top opportunity pool", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "markets_keyset",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });

    const market = (input: {
      key: string;
      title: string;
      endHours: number;
      tradeScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      title: input.title,
      category: "sports",
      tags: ["sports"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.24, 0.76],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, input.endHours),
      liquidityUsd: 25_000,
      volume24hUsd: 5000,
      impliedProb: 0.24,
      bestBid: 0.235,
      bestAsk: 0.245,
      midpoint: 0.24,
      spreadCents: 1,
      categoryGroup: "sports",
      structuralType: "single-binary",
      horizonBucket: input.endHours <= 48 ? "short-0-7d" : "medium-31-120d",
      priceBucket: "cheap-10-30c",
      liquidityBucket: "tradable",
      spreadBucket: "tight-0-1c",
      opportunityMode: "execution-ready",
      modelabilityScore: 80,
      tradabilityScore: 80,
      catalystScore: 85,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 82,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 55,
      riskScore: 18,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.24)
    });

    store.recordUniverseMarkets(runId, [
      ...Array.from({ length: 260 }, (_, index) => market({
        key: `condition:long-${index}`,
        title: `Long horizon market ${index}`,
        endHours: 24 * 90,
        tradeScore: 99
      })),
      market({
        key: "condition:near-valid",
        title: "Near-term valid market",
        endHours: 18,
        tradeScore: 60
      })
    ]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.equal(result.candidates[0]?.marketKey, "condition:near-valid");
    assert.equal(result.candidates[0]?.action, "paper_buy_yes");
    assert.equal(result.summary.proposedOrders, 1);
  });
});

test("auto-trader pages past stale ending-soon rows to find eligible same-day markets", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T12:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });

    const market = (input: {
      key: string;
      title: string;
      endHours: number;
      tradeScore: number;
      volume24hUsd: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.key.replace("condition:", ""),
      eventTitle: input.title,
      title: input.title,
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.24, 0.76],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, input.endHours),
      liquidityUsd: 25_000,
      volume24hUsd: input.volume24hUsd,
      impliedProb: 0.24,
      bestBid: 0.235,
      bestAsk: 0.245,
      midpoint: 0.24,
      spreadCents: 1,
      categoryGroup: "crypto",
      structuralType: "threshold-range",
      horizonBucket: input.endHours <= 24 ? "resolves-today" : "short-0-7d",
      priceBucket: "cheap-10-30c",
      liquidityBucket: "tradable",
      spreadBucket: "tight-0-1c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 78,
      tradabilityScore: 80,
      catalystScore: 85,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 78,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 55,
      riskScore: 18,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.24)
    });

    store.recordUniverseMarkets(runId, [
      ...Array.from({ length: 650 }, (_, index) => market({
        key: `condition:stale-${index}`,
        title: `Already-ended market ${index}`,
        endHours: -2,
        tradeScore: 99,
        volume24hUsd: 100_000
      })),
      market({
        key: "condition:same-day-valid",
        title: "Same-day valid volatile market",
        endHours: 12,
        tradeScore: 60,
        volume24hUsd: 500
      })
    ]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.equal(result.candidates[0]?.marketKey, "condition:same-day-valid");
    assert.equal(result.candidates[0]?.action, "paper_buy_yes");
    assert.equal(result.summary.proposedOrders, 1);
  });
});

test("aggressive auto-trader can propose very short-horizon volatile markets", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T23:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });

    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:btc-updown-fast",
      conditionId: "btc-updown-fast",
      slug: "btc-updown-fast",
      eventSlug: "btc-updown-fast",
      eventTitle: "Bitcoin Up or Down - 5m",
      title: "Bitcoin Up or Down - April 24, 7:20PM-7:25PM ET",
      category: "crypto",
      tags: ["crypto", "bitcoin"],
      outcomes: ["Up", "Down"],
      outcomePrices: [0.505, 0.495],
      clobTokenIds: ["up-token", "down-token"],
      yesTokenId: "up-token",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 0.25),
      liquidityUsd: 15_000,
      volume24hUsd: 25_000,
      impliedProb: 0.505,
      bestBid: 0.50,
      bestAsk: 0.51,
      midpoint: 0.505,
      spreadCents: 1,
      categoryGroup: "crypto",
      structuralType: "threshold-range",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "tight-0-1c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 75,
      tradabilityScore: 82,
      catalystScore: 95,
      resolutionAmbiguityScore: 25,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 80,
      tradeOpportunityScore: 78,
      makerScore: 40,
      riskScore: 20,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.505)
    }]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    assert.equal(result.summary.proposedOrders, 1);
    assert.equal(result.candidates[0]?.marketKey, "condition:btc-updown-fast");
    assert.equal(result.candidates[0]?.action, "paper_buy_yes");
  });
});

test("auto-trader caps correlated exposure by event before allocating elsewhere", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-24T20:00:00.000Z");
    const runId = store.startUniverseRun({
      source: "composite",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    });

    const market = (input: {
      key: string;
      title: string;
      eventSlug: string;
      tradeScore: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      slug: input.key.replace("condition:", ""),
      eventSlug: input.eventSlug,
      eventTitle: input.eventSlug,
      title: input.title,
      category: "sports",
      tags: ["sports"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.5, 0.5],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      yesTokenId: `${input.key}:yes`,
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      endDate: isoAfter(now, 3),
      liquidityUsd: 50_000,
      volume24hUsd: 100_000,
      impliedProb: 0.5,
      bestBid: 0.49,
      bestAsk: 0.51,
      midpoint: 0.5,
      spreadCents: 2,
      categoryGroup: "sports",
      structuralType: "live-sports",
      horizonBucket: "resolves-today",
      priceBucket: "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "resolution-watch",
      modelabilityScore: 80,
      tradabilityScore: 80,
      catalystScore: 90,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 55,
      crossMarketScore: 20,
      researchPriorityScore: 80,
      tradeOpportunityScore: input.tradeScore,
      makerScore: 50,
      riskScore: 20,
      reasonCodes: ["defined_catalyst_window"],
      disqualifiers: [],
      rawJson: independentForecastRawJson(0.4)
    });

    store.recordUniverseMarkets(runId, [
      market({ key: "condition:lakers-moneyline", title: "Lakers vs. Rockets", eventSlug: "nba-lal-hou", tradeScore: 90 }),
      market({ key: "condition:lakers-spread", title: "Spread: Rockets (-8.5)", eventSlug: "nba-lal-hou", tradeScore: 89 }),
      market({ key: "condition:spurs-moneyline", title: "Spurs vs. Blazers", eventSlug: "nba-sas-por", tradeScore: 88 })
    ]);

    const result = runAutoTradingIteration(store, {
      now,
      limit: 5,
      mandate: {
        budgetUsdc: 20,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });

    const proposed = result.candidates.filter((candidate) => candidate.action === "paper_buy_yes");
    assert.equal(proposed.length, 2);
    assert.deepEqual(
      proposed.map((candidate) => candidate.marketKey),
      ["condition:lakers-moneyline", "condition:spurs-moneyline"]
    );
    assert.ok(
      result.candidates
        .find((candidate) => candidate.marketKey === "condition:lakers-spread")
        ?.blockers.includes("event_position_cap_reached")
    );
  });
});

test("auto-trader records a blocked decision when no universe run exists", async () => {
  await withTempStore((store) => {
    const result = runAutoTradingIteration(store, {
      now: new Date("2026-04-24T12:00:00.000Z"),
      mandate: {
        budgetUsdc: 25,
        timeframeHours: 24,
        riskProfile: "balanced"
      }
    });

    assert.equal(result.summary.proposedOrders, 0);
    assert.equal(result.candidates[0]?.blockers[0], "missing_universe_run");
    const decisions = store.listAutoTradingDecisions({ sessionId: result.session.sessionId });
    assert.equal(decisions[0]?.status, "blocked");
  });
});
