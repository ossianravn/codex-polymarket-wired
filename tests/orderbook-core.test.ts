import test from "node:test";
import assert from "node:assert/strict";

import { getOrderbook, type RuntimeConfig } from "../packages/polymarket-core/src/index.js";

test("getOrderbook sorts bids descending and asks ascending before deriving top of book", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        market: "condition-123",
        bids: [
          { price: "0.01", size: "25" },
          { price: "0.25", size: "40" },
          { price: "0.17", size: "174" }
        ],
        asks: [
          { price: "0.99", size: "100" },
          { price: "0.32", size: "5.1" },
          { price: "0.39", size: "31.14" }
        ],
        tick_size: "0.01",
        min_order_size: "5",
        neg_risk: true,
        timestamp: "123",
        hash: "abc"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  try {
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
      alertCachePath: ".cache/polymarket-alerts.json"
    };

    const orderbook = await getOrderbook(config, "token-123", 3);

    assert.equal(orderbook.bestBid, 0.25);
    assert.equal(orderbook.bestAsk, 0.32);
    assert.equal(orderbook.midpoint, 0.285);
    assert.deepEqual(orderbook.bids.map((level) => level.price), [0.25, 0.17, 0.01]);
    assert.deepEqual(orderbook.asks.map((level) => level.price), [0.32, 0.39, 0.99]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
