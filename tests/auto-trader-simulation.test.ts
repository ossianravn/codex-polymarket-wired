import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runAutoTradingSimulation } from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-autotrader-sim-"));
  const store = openStateStore(path.join(dir, "polymarket.sqlite"));
  try {
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("auto-trader simulation replays iterations and marks paper PnL", async () => {
  await withTempStore((store) => {
    const result = runAutoTradingSimulation(store, {
      startAt: new Date("2026-04-25T12:00:00.000Z"),
      ticks: 3,
      tickMinutes: 360,
      limit: 6,
      mandate: {
        budgetUsdc: 50,
        timeframeHours: 24,
        riskProfile: "balanced",
        mode: "paper"
      },
      markets: [
        {
          marketKey: "condition:upward",
          title: "Upward catalyst",
          prices: [0.25, 0.4, 0.65],
          opportunityMode: "execution-ready",
          endHoursFromStart: 24,
          liquidityUsd: 100_000,
          spreadCents: 1,
          tradeOpportunityScore: 90,
          researchPriorityScore: 88,
          tradabilityScore: 92,
          catalystScore: 90,
          riskScore: 10
        },
        {
          marketKey: "condition:blocked",
          title: "Blocked ambiguity",
          prices: [0.35, 0.34, 0.33],
          opportunityMode: "execution-ready",
          endHoursFromStart: 24,
          liquidityUsd: 100_000,
          resolutionAmbiguityScore: 90,
          tradeOpportunityScore: 85,
          researchPriorityScore: 82
        }
      ]
    });

    assert.equal(result.summary.ticks, 3);
    assert.ok(result.summary.fillCount > 0);
    assert.equal(result.summary.positionCount, 1);
    assert.ok(result.summary.finalCashUsdc < 50);
    assert.ok(result.summary.finalPortfolioValueUsdc > 50);
    assert.equal(result.positions[0]?.marketKey, "condition:upward");
    assert.ok(result.ticks.some((tick) => tick.blocked > 0));
    assert.equal(store.listAutoTradingSessions({ limit: 10 }).length, 1);
  });
});

test("auto-trader simulation never spends beyond the mandate budget", async () => {
  await withTempStore((store) => {
    const result = runAutoTradingSimulation(store, {
      startAt: new Date("2026-04-25T12:00:00.000Z"),
      ticks: 4,
      tickMinutes: 60,
      limit: 4,
      mandate: {
        budgetUsdc: 10,
        timeframeHours: 12,
        riskProfile: "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: 6
      },
      markets: [
        {
          marketKey: "condition:fast",
          title: "Fast catalyst",
          prices: [0.2, 0.24, 0.28, 0.31],
          opportunityMode: "execution-ready",
          endHoursFromStart: 12,
          liquidityUsd: 80_000,
          tradeOpportunityScore: 92,
          researchPriorityScore: 88,
          tradabilityScore: 90,
          catalystScore: 92,
          riskScore: 12
        }
      ]
    });

    assert.ok(result.summary.totalSpentUsdc <= 10);
    assert.ok(result.summary.finalCashUsdc >= 0);
    assert.equal(
      Number((result.summary.totalSpentUsdc + result.summary.finalCashUsdc).toFixed(4)),
      10
    );
  });
});
