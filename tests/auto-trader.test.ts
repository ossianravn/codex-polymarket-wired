import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { compactAutoTradingIterationResult, runAutoTradingIteration } from "../packages/auto-trader/src/index.js";
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
      rawJson: {}
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
      rawJson: {}
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
      rawJson: {}
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
      rawJson: {}
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
      rawJson: {}
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
