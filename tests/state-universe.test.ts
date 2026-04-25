import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-universe-state-"));
  const store = openStateStore(path.join(dir, "polymarket.sqlite"));
  try {
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("universe run lifecycle persists rows, sorting, and facets", async () => {
  await withTempStore((store) => {
    const runId = store.startUniverseRun({
      source: "markets_keyset",
      activeOnly: true,
      closedIncluded: false,
      status: "running",
      metadata: { note: "test" }
    });

    const inserted = store.recordUniverseMarkets(runId, [
      {
        runId,
        marketKey: "condition:abc",
        conditionId: "abc",
        slug: "fed-cut-june",
        title: "Will the Fed cut by June?",
        category: "economics",
        tags: ["economics", "fed"],
        outcomes: ["Yes", "No"],
        outcomePrices: [0.44, 0.56],
        clobTokenIds: ["yes-a", "no-a"],
        active: true,
        closed: false,
        acceptingOrders: true,
        enableOrderBook: true,
        liquidityUsd: 50000,
        volume24hUsd: 4000,
        spreadCents: 2,
        categoryGroup: "economics",
        structuralType: "single-binary",
        horizonBucket: "near-8-30d",
        priceBucket: "balanced-30-70c",
        liquidityBucket: "tradable",
        spreadBucket: "normal-1-3c",
        opportunityMode: "deep-research",
        modelabilityScore: 80,
        tradabilityScore: 75,
        catalystScore: 82,
        resolutionAmbiguityScore: 20,
        attentionGapScore: 60,
        crossMarketScore: 15,
        researchPriorityScore: 84,
        tradeOpportunityScore: 78,
        makerScore: 58,
        riskScore: 18,
        reasonCodes: ["binary_market"],
        disqualifiers: [],
        rawJson: { source: "fixture-a" }
      },
      {
        runId,
        marketKey: "condition:def",
        conditionId: "def",
        slug: "btc-120k-july",
        title: "Will BTC hit 120k by July?",
        category: "crypto",
        tags: ["crypto", "bitcoin"],
        outcomes: ["Yes", "No"],
        outcomePrices: [0.20, 0.8],
        clobTokenIds: ["yes-b", "no-b"],
        active: true,
        closed: false,
        acceptingOrders: true,
        enableOrderBook: true,
        liquidityUsd: 25000,
        volume24hUsd: 1500,
        spreadCents: 4,
        categoryGroup: "crypto",
        structuralType: "single-binary",
        horizonBucket: "medium-31-120d",
        priceBucket: "cheap-10-30c",
        liquidityBucket: "tradable",
        spreadBucket: "wide-3-6c",
        opportunityMode: "market-making",
        modelabilityScore: 72,
        tradabilityScore: 68,
        catalystScore: 65,
        resolutionAmbiguityScore: 25,
        attentionGapScore: 70,
        crossMarketScore: 18,
        researchPriorityScore: 73,
        tradeOpportunityScore: 70,
        makerScore: 66,
        riskScore: 24,
        reasonCodes: ["tradable_liquidity"],
        disqualifiers: [],
        rawJson: { source: "fixture-b" }
      },
      {
        runId,
        marketKey: "condition:ghi",
        conditionId: "ghi",
        slug: "celeb-surprise",
        title: "Will a celebrity do something surprising?",
        category: "culture",
        tags: ["celebrity"],
        outcomes: ["Yes", "No"],
        outcomePrices: [0.5, 0.5],
        clobTokenIds: ["yes-c", "no-c"],
        active: false,
        closed: true,
        acceptingOrders: false,
        enableOrderBook: false,
        liquidityUsd: 100,
        volume24hUsd: 5,
        spreadCents: 20,
        categoryGroup: "culture",
        structuralType: "novelty",
        horizonBucket: "long-120d-plus",
        priceBucket: "balanced-30-70c",
        liquidityBucket: "dead",
        spreadBucket: "very-wide-6c-plus",
        opportunityMode: "avoid",
        modelabilityScore: 20,
        tradabilityScore: 10,
        catalystScore: 15,
        resolutionAmbiguityScore: 80,
        attentionGapScore: 15,
        crossMarketScore: 5,
        researchPriorityScore: 12,
        tradeOpportunityScore: 9,
        makerScore: 8,
        riskScore: 84,
        reasonCodes: [],
        disqualifiers: ["inactive_or_restricted"],
        rawJson: { source: "fixture-c" }
      }
    ]);

    assert.equal(inserted, 3);

    store.completeUniverseRun(runId, {
      status: "completed",
      totalMarkets: 3,
      totalEvents: 2,
      enrichedMarkets: 1
    });

    const latestRun = store.getLatestUniverseRun();
    assert.equal(latestRun?.runId, runId);
    assert.equal(latestRun?.status, "completed");
    assert.equal(latestRun?.totalMarkets, 3);

    const listed = store.listUniverseMarkets({
      runId,
      minTradabilityScore: 60,
      sort: "research_priority_desc"
    });
    assert.equal(listed.total, 2);
    assert.deepEqual(listed.markets.map((market) => market.marketKey), [
      "condition:abc",
      "condition:def"
    ]);

    const tagged = store.listUniverseMarkets({
      runId,
      includeTags: ["bitcoin"]
    });
    assert.equal(tagged.total, 1);
    assert.equal(tagged.markets[0]?.marketKey, "condition:def");

    const facets = store.getUniverseFacets(runId);
    assert.equal(facets.totalMarkets, 3);
    assert.equal((facets.categoryGroups as Record<string, number>).economics, 1);
    assert.equal((facets.categoryGroups as Record<string, number>).crypto, 1);
    assert.equal((facets.opportunityModes as Record<string, number>)["avoid"], 1);

    const market = store.getUniverseMarket(runId, "condition:abc");
    assert.equal(market?.title, "Will the Fed cut by June?");
    assert.deepEqual(market?.tags, ["economics", "fed"]);
    assert.deepEqual(market?.reasonCodes, ["binary_market"]);
  });
});

test("universe market snapshots tolerate duplicate provider slugs", async () => {
  await withTempStore((store) => {
    const runId = store.startUniverseRun({
      source: "gamma_events",
      activeOnly: true,
      closedIncluded: false,
      status: "running"
    });

    const baseMarket = {
      runId,
      title: "Duplicate slug fixture",
      category: "crypto",
      tags: ["crypto"],
      outcomes: ["Yes", "No"],
      outcomePrices: [0.2, 0.8],
      clobTokenIds: ["yes", "no"],
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      liquidityUsd: 10_000,
      volume24hUsd: 1_000,
      spreadCents: 2,
      categoryGroup: "crypto",
      structuralType: "single-binary",
      horizonBucket: "short-0-7d",
      priceBucket: "cheap-10-30c",
      liquidityBucket: "tradable",
      spreadBucket: "normal-1-3c",
      opportunityMode: "deep-research",
      modelabilityScore: 70,
      tradabilityScore: 70,
      catalystScore: 70,
      resolutionAmbiguityScore: 20,
      attentionGapScore: 50,
      crossMarketScore: 20,
      researchPriorityScore: 70,
      tradeOpportunityScore: 70,
      makerScore: 50,
      riskScore: 20,
      reasonCodes: ["binary_market"],
      disqualifiers: [],
      rawJson: {}
    };

    const inserted = store.recordUniverseMarkets(runId, [
      {
        ...baseMarket,
        marketKey: "condition:duplicate-slug-a",
        marketId: "provider-reused-market-id",
        conditionId: "duplicate-slug-a",
        slug: "provider-reused-slug",
        title: "Duplicate slug fixture A",
        yesTokenId: "yes-a",
        noTokenId: "no-a"
      },
      {
        ...baseMarket,
        marketKey: "condition:duplicate-slug-b",
        marketId: "provider-reused-market-id",
        conditionId: "duplicate-slug-b",
        slug: "provider-reused-slug",
        title: "Duplicate slug fixture B",
        yesTokenId: "yes-b",
        noTokenId: "no-b"
      }
    ]);

    assert.equal(inserted, 2);
    assert.equal(store.getUniverseMarket(runId, "condition:duplicate-slug-a")?.marketId, "provider-reused-market-id");
    assert.equal(store.getUniverseMarket(runId, "condition:duplicate-slug-b")?.marketId, "provider-reused-market-id");
    assert.equal(store.getUniverseMarket(runId, "condition:duplicate-slug-a")?.slug, "provider-reused-slug");
    assert.equal(store.getUniverseMarket(runId, "condition:duplicate-slug-b")?.slug, "provider-reused-slug");
  });
});

test("latest universe run ignores failed refresh attempts", async () => {
  await withTempStore((store) => {
    const completedRunId = store.startUniverseRun({
      source: "gamma_events",
      activeOnly: true,
      closedIncluded: false,
      status: "running",
      startedAt: "2026-04-25T12:00:00.000Z"
    });
    store.completeUniverseRun(completedRunId, {
      status: "completed",
      completedAt: "2026-04-25T12:00:10.000Z",
      totalMarkets: 1,
      totalEvents: 1,
      enrichedMarkets: 1
    });

    const failedRunId = store.startUniverseRun({
      source: "gamma_events",
      activeOnly: true,
      closedIncluded: false,
      status: "running",
      startedAt: "2026-04-25T12:01:00.000Z"
    });
    store.completeUniverseRun(failedRunId, {
      status: "failed",
      completedAt: "2026-04-25T12:01:10.000Z",
      error: "provider duplicate slug"
    });

    assert.equal(store.getLatestUniverseRun()?.runId, completedRunId);
    assert.equal(store.getUniverseRun(failedRunId)?.status, "failed");
  });
});

test("universe retention prunes old scan rows while preserving latest completed run", async () => {
  await withTempStore((store) => {
    const makeRun = (runId: string, startedAt: string, status: "completed" | "failed" | "running") => {
      store.startUniverseRun({
        runId,
        source: "gamma_events",
        activeOnly: true,
        closedIncluded: false,
        status,
        startedAt
      });
      if (status !== "running") {
        store.completeUniverseRun(runId, {
          status,
          completedAt: startedAt,
          totalMarkets: 1,
          totalEvents: 1,
          enrichedMarkets: 0
        });
      }
      store.recordUniverseMarkets(runId, [
        {
          runId,
          marketKey: `condition:${runId}`,
          conditionId: runId,
          title: `Market ${runId}`,
          category: "test",
          tags: [],
          outcomes: ["Yes", "No"],
          outcomePrices: [0.5, 0.5],
          clobTokenIds: [`${runId}:yes`, `${runId}:no`],
          active: true,
          closed: false,
          acceptingOrders: true,
          enableOrderBook: true,
          liquidityUsd: 1000,
          volume24hUsd: 100,
          spreadCents: 1,
          categoryGroup: "test",
          structuralType: "single-binary",
          horizonBucket: "short-0-7d",
          priceBucket: "balanced-30-70c",
          liquidityBucket: "tradable",
          spreadBucket: "normal-1-3c",
          opportunityMode: "deep-research",
          modelabilityScore: 50,
          tradabilityScore: 50,
          catalystScore: 50,
          resolutionAmbiguityScore: 10,
          attentionGapScore: 10,
          crossMarketScore: 10,
          researchPriorityScore: 50,
          tradeOpportunityScore: 50,
          makerScore: 50,
          riskScore: 10,
          reasonCodes: [],
          disqualifiers: [],
          rawJson: {}
        }
      ]);
    };

    makeRun("old-completed", "2026-04-20T00:00:00.000Z", "completed");
    makeRun("latest-completed", "2026-04-25T00:00:00.000Z", "completed");
    makeRun("old-failed", "2026-04-20T01:00:00.000Z", "failed");
    makeRun("recent-running", "2026-04-25T11:00:00.000Z", "running");

    const dryRun = store.pruneUniverseRuns({
      keepLatestCompletedRuns: 1,
      maxIncompleteRunAgeHours: 24,
      dryRun: true,
      now: "2026-04-25T12:00:00.000Z"
    });

    assert.deepEqual(dryRun.protectedCompletedRunIds, ["latest-completed"]);
    assert.equal(dryRun.candidateUniverseMarkets, 2);
    assert.deepEqual(new Set(dryRun.candidateRunIds), new Set(["old-completed", "old-failed"]));
    assert.equal(store.getUniverseRun("old-completed")?.runId, "old-completed");

    const result = store.pruneUniverseRuns({
      keepLatestCompletedRuns: 1,
      maxIncompleteRunAgeHours: 24,
      now: "2026-04-25T12:00:00.000Z"
    });

    assert.equal(result.deletedRuns, 2);
    assert.equal(result.deletedUniverseMarkets, 2);
    assert.equal(store.getUniverseRun("old-completed"), null);
    assert.equal(store.getUniverseRun("old-failed"), null);
    assert.equal(store.getUniverseRun("latest-completed")?.runId, "latest-completed");
    assert.equal(store.getUniverseRun("recent-running")?.runId, "recent-running");
    assert.equal(store.getLatestUniverseRun()?.runId, "latest-completed");
    assert.equal(store.getUniverseMarket("old-completed", "condition:old-completed"), null);
  });
});

test("universe event clusters identify many-participant outsider convexity setups", async () => {
  await withTempStore((store) => {
    const runId = store.startUniverseRun({
      source: "markets_keyset",
      activeOnly: true,
      closedIncluded: false,
      status: "running"
    });

    const market = (input: {
      key: string;
      title: string;
      eventId?: string;
      eventTitle?: string;
      categoryGroup: string;
      price: number;
      liquidity: number;
      spread: number;
    }) => ({
      runId,
      marketKey: input.key,
      conditionId: input.key.replace("condition:", ""),
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      title: input.title,
      category: input.categoryGroup,
      tags: [input.categoryGroup],
      outcomes: ["Yes", "No"],
      outcomePrices: [input.price, Number((1 - input.price).toFixed(4))],
      clobTokenIds: [`${input.key}:yes`, `${input.key}:no`],
      active: true,
      closed: false,
      acceptingOrders: true,
      enableOrderBook: true,
      liquidityUsd: input.liquidity,
      volume24hUsd: 1000,
      impliedProb: input.price,
      bestBid: Number(Math.max(0.001, input.price - input.spread / 200).toFixed(4)),
      bestAsk: Number(Math.min(0.999, input.price + input.spread / 200).toFixed(4)),
      spreadCents: input.spread,
      categoryGroup: input.categoryGroup,
      structuralType: "single-binary",
      horizonBucket: "medium-31-120d",
      priceBucket: input.price < 0.1 ? "longshot-0-10c" : input.price < 0.3 ? "cheap-10-30c" : "balanced-30-70c",
      liquidityBucket: "tradable",
      spreadBucket: input.spread <= 3 ? "normal-1-3c" : "wide-3-6c",
      opportunityMode: "deep-research",
      modelabilityScore: 70,
      tradabilityScore: 72,
      catalystScore: 65,
      resolutionAmbiguityScore: 25,
      attentionGapScore: 75,
      crossMarketScore: 45,
      researchPriorityScore: 76,
      tradeOpportunityScore: 70,
      makerScore: 55,
      riskScore: 24,
      reasonCodes: ["tradable_liquidity"],
      disqualifiers: [],
      rawJson: {}
    });

    store.recordUniverseMarkets(runId, [
      market({ key: "condition:eurovision-a", title: "Will Sweden win Eurovision 2026?", eventId: "eurovision-2026", eventTitle: "Eurovision 2026", categoryGroup: "culture", price: 0.22, liquidity: 25_000, spread: 3 }),
      market({ key: "condition:eurovision-b", title: "Will Finland win Eurovision 2026?", eventId: "eurovision-2026", eventTitle: "Eurovision 2026", categoryGroup: "culture", price: 0.08, liquidity: 12_000, spread: 4 }),
      market({ key: "condition:eurovision-c", title: "Will Spain win Eurovision 2026?", eventId: "eurovision-2026", eventTitle: "Eurovision 2026", categoryGroup: "culture", price: 0.16, liquidity: 18_000, spread: 3 }),
      market({ key: "condition:eurovision-d", title: "Will Italy win Eurovision 2026?", eventId: "eurovision-2026", eventTitle: "Eurovision 2026", categoryGroup: "culture", price: 0.35, liquidity: 30_000, spread: 2 }),
      market({ key: "condition:eurovision-e", title: "Will Germany win Eurovision 2026?", eventId: "eurovision-2026", eventTitle: "Eurovision 2026", categoryGroup: "culture", price: 0.06, liquidity: 10_000, spread: 5 }),
      market({ key: "condition:eurovision-f", title: "Will Norway win Eurovision 2026?", eventId: "eurovision-2026", eventTitle: "Eurovision 2026", categoryGroup: "culture", price: 0.12, liquidity: 14_000, spread: 4 }),
      market({ key: "condition:golf-a", title: "Will Rory McIlroy win the Masters?", categoryGroup: "sports", price: 0.14, liquidity: 20_000, spread: 4 }),
      market({ key: "condition:golf-b", title: "Will Ludvig Aberg win the Masters?", categoryGroup: "sports", price: 0.09, liquidity: 18_000, spread: 5 }),
      market({ key: "condition:golf-c", title: "Will Scottie Scheffler win the Masters?", categoryGroup: "sports", price: 0.32, liquidity: 40_000, spread: 2 }),
      market({ key: "condition:golf-d", title: "Will Viktor Hovland win the Masters?", categoryGroup: "sports", price: 0.07, liquidity: 11_000, spread: 6 }),
      market({ key: "condition:election-a", title: "Will Na Kyung-won win the 2026 Seoul Mayoral Election", categoryGroup: "politics", price: 0.01, liquidity: 50_000, spread: 1 }),
      market({ key: "condition:election-b", title: "Will Cho Eun-hee win the 2026 Seoul Mayoral Election", categoryGroup: "politics", price: 0.02, liquidity: 45_000, spread: 1 }),
      market({ key: "condition:election-c", title: "Will Ahn Cheol-soo win the 2026 Seoul Mayoral Election", categoryGroup: "politics", price: 0.04, liquidity: 40_000, spread: 1 }),
      market({ key: "condition:election-d", title: "Will Park Ju-min win the 2026 Seoul Mayoral Election", categoryGroup: "politics", price: 0.03, liquidity: 38_000, spread: 1 }),
      market({ key: "condition:election-e", title: "Will Lee Jae-myung win the 2026 Seoul Mayoral Election", categoryGroup: "politics", price: 0.55, liquidity: 80_000, spread: 1 }),
      market({ key: "condition:single", title: "Will CPI print above 3%?", categoryGroup: "economics", price: 0.42, liquidity: 70_000, spread: 2 })
    ]);

    const clusters = store.listUniverseEventClusters({
      runId,
      minMarketCount: 3,
      minOutsiderCount: 2,
      marketsPerCluster: 5
    });

    assert.equal(clusters.runId, runId);
    assert.equal(clusters.total, 3);
    const titles = clusters.clusters.map((cluster) => String(cluster.clusterTitle));
    assert.ok(titles.includes("Eurovision 2026"));
    assert.ok(titles.includes("Masters"));
    assert.ok(titles.includes("2026 Seoul Mayoral Election"));

    const eurovision = clusters.clusters.find((cluster) => cluster.clusterTitle === "Eurovision 2026");
    assert.equal(eurovision?.marketCount, 6);
    assert.equal(eurovision?.outsiderCount, 5);
    assert.ok(Number(eurovision?.outsiderConvexityScore) > 0);

    const outsiders = eurovision?.outsiderMarkets as Array<Record<string, unknown>>;
    assert.ok(outsiders.length <= 5);
    assert.ok(outsiders.every((candidate) => Number(candidate.impliedProb) <= 0.30));
  });
});
