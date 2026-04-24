import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeUniverseMarketFromGammaMarket
} from "../packages/market-universe/src/index.js";

test("liquid tight market scores better than thin wide ambiguous market", () => {
  const now = new Date("2026-04-01T00:00:00Z");

  const liquid = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Will CPI print above 3% in May?",
      outcomes: "[\"Yes\",\"No\"]",
      outcomePrices: "[\"0.44\",\"0.56\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      liquidityNum: "90000",
      volume24hr: "15000",
      bestBid: "0.43",
      bestAsk: "0.45",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      resolutionSource: "BLS CPI release",
      endDateIso: "2026-05-15T12:30:00Z",
      tags: [{ slug: "economics" }]
    },
    { now }
  );

  const thin = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Will a famous celebrity have a surprising public moment this year?",
      outcomes: "[\"Yes\",\"No\"]",
      outcomePrices: "[\"0.44\",\"0.56\"]",
      liquidityNum: "200",
      volume24hr: "10",
      bestBid: "0.20",
      bestAsk: "0.40",
      active: true,
      closed: false,
      acceptingOrders: false,
      enableOrderBook: false,
      endDateIso: "2026-12-31T00:00:00Z",
      tags: [{ slug: "celebrity" }]
    },
    { now }
  );

  assert.ok(liquid.tradabilityScore > thin.tradabilityScore);
  assert.ok(liquid.modelabilityScore > thin.modelabilityScore);
  assert.ok(liquid.researchPriorityScore > thin.researchPriorityScore);
  assert.ok(liquid.riskScore < thin.riskScore);
});

test("closed market is avoid and near-resolution clear market becomes resolution-watch", () => {
  const now = new Date("2026-04-01T00:00:00Z");

  const closed = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Closed market",
      outcomes: "[\"Yes\",\"No\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      closed: true,
      active: false,
      liquidityNum: "50000",
      resolutionSource: "Official result"
    },
    { now }
  );
  assert.equal(closed.opportunityMode, "avoid");

  const nearResolution = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Will the court rule by April 2?",
      outcomes: "[\"Yes\",\"No\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      liquidityNum: "25000",
      volume24hr: "5000",
      bestBid: "0.48",
      bestAsk: "0.50",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      resolutionSource: "Official court docket",
      endDateIso: "2026-04-02T12:00:00Z",
      tags: [{ slug: "court" }]
    },
    { now }
  );
  assert.equal(nearResolution.opportunityMode, "resolution-watch");
});

test("market-making candidate gets a strong maker score on tradable liquidity with wider spread", () => {
  const market = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Will BTC be above $120k by July?",
      outcomes: "[\"Yes\",\"No\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      liquidityNum: "30000",
      volume24hr: "4000",
      bestBid: "0.40",
      bestAsk: "0.44",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      resolutionSource: "Official market rules",
      endDateIso: "2026-07-31T00:00:00Z",
      tags: [{ slug: "crypto" }]
    },
    { now: new Date("2026-04-01T00:00:00Z") }
  );

  assert.ok(market.makerScore >= 55);
  assert.equal(market.opportunityMode, "market-making");
});
