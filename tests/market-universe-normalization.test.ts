import assert from "node:assert/strict";
import test from "node:test";

import {
  makeUniverseMarketKey,
  normalizeUniverseMarketFromGammaMarket
} from "../packages/market-universe/src/index.js";

test("normalizeUniverseMarketFromGammaMarket parses JSON-string arrays, numeric strings, and event fallbacks", () => {
  const raw = {
    id: "123",
    question: "Will X happen by June 30?",
    conditionId: "0xabc",
    slug: "will-x-happen",
    outcomes: "[\"Yes\",\"No\"]",
    outcomePrices: "[\"0.42\",\"0.58\"]",
    clobTokenIds: "[\"yes-token\",\"no-token\"]",
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
    liquidityNum: "25000",
    volume24hr: "1200",
    bestBid: "0.41",
    bestAsk: "0.43",
    endDateIso: "2026-06-30T00:00:00Z",
    tags: [{ label: "Politics", slug: "politics" }]
  };

  const event = {
    id: "event-1",
    title: "Election event",
    slug: "election-event",
    description: "Official election market cluster",
    category: "Politics",
    tags: [{ label: "Election", slug: "election" }]
  };

  const market = normalizeUniverseMarketFromGammaMarket(raw, {
    rawEvent: event,
    now: new Date("2026-04-01T00:00:00Z")
  });

  assert.equal(market.marketKey, "condition:0xabc");
  assert.deepEqual(market.outcomes, ["Yes", "No"]);
  assert.deepEqual(market.outcomePrices, [0.42, 0.58]);
  assert.deepEqual(market.clobTokenIds, ["yes-token", "no-token"]);
  assert.equal(market.eventId, "event-1");
  assert.equal(market.eventTitle, "Election event");
  assert.equal(market.categoryGroup, "politics");
  assert.equal(market.structuralType, "single-binary");
  assert.equal(market.horizonBucket, "medium-31-120d");
  assert.equal(market.priceBucket, "balanced-30-70c");
  assert.equal(market.liquidityBucket, "tradable");
  assert.equal(market.spreadBucket, "normal-1-3c");
  assert.equal(market.impliedProb, 0.42);
});

test("makeUniverseMarketKey prefers conditionId then marketId then slug then hashed title", () => {
  assert.equal(
    makeUniverseMarketKey({ conditionId: "0xabc", marketId: "123", slug: "test", title: "Market" }),
    "condition:0xabc"
  );
  assert.equal(
    makeUniverseMarketKey({ marketId: "123", slug: "test", title: "Market" }),
    "market:123"
  );
  assert.equal(
    makeUniverseMarketKey({ slug: "test", title: "Market" }),
    "slug:test"
  );
  assert.match(
    makeUniverseMarketKey({ title: "Fallback title only" }),
    /^title:[a-f0-9]{16}$/
  );
});

test("normalizeUniverseMarketFromGammaMarket follows implied probability precedence", () => {
  const now = new Date("2026-04-01T00:00:00Z");

  const midpointFirst = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Midpoint first",
      midpoint: "0.55",
      outcomePrices: "[\"0.42\",\"0.58\"]",
      lastTradePrice: "0.33"
    },
    { now }
  );
  assert.equal(midpointFirst.impliedProb, 0.55);

  const bookAverageSecond = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Book average second",
      bestBid: "0.30",
      bestAsk: "0.34",
      outcomePrices: "[\"0.42\",\"0.58\"]",
      lastTradePrice: "0.33"
    },
    { now }
  );
  assert.equal(bookAverageSecond.impliedProb, 0.32);

  const outcomePriceThird = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Outcome price third",
      outcomePrices: "[\"0.42\",\"0.58\"]",
      lastTradePrice: "0.33"
    },
    { now }
  );
  assert.equal(outcomePriceThird.impliedProb, 0.42);

  const tradeLast = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Trade last",
      lastTradePrice: "0.33"
    },
    { now }
  );
  assert.equal(tradeLast.impliedProb, 0.33);
});

test("normalizeUniverseMarketFromGammaMarket uses token-aware category detection for sports", () => {
  const now = new Date("2026-04-24T00:00:00Z");
  const cases = [
    "Seattle Mariners vs. St. Louis Cardinals",
    "Pittsburgh Pirates vs. Milwaukee Brewers",
    "UFC 328: Sean Strickland vs. Khamzat Chimaev (Middleweight, Main Card)",
    "Pakistan Super League: 1st Place vs 2nd Place - Completed match?",
    "Will Fulham FC win on 2026-05-02?"
  ];

  for (const question of cases) {
    const market = normalizeUniverseMarketFromGammaMarket(
      {
        question,
        outcomes: "[\"Yes\",\"No\"]",
        outcomePrices: "[\"0.52\",\"0.48\"]",
        clobTokenIds: "[\"yes\",\"no\"]",
        active: true,
        closed: false,
        acceptingOrders: true,
        enableOrderBook: true,
        liquidityNum: "50000",
        bestBid: "0.51",
        bestAsk: "0.53",
        endDateIso: "2026-05-15T00:00:00Z"
      },
      { now }
    );

    assert.equal(market.categoryGroup, "sports", question);
    assert.equal(market.structuralType, "live-sports", question);
  }
});

test("normalizeUniverseMarketFromGammaMarket does not match short keywords inside longer words", () => {
  const sports = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Seattle Mariners vs. St. Louis Cardinals",
      outcomes: "[\"Yes\",\"No\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      liquidityNum: "50000"
    },
    { now: new Date("2026-04-24T00:00:00Z") }
  );
  assert.equal(sports.categoryGroup, "sports");

  const tech = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Will OpenAI release a new model by June?",
      outcomes: "[\"Yes\",\"No\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      liquidityNum: "50000"
    },
    { now: new Date("2026-04-24T00:00:00Z") }
  );
  assert.equal(tech.categoryGroup, "tech");
});

test("active restricted Gamma markets remain discovery candidates", () => {
  const market = normalizeUniverseMarketFromGammaMarket(
    {
      id: "2012793",
      question: "Lakers vs. Rockets",
      slug: "nba-lal-hou-2026-04-24",
      outcomes: "[\"Lakers\",\"Rockets\"]",
      outcomePrices: "[\"0.34\",\"0.66\"]",
      clobTokenIds: "[\"lakers-token\",\"rockets-token\"]",
      active: true,
      closed: false,
      restricted: true,
      acceptingOrders: true,
      enableOrderBook: true,
      liquidityNum: "979950.6137",
      volume24hr: "3202860.4537",
      endDate: "2026-04-25T00:00:00Z"
    },
    { now: new Date("2026-04-24T20:00:00Z") }
  );

  assert.equal(market.categoryGroup, "sports");
  assert.equal(market.structuralType, "live-sports");
  assert.equal(market.horizonBucket, "resolves-today");
  assert.equal(market.restricted, true);
  assert.ok(market.reasonCodes.includes("restricted_flag_present"));
  assert.equal(market.disqualifiers.includes("inactive_or_restricted"), false);
  assert.equal(market.disqualifiers.includes("inactive_or_not_accepting_orders"), false);
  assert.notEqual(market.opportunityMode, "avoid");
});

test("stale active Gamma records are not classified as short-horizon candidates", () => {
  const market = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Old active-but-stale market",
      outcomes: "[\"Yes\",\"No\"]",
      outcomePrices: "[\"0.50\",\"0.50\"]",
      clobTokenIds: "[\"yes\",\"no\"]",
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      liquidityNum: "50000",
      endDate: "2025-11-23T00:00:00Z"
    },
    { now: new Date("2026-04-24T20:00:00Z") }
  );

  assert.equal(market.horizonBucket, "unknown");
  assert.ok(market.disqualifiers.includes("market_already_ended"));
  assert.equal(market.opportunityMode, "avoid");
});

test("crypto up/down markets are categorized and structured for short-horizon discovery", () => {
  const market = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Bitcoin Up or Down - April 24, 7:25PM-7:30PM ET",
      slug: "btc-updown-5m-1777073100",
      outcomes: "[\"Up\",\"Down\"]",
      outcomePrices: "[\"0.505\",\"0.495\"]",
      clobTokenIds: "[\"up-token\",\"down-token\"]",
      active: true,
      closed: false,
      restricted: true,
      acceptingOrders: true,
      enableOrderBook: true,
      liquidityNum: "25012.5344",
      volume24hr: "490.907",
      endDate: "2026-04-24T23:30:00Z"
    },
    { now: new Date("2026-04-24T23:20:00Z") }
  );

  assert.equal(market.categoryGroup, "crypto");
  assert.equal(market.structuralType, "threshold-range");
  assert.equal(market.horizonBucket, "resolves-today");
  assert.equal(market.impliedProb, 0.505);
  assert.equal(market.disqualifiers.includes("inactive_or_restricted"), false);
});

test("finance threshold markets with eventStartTime are not misclassified as live sports", () => {
  const market = normalizeUniverseMarketFromGammaMarket(
    {
      question: "Will WTI Crude Oil (WTI) hit (HIGH) $120 in April?",
      slug: "will-wti-crude-oil-wti-hit-high-120-in-april",
      outcomes: "[\"Yes\",\"No\"]",
      outcomePrices: "[\"0.0595\",\"0.9405\"]",
      clobTokenIds: "[\"yes-token\",\"no-token\"]",
      active: true,
      closed: false,
      restricted: true,
      acceptingOrders: true,
      enableOrderBook: true,
      liquidityNum: "150850.04998",
      volume24hr: "199523.637107",
      endDate: "2026-04-30T00:00:00Z",
      eventStartTime: "2026-03-25T04:01:18.598Z",
      tags: [{ slug: "finance" }, { slug: "hit-price" }, { slug: "commodities" }, { slug: "oil" }]
    },
    {
      rawEvent: {
        title: "What will WTI Crude Oil (WTI) hit in April 2026?",
        tags: [{ slug: "finance" }, { slug: "finance-updown" }]
      },
      now: new Date("2026-04-24T23:20:00Z")
    }
  );

  assert.equal(market.categoryGroup, "finance");
  assert.equal(market.structuralType, "threshold-range");
});
