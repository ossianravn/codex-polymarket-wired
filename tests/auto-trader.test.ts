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
