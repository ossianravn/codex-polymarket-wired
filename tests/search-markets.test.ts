import assert from "node:assert/strict";
import test from "node:test";

import { searchMarkets, type RuntimeConfig } from "../packages/polymarket-core/src/index.js";

const config: RuntimeConfig = {
  cwd: process.cwd(),
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
  alertCachePath: ".cache/polymarket-alerts.json",
  stateDbPath: "state/polymarket.sqlite"
};

test("searchMarkets sort_by newest uses createdAt, then updatedAt, then endDate", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        markets: [
          {
            id: "1",
            question: "Older by createdAt",
            slug: "older-created",
            active: true,
            closed: false,
            createdAt: "2026-03-01T00:00:00Z"
          },
          {
            id: "2",
            question: "Newest by updatedAt",
            slug: "newest-updated",
            active: true,
            closed: false,
            updatedAt: "2026-04-05T00:00:00Z"
          },
          {
            id: "3",
            question: "Fallback end date",
            slug: "fallback-enddate",
            active: true,
            closed: false,
            endDateIso: "2026-04-01T00:00:00Z"
          }
        ],
        events: []
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  try {
    const markets = await searchMarkets(config, {
      query: "test",
      limit: 10,
      activeOnly: true,
      includeClosed: false,
      sortBy: "newest"
    });

    assert.deepEqual(markets.map((market) => market.slug), [
      "newest-updated",
      "fallback-enddate",
      "older-created"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
