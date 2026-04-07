import test from "node:test";
import assert from "node:assert/strict";

import type { MarketSnapshot } from "../packages/polymarket-core/src/index.js";
import {
  applyOrderbookSummary,
  isoDateTimeSchema,
  normalizeAllowanceSnapshot,
  normalizeAtomicAmount
} from "../servers/polymarket-mcp/src/server.js";

test("isoDateTimeSchema accepts UTC and offset ISO timestamps", () => {
  assert.equal(isoDateTimeSchema.parse("2026-04-07T22:59:34.906Z"), "2026-04-07T22:59:34.906Z");
  assert.equal(
    isoDateTimeSchema.parse("2026-04-08T00:59:34.9069145+02:00"),
    "2026-04-08T00:59:34.9069145+02:00"
  );
  assert.throws(() => isoDateTimeSchema.parse("2026-04-08"));
});

test("normalizeAllowanceSnapshot derives the max normalized allowance from allowance maps", () => {
  const snapshot = normalizeAllowanceSnapshot(
    {
      allowances: {
        spenderA: "1500000",
        spenderB: "42000000"
      }
    },
    6
  );

  assert.equal(normalizeAtomicAmount("132736975", 6), 132.736975);
  assert.equal(snapshot.allowance, 42);
  assert.deepEqual(snapshot.allowanceEntries, [
    { spender: "spenderA", amount: 1.5 },
    { spender: "spenderB", amount: 42 }
  ]);
});

test("applyOrderbookSummary overwrites stale snapshot book data with live orderbook values", () => {
  const snapshot: MarketSnapshot = {
    title: "Tesla",
    tokenIds: ["yes", "no"],
    bestBid: 0.17,
    bestAsk: 0.32,
    midpoint: 0.245,
    spreadCents: 15,
    minimumTickSize: 0.01,
    minimumOrderSize: 5,
    negRisk: true
  };

  const merged = applyOrderbookSummary(snapshot, {
    bestBid: 0.25,
    bestAsk: 0.32,
    midpoint: 0.285,
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true
  });

  assert.equal(merged.bestBid, 0.25);
  assert.equal(merged.bestAsk, 0.32);
  assert.equal(merged.midpoint, 0.285);
  assert.equal(merged.spreadCents, 7);
  assert.equal(merged.minimumTickSize, 0.01);
  assert.equal(merged.minimumOrderSize, 5);
});
