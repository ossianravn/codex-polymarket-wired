import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { RuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";
import {
  ingestAndPersistUniverseRun,
  mergeMarketsIntoWatchlistsYaml
} from "../servers/polymarket-mcp/src/server.js";

async function withTempConfig(
  fn: (config: RuntimeConfig) => Promise<void>
): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "poly-mcp-universe-"));
  try {
    await mkdir(path.join(cwd, "configs"), { recursive: true });
    await mkdir(path.join(cwd, "state"), { recursive: true });
    await writeFile(path.join(cwd, "configs", "watchlists.yaml"), "watchlists: []\n", "utf8");

    const config: RuntimeConfig = {
      cwd,
      clobUrl: "https://clob.polymarket.com",
      gammaUrl: "https://gamma-api.polymarket.com",
      dataUrl: "https://data-api.polymarket.com",
      chainId: 137,
      signatureType: 0,
      enableTrading: false,
      requirePreview: true,
      requireGeoblockCheck: true,
      autoDeriveApiCreds: true,
      pythonBin: "python",
      pythonHelperPath: "helper.py",
      alertCachePath: path.join(cwd, ".cache", "alerts.json"),
      stateDbPath: path.join(cwd, "state", "polymarket.sqlite")
    };

    await fn(config);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("ingestAndPersistUniverseRun persists mocked keyset pages", async () => {
  await withTempConfig(async (config) => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/markets/keyset")) {
        throw new Error(`Unexpected URL ${url.toString()}`);
      }
      const afterCursor = url.searchParams.get("after_cursor");
      const payload = afterCursor === "cursor-2"
        ? {
            markets: [
              {
                id: "2",
                question: "Will BTC be above 120k by July?",
                conditionId: "0xdef",
                slug: "btc-120k-july",
                outcomes: "[\"Yes\",\"No\"]",
                outcomePrices: "[\"0.22\",\"0.78\"]",
                clobTokenIds: "[\"yes-b\",\"no-b\"]",
                liquidityNum: "30000",
                volume24hr: "1500",
                bestBid: "0.21",
                bestAsk: "0.23",
                active: true,
                closed: false,
                acceptingOrders: true,
                enableOrderBook: true,
                endDateIso: "2026-07-31T00:00:00Z",
                tags: [{ slug: "crypto" }]
              }
            ]
          }
        : {
            markets: [
              {
                id: "1",
                question: "Will CPI print above 3% in May?",
                conditionId: "0xabc",
                slug: "cpi-may",
                outcomes: "[\"Yes\",\"No\"]",
                outcomePrices: "[\"0.44\",\"0.56\"]",
                clobTokenIds: "[\"yes-a\",\"no-a\"]",
                liquidityNum: "50000",
                volume24hr: "4000",
                bestBid: "0.43",
                bestAsk: "0.45",
                active: true,
                closed: false,
                acceptingOrders: true,
                enableOrderBook: true,
                resolutionSource: "BLS CPI release",
                endDateIso: "2026-05-15T12:30:00Z",
                tags: [{ slug: "economics" }]
              }
            ],
            next_cursor: "cursor-2"
          };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    try {
      const summary = await ingestAndPersistUniverseRun(
        {
          source: "markets_keyset",
          page_size: 1000,
          enrich_top_n: 0,
          enrichment_profile: "none"
        },
        config
      );

      assert.equal(summary.total_markets, 2);
      assert.equal(summary.enriched_markets, 0);

      const store = openStateStore(config.stateDbPath);
      const latestRun = store.getLatestUniverseRun();
      assert.ok(latestRun?.runId);

      const listed = store.listUniverseMarkets({
        runId: String(latestRun?.runId),
        sort: "research_priority_desc",
        limit: 10
      });
      assert.equal(listed.total, 2);
      assert.equal(listed.markets[0]?.slug, "cpi-may");
      assert.equal(store.getUniverseFacets(String(latestRun?.runId)).totalMarkets, 2);
      store.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("mergeMarketsIntoWatchlistsYaml adds discovery markets to a named group", () => {
  const merged = mergeMarketsIntoWatchlistsYaml(
    "watchlists: []\n",
    {
      markets: [
        { title: "CPI market", identifierType: "slug", identifier: "cpi-may" },
        { title: "BTC market", identifierType: "condition_id", identifier: "0xdef" }
      ]
    },
    {
      watchlist_name: "macro-discovery",
      replace_existing_group: false,
      move_threshold_pct_points: 3,
      spread_threshold_cents: 5,
      include_related_markets: true,
      include_comments: true,
      scope: "watchlist",
      description: "managed from universe discovery"
    }
  );

  assert.equal(merged.groupName, "macro-discovery");
  assert.equal(merged.marketCount, 2);
  assert.match(merged.yaml, /name: macro-discovery/);
  assert.match(merged.yaml, /identifier: cpi-may/);
  assert.match(merged.yaml, /identifier: "?0xdef"?/);
});
