import type { RuntimeConfig } from "../../polymarket-core/src/index.js";
import { getOrderbook, type OrderbookSnapshot } from "../../polymarket-core/src/index.js";
import type {
  StateStore,
  StoredUniverseMarketInput
} from "../../state-store/src/index.js";
import type { AutoTradingMandate } from "./index.js";

export interface AutoTradingSnapshotRefreshInput {
  runId?: string;
  mandate: AutoTradingMandate;
  limit?: number;
  candidatePoolLimit?: number;
  maxAgeMinutes?: number;
  now?: Date;
  orderbookFetcher?: (config: RuntimeConfig, tokenId: string, depth: number) => Promise<OrderbookSnapshot>;
}

export interface AutoTradingSnapshotRefreshIssue {
  marketKey: string;
  title?: string;
  status: "refreshed" | "skipped" | "failed";
  reasonCodes: string[];
  tokenId?: string;
  previousCapturedAt?: string;
  capturedAt?: string;
  bestBid?: number;
  bestAsk?: number;
  spreadCents?: number;
  error?: string;
}

export interface AutoTradingSnapshotRefreshResult {
  generatedAt: string;
  runId?: string;
  scannedMarkets: number;
  attempted: number;
  refreshed: number;
  skippedFresh: number;
  skippedMissingToken: number;
  failed: number;
  issues: AutoTradingSnapshotRefreshIssue[];
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function snapshotAgeMinutes(market: Record<string, unknown>, now: Date): number | undefined {
  const capturedAt = asString(market.capturedAt) ?? asString(market.updatedAt) ?? asString(market.createdAt);
  if (!capturedAt) {
    return undefined;
  }
  const ms = Date.parse(capturedAt);
  return Number.isFinite(ms) ? Math.max(0, (now.getTime() - ms) / 60_000) : undefined;
}

function spreadCents(book: OrderbookSnapshot): number | undefined {
  if (book.bestBid === undefined || book.bestAsk === undefined) {
    return undefined;
  }
  return Number(((book.bestAsk - book.bestBid) * 100).toFixed(4));
}

function notionalDepthWithin(
  levels: Array<{ price: number; size: number }>,
  predicate: (price: number) => boolean
): number | undefined {
  if (levels.length === 0) {
    return undefined;
  }
  const notional = levels
    .filter((level) => predicate(level.price))
    .reduce((sum, level) => sum + level.price * level.size, 0);
  return Number(notional.toFixed(6));
}

function depthUsdWithin2c(book: OrderbookSnapshot): number | undefined {
  if (book.bestAsk !== undefined) {
    return notionalDepthWithin(book.asks, (price) => price <= (book.bestAsk as number) + 0.02);
  }
  if (book.bestBid !== undefined) {
    return notionalDepthWithin(book.bids, (price) => price >= (book.bestBid as number) - 0.02);
  }
  return undefined;
}

function depthUsdWithin5c(book: OrderbookSnapshot): number | undefined {
  if (book.bestAsk !== undefined) {
    return notionalDepthWithin(book.asks, (price) => price <= (book.bestAsk as number) + 0.05);
  }
  if (book.bestBid !== undefined) {
    return notionalDepthWithin(book.bids, (price) => price >= (book.bestBid as number) - 0.05);
  }
  return undefined;
}

function executionTokenId(market: Record<string, unknown>): string | undefined {
  return asString(market.yesTokenId) ?? asStringArray(market.clobTokenIds)[0];
}

function mergeMarketWithBook(
  market: Record<string, unknown>,
  runId: string,
  book: OrderbookSnapshot,
  capturedAt: string
): StoredUniverseMarketInput {
  const nextSpreadCents = spreadCents(book);
  const midpoint = book.midpoint ?? (
    book.bestBid !== undefined && book.bestAsk !== undefined
      ? Number(((book.bestBid + book.bestAsk) / 2).toFixed(4))
      : undefined
  );
  const rawJson = {
    ...(market.rawJson && typeof market.rawJson === "object" ? market.rawJson as Record<string, unknown> : {}),
    targetedSnapshotRefresh: {
      capturedAt,
      tokenId: book.tokenId,
      bestBid: book.bestBid,
      bestAsk: book.bestAsk,
      midpoint,
      spreadCents: nextSpreadCents,
      hash: book.hash
    }
  };

  return {
    ...market,
    runId,
    marketKey: String(market.marketKey),
    title: String(market.title ?? "Untitled market"),
    bestBid: book.bestBid ?? asNumber(market.bestBid),
    bestAsk: book.bestAsk ?? asNumber(market.bestAsk),
    midpoint: midpoint ?? asNumber(market.midpoint),
    spreadCents: nextSpreadCents ?? asNumber(market.spreadCents),
    orderPriceMinTickSize: book.tickSize ?? asNumber(market.orderPriceMinTickSize),
    orderMinSize: book.minOrderSize ?? asNumber(market.orderMinSize),
    negRisk: book.negRisk ?? (typeof market.negRisk === "boolean" ? market.negRisk : undefined),
    depthUsdWithin2c: depthUsdWithin2c(book) ?? asNumber(market.depthUsdWithin2c),
    depthUsdWithin5c: depthUsdWithin5c(book) ?? asNumber(market.depthUsdWithin5c),
    impliedProb: midpoint ?? book.bestAsk ?? book.bestBid ?? asNumber(market.impliedProb),
    clobTokenIds: asStringArray(market.clobTokenIds),
    yesTokenId: asString(market.yesTokenId),
    noTokenId: asString(market.noTokenId),
    tags: asStringArray(market.tags),
    outcomes: asStringArray(market.outcomes),
    outcomePrices: Array.isArray(market.outcomePrices)
      ? market.outcomePrices.map(Number).filter(Number.isFinite)
      : [],
    reasonCodes: asStringArray(market.reasonCodes),
    disqualifiers: asStringArray(market.disqualifiers),
    rawJson,
    capturedAt
  } as StoredUniverseMarketInput;
}

function uniqueMarkets(markets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const output: Array<Record<string, unknown>> = [];
  for (const market of markets) {
    const marketKey = asString(market.marketKey);
    if (!marketKey || seen.has(marketKey)) {
      continue;
    }
    seen.add(marketKey);
    output.push(market);
  }
  return output;
}

export function selectAutoTradingSnapshotRefreshMarkets(
  store: StateStore,
  input: AutoTradingSnapshotRefreshInput
): { runId?: string; markets: Array<Record<string, unknown>> } {
  const latestRunId = asString(store.getLatestUniverseRun()?.runId);
  const runId = input.runId ?? latestRunId;
  if (!runId) {
    return { markets: [] };
  }
  const candidatePoolLimit = Math.max(25, Math.min(1_000, input.candidatePoolLimit ?? Math.max(250, (input.limit ?? 25) * 20)));
  const baseFilters = {
    runId,
    minLiquidityUsdc: Math.max(0, input.mandate.minLiquidityUsdc * 0.5),
    maxSpreadCents: Math.max(input.mandate.maxSpreadCents, input.mandate.maxSpreadCents + 2),
    limit: candidatePoolLimit
  };
  const pools = [
    store.listUniverseMarkets({ ...baseFilters, sort: "trade_opportunity_desc" }).markets,
    store.listUniverseMarkets({ ...baseFilters, sort: "ending_soon" }).markets,
    store.listUniverseMarkets({ ...baseFilters, sort: "volume_24h_desc" }).markets
  ];
  return {
    runId,
    markets: uniqueMarkets(pools.flat()).slice(0, Math.max(1, Math.min(250, input.limit ?? 50)))
  };
}

export async function refreshAutoTradingMarketSnapshots(
  store: StateStore,
  config: RuntimeConfig,
  input: AutoTradingSnapshotRefreshInput
): Promise<AutoTradingSnapshotRefreshResult> {
  const now = input.now ?? new Date();
  const capturedAt = now.toISOString();
  const maxAgeMinutes = Math.max(0, input.maxAgeMinutes ?? 5);
  const selected = selectAutoTradingSnapshotRefreshMarkets(store, input);
  const result: AutoTradingSnapshotRefreshResult = {
    generatedAt: capturedAt,
    runId: selected.runId,
    scannedMarkets: selected.markets.length,
    attempted: 0,
    refreshed: 0,
    skippedFresh: 0,
    skippedMissingToken: 0,
    failed: 0,
    issues: []
  };

  if (!selected.runId) {
    return result;
  }

  for (const market of selected.markets) {
    const marketKey = String(market.marketKey ?? "");
    const title = asString(market.title);
    const previousCapturedAt = asString(market.capturedAt);
    const ageMinutes = snapshotAgeMinutes(market, now);
    if (ageMinutes !== undefined && ageMinutes <= maxAgeMinutes) {
      result.skippedFresh += 1;
      result.issues.push({
        marketKey,
        title,
        status: "skipped",
        reasonCodes: ["snapshot_already_fresh"],
        previousCapturedAt
      });
      continue;
    }

    const tokenId = executionTokenId(market);
    if (!tokenId) {
      result.skippedMissingToken += 1;
      result.issues.push({
        marketKey,
        title,
        status: "skipped",
        reasonCodes: ["missing_execution_token_id"],
        previousCapturedAt
      });
      continue;
    }

    result.attempted += 1;
    try {
      const fetchOrderbook = input.orderbookFetcher ?? getOrderbook;
      const book = await fetchOrderbook(config, tokenId, 50);
      const updated = mergeMarketWithBook(market, selected.runId, book, capturedAt);
      store.recordUniverseMarkets(selected.runId, [updated]);
      result.refreshed += 1;
      result.issues.push({
        marketKey,
        title,
        status: "refreshed",
        reasonCodes: ["orderbook_snapshot_refreshed"],
        tokenId,
        previousCapturedAt,
        capturedAt,
        bestBid: book.bestBid,
        bestAsk: book.bestAsk,
        spreadCents: spreadCents(book)
      });
    } catch (error) {
      result.failed += 1;
      result.issues.push({
        marketKey,
        title,
        status: "failed",
        reasonCodes: ["orderbook_snapshot_refresh_failed"],
        tokenId,
        previousCapturedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}
