import path from "node:path";
import process from "node:process";

import {
  ingestUniverseMarkets,
  loadDiscoveryPolicies,
  normalizeUniverseMarketForStorage,
  type UniverseMarket,
  type UniverseSource
} from "../packages/market-universe/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import {
  openStateStore,
  type StoredUniverseMarketInput
} from "../packages/state-store/src/index.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const output: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      output[key] = true;
      continue;
    }
    output[key] = next;
    index += 1;
  }
  return output;
}

function asNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function numericValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toStoredUniverseMarketInput(
  runId: string,
  market: UniverseMarket,
  capturedAt: string
): StoredUniverseMarketInput {
  const normalized = normalizeUniverseMarketForStorage(market) as Record<string, unknown>;
  return {
    runId,
    marketKey: String(normalized.marketKey ?? market.marketKey),
    title: String(normalized.title ?? market.title),
    marketId: firstString(normalized.marketId),
    conditionId: firstString(normalized.conditionId),
    questionId: firstString(normalized.questionId),
    eventId: firstString(normalized.eventId),
    eventSlug: firstString(normalized.eventSlug),
    eventTitle: firstString(normalized.eventTitle),
    seriesSlug: firstString(normalized.seriesSlug),
    seriesTitle: firstString(normalized.seriesTitle),
    slug: firstString(normalized.slug),
    description: firstString(normalized.description),
    resolutionSource: firstString(normalized.resolutionSource),
    resolutionText: firstString(normalized.resolutionText),
    category: firstString(normalized.category),
    subcategory: firstString(normalized.subcategory),
    tags: Array.isArray(normalized.tags) ? normalized.tags.map(String) : [],
    outcomes: Array.isArray(normalized.outcomes) ? normalized.outcomes.map(String) : [],
    outcomePrices: Array.isArray(normalized.outcomePrices) ? normalized.outcomePrices.map((value) => Number(value)) : [],
    clobTokenIds: Array.isArray(normalized.clobTokenIds) ? normalized.clobTokenIds.map(String) : [],
    yesTokenId: firstString(normalized.yesTokenId),
    noTokenId: firstString(normalized.noTokenId),
    active: typeof normalized.active === "boolean" ? normalized.active : undefined,
    closed: typeof normalized.closed === "boolean" ? normalized.closed : undefined,
    archived: typeof normalized.archived === "boolean" ? normalized.archived : undefined,
    restricted: typeof normalized.restricted === "boolean" ? normalized.restricted : undefined,
    acceptingOrders: typeof normalized.acceptingOrders === "boolean" ? normalized.acceptingOrders : undefined,
    enableOrderBook: typeof normalized.enableOrderBook === "boolean" ? normalized.enableOrderBook : undefined,
    startDate: firstString(normalized.startDate),
    endDate: firstString(normalized.endDate),
    createdAt: firstString(normalized.createdAt),
    updatedAt: firstString(normalized.updatedAt),
    liquidityUsd: numericValue(normalized.liquidityUsd),
    liquidityClobUsd: numericValue(normalized.liquidityClobUsd),
    volumeUsd: numericValue(normalized.volumeUsd),
    volume24hUsd: numericValue(normalized.volume24hUsd),
    volume7dUsd: numericValue(normalized.volume7dUsd),
    volume30dUsd: numericValue(normalized.volume30dUsd),
    impliedProb: numericValue(normalized.impliedProb),
    lastTradePrice: numericValue(normalized.lastTradePrice),
    bestBid: numericValue(normalized.bestBid),
    bestAsk: numericValue(normalized.bestAsk),
    midpoint: numericValue(normalized.midpoint),
    spreadCents: numericValue(normalized.spreadCents),
    orderPriceMinTickSize: numericValue(normalized.orderPriceMinTickSize),
    orderMinSize: numericValue(normalized.orderMinSize),
    negRisk: typeof normalized.negRisk === "boolean" ? normalized.negRisk : undefined,
    depthUsdWithin2c: numericValue(normalized.depthUsdWithin2c),
    depthUsdWithin5c: numericValue(normalized.depthUsdWithin5c),
    slippageCentsAt50Usd: numericValue(normalized.slippageCentsAt50Usd),
    slippageCentsAt250Usd: numericValue(normalized.slippageCentsAt250Usd),
    structuralType: firstString(normalized.structuralType),
    categoryGroup: firstString(normalized.categoryGroup),
    horizonBucket: firstString(normalized.horizonBucket),
    priceBucket: firstString(normalized.priceBucket),
    liquidityBucket: firstString(normalized.liquidityBucket),
    spreadBucket: firstString(normalized.spreadBucket),
    opportunityMode: firstString(normalized.opportunityMode),
    modelabilityScore: numericValue(normalized.modelabilityScore),
    tradabilityScore: numericValue(normalized.tradabilityScore),
    catalystScore: numericValue(normalized.catalystScore),
    resolutionAmbiguityScore: numericValue(normalized.resolutionAmbiguityScore),
    attentionGapScore: numericValue(normalized.attentionGapScore),
    crossMarketScore: numericValue(normalized.crossMarketScore),
    researchPriorityScore: numericValue(normalized.researchPriorityScore),
    tradeOpportunityScore: numericValue(normalized.tradeOpportunityScore),
    makerScore: numericValue(normalized.makerScore),
    riskScore: numericValue(normalized.riskScore),
    reasonCodes: Array.isArray(normalized.reasonCodes) ? normalized.reasonCodes.map(String) : [],
    disqualifiers: Array.isArray(normalized.disqualifiers) ? normalized.disqualifiers.map(String) : [],
    rawJson: {
      rawGammaMarket: market.rawGammaMarket,
      rawGammaEvent: market.rawGammaEvent
    },
    capturedAt
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadRuntimeConfig();
  const policies = await loadDiscoveryPolicies(path.resolve(config.cwd, "configs/discovery-policies.yaml"));
  const store = openStateStore(config.stateDbPath);

  const result = await ingestUniverseMarkets(
    config,
    {
      source: (firstString(args.source) as UniverseSource | undefined) ?? policies.defaults.source,
      pageSize: asNumber(args["page-size"]) ?? policies.defaults.pageSize,
      limitPages: asNumber(args["limit-pages"]),
      minLiquidityUsdc: asNumber(args["min-liquidity-usdc"]) ?? policies.defaults.minLiquidityUsdc,
      includeTags: true,
      order: policies.defaults.order,
      ascending: policies.defaults.ascending,
      enrichTopN: asNumber(args["enrich-top-n"]) ?? policies.defaults.enrichTopN,
      enrichmentProfile:
        firstString(args["enrichment-profile"]) as "none" | "microstructure" | "microstructure_and_history" | undefined
    },
    policies
  );

  const capturedAt = new Date().toISOString();
  const runId = store.startUniverseRun({
    source: result.source,
    activeOnly: true,
    closedIncluded: false,
    status: "running",
    metadata: {
      pageCount: result.pageCount,
      cli: true
    }
  });
  store.recordUniverseMarkets(
    runId,
    result.markets.map((market) => toStoredUniverseMarketInput(runId, market, capturedAt))
  );
  store.completeUniverseRun(runId, {
    status: "completed",
    completedAt: capturedAt,
    totalEvents: result.rawEvents.length,
    totalMarkets: result.markets.length,
    enrichedMarkets: result.enrichedCount
  });

  const top = result.markets
    .slice()
    .sort((left, right) => right.researchPriorityScore - left.researchPriorityScore)
    .slice(0, 10)
    .map((market) => ({
      market_key: market.marketKey,
      title: market.title,
      category_group: market.categoryGroup,
      structural_type: market.structuralType,
      horizon_bucket: market.horizonBucket,
      implied_prob: market.impliedProb,
      liquidity_usd: market.liquidityUsd,
      spread_cents: market.spreadCents,
      research_priority_score: market.researchPriorityScore,
      reason_codes: market.reasonCodes
    }));

  console.log(JSON.stringify({
    run_id: runId,
    total_markets: result.markets.length,
    enriched_markets: result.enrichedCount,
    top_candidates: top
  }, null, 2));
}

main().catch((error) => {
  console.error("universe-discovery error:", error);
  process.exit(1);
});
