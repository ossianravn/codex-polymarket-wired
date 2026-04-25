import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizeAutoTradingMandate,
  refreshAutoTradingMarketSnapshots,
  selectAutoTradingSnapshotRefreshMarkets
} from "../packages/auto-trader/src/index.js";
import type { RuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-snapshot-refresh-"));
  const store = openStateStore(path.join(dir, "polymarket.sqlite"));
  try {
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function runtimeConfigFixture(): RuntimeConfig {
  return {
    cwd: process.cwd(),
    clobUrl: "https://clob.example.test",
    gammaUrl: "https://gamma.example.test",
    dataUrl: "https://data.example.test",
    chainId: 137,
    signatureType: 0,
    enableTrading: false,
    requirePreview: true,
    requireGeoblockCheck: true,
    autoDeriveApiCreds: false,
    pythonBin: "python",
    pythonHelperPath: "helper.py",
    alertCachePath: "alerts.json",
    stateDbPath: "state.sqlite"
  };
}

test("targeted snapshot refresh updates only shortlisted stale candidate rows", async () => {
  await withTempStore(async (store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const staleCapturedAt = new Date(now.getTime() - 45 * 60_000).toISOString();
    const runId = store.startUniverseRun({
      source: "test",
      activeOnly: true,
      closedIncluded: false,
      status: "completed",
      startedAt: staleCapturedAt,
      completedAt: staleCapturedAt
    });
    store.recordUniverseMarkets(runId, [{
      runId,
      marketKey: "condition:refresh",
      conditionId: "refresh",
      title: "Refresh candidate",
      outcomes: ["Yes", "No"],
      clobTokenIds: ["yes-token", "no-token"],
      yesTokenId: "yes-token",
      noTokenId: "no-token",
      active: true,
      closed: false,
      acceptingOrders: true,
      endDate: new Date(now.getTime() + 6 * 60 * 60_000).toISOString(),
      liquidityUsd: 25_000,
      volume24hUsd: 5_000,
      impliedProb: 0.4,
      bestBid: 0.4,
      bestAsk: 0.42,
      midpoint: 0.41,
      spreadCents: 2,
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
      rawJson: {},
      capturedAt: staleCapturedAt
    }]);
    const mandate = normalizeAutoTradingMandate({
      budgetUsdc: 30,
      timeframeHours: 24,
      riskProfile: "aggressive",
      mode: "paper"
    });

    const selected = selectAutoTradingSnapshotRefreshMarkets(store, {
      runId,
      mandate,
      limit: 10,
      now
    });
    assert.equal(selected.markets.length, 1);

    const refreshed = await refreshAutoTradingMarketSnapshots(store, runtimeConfigFixture(), {
      runId,
      mandate,
      limit: 10,
      now,
      orderbookFetcher: async (_config, tokenId, depth) => {
        assert.equal(tokenId, "yes-token");
        assert.equal(depth, 50);
        return {
          tokenId,
          bids: [{ price: 0.44, size: 100 }],
          asks: [{ price: 0.45, size: 100 }],
          bestBid: 0.44,
          bestAsk: 0.45,
          midpoint: 0.445,
          tickSize: 0.01,
          minOrderSize: 5,
          negRisk: false,
          hash: "book-hash"
        };
      }
    });

    assert.equal(refreshed.refreshed, 1);
    assert.equal(refreshed.failed, 0);
    const market = store.getUniverseMarket(runId, "condition:refresh");
    assert.equal(market?.bestBid, 0.44);
    assert.equal(market?.bestAsk, 0.45);
    assert.equal(market?.midpoint, 0.445);
    assert.equal(market?.spreadCents, 1);
    assert.equal(market?.capturedAt, now.toISOString());
    assert.equal((market?.rawJson as Record<string, unknown>).targetedSnapshotRefresh !== undefined, true);
  });
});
