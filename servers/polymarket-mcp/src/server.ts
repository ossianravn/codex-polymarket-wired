import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  deletePreview,
  deriveWorstPrice,
  estimateBuyFromBudget,
  estimateSellShares,
  getGeoblockStatus,
  getLiveAlerts,
  getOrderbook,
  getPositions,
  getPreview,
  getPriceHistory,
  getRecentTrades,
  getRewardsStatus,
  hasTradingCredentials,
  hoursUntil,
  invokePythonHelper,
  loadRuntimeConfig,
  normalizeLimitPrice,
  normalizeMarketablePrice,
  resolveDefaultUserAddress,
  resolveMarketByIdentifier,
  searchMarkets,
  storePreview,
  summarizeWarnings,
  type MarketSnapshot,
  type PolicyWarning,
  type Side
} from "../../../packages/polymarket-core/src/index.js";
import {
  computePolicyHash,
  evaluatePolicy,
  loadRiskLimits,
  type RiskLimits
} from "../../../packages/policy-engine/src/index.js";
import { TOOLS } from "./tool-specs.js";

const server = new McpServer(
  {
    name: "polymarket",
    version: "0.2.0"
  },
  {
    capabilities: {
      logging: {}
    }
  }
);

function toolDescription(name: string): string {
  return TOOLS.find((tool) => tool.name === name)?.description ?? name;
}

function textResult(structuredContent: Record<string, unknown>, text?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: text ?? JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

function block(code: string, message: string): PolicyWarning {
  return { code, severity: "block", message };
}

function warn(code: string, message: string): PolicyWarning {
  return { code, severity: "warn", message };
}

function info(code: string, message: string): PolicyWarning {
  return { code, severity: "info", message };
}

export const isoDateTimeSchema = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
  "Invalid ISO datetime"
);

const COLLATERAL_DECIMALS = 6;
const CONDITIONAL_TOKEN_DECIMALS = 6;

function numericValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function normalizeAtomicAmount(value: unknown, decimals: number): number {
  const numeric = numericValue(value);
  if (numeric === undefined) {
    return 0;
  }
  return numeric / 10 ** decimals;
}

export function normalizeAllowanceSnapshot(
  asset: Record<string, unknown>,
  decimals: number
): { allowance: number; allowanceEntries?: Array<{ spender: string; amount: number }> } {
  const directAllowance = numericValue(asset.allowance);
  if (directAllowance !== undefined) {
    return {
      allowance: directAllowance / 10 ** decimals
    };
  }

  const allowanceEntries = Object.entries((asset.allowances ?? {}) as Record<string, unknown>)
    .map(([spender, value]) => ({
      spender,
      amount: normalizeAtomicAmount(value, decimals)
    }))
    .filter((entry) => entry.amount > 0);

  return {
    allowance: allowanceEntries.reduce((max, entry) => Math.max(max, entry.amount), 0),
    allowanceEntries: allowanceEntries.length > 0 ? allowanceEntries : undefined
  };
}

function dedupeWarnings(warnings: PolicyWarning[]): PolicyWarning[] {
  const seen = new Set<string>();
  const output: PolicyWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.severity}:${warning.code}:${warning.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(warning);
    }
  }
  return output;
}

function isPast(dateTime: string): boolean {
  const timestamp = Date.parse(dateTime);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function currentLimits() {
  const config = loadRuntimeConfig();
  const limits = await loadRiskLimits(path.resolve(config.cwd, "configs/risk-limits.yaml"));
  return { config, limits, policyHash: computePolicyHash(limits) };
}

async function geoblockIfNeeded(config: ReturnType<typeof loadRuntimeConfig>, limits: RiskLimits) {
  if (!config.requireGeoblockCheck && !limits.requireGeoblockCheck) {
    return { geoblockPassed: undefined, geoblock: undefined, warnings: [] as PolicyWarning[] };
  }
  try {
    const geoblock = await getGeoblockStatus();
    const blockedRegion = geoblock.blocked === true;
    return {
      geoblockPassed: !blockedRegion,
      geoblock,
      warnings: blockedRegion ? [block("GEO_BLOCKED", `Geoblock check failed for ${String(geoblock.country ?? "unknown region")}.`)] : []
    };
  } catch (error) {
    return {
      geoblockPassed: undefined,
      geoblock: undefined,
      warnings: [warn("GEO_CHECK_FAILED", `Unable to confirm geographic eligibility: ${String(error)}`)]
    };
  }
}

async function openOrdersContext(
  config: ReturnType<typeof loadRuntimeConfig>,
  tokenId?: string,
  market?: string
): Promise<{ allOpenOrders: Record<string, unknown>[]; warnings: PolicyWarning[] }> {
  if (!hasTradingCredentials(config)) {
    return {
      allOpenOrders: [],
      warnings: [info("NO_AUTH", "Authenticated open-order checks were skipped because CLOB credentials are not configured.")]
    };
  }
  try {
    const allOpenOrders = await invokePythonHelper<Record<string, unknown>[]>(config, "open_orders", {
      limit: 500,
      asset_id: tokenId,
      market
    });
    return { allOpenOrders, warnings: [] };
  } catch (error) {
    return {
      allOpenOrders: [],
      warnings: [warn("OPEN_ORDER_CHECK_FAILED", `Unable to load open orders: ${String(error)}`)]
    };
  }
}

async function balanceContext(
  config: ReturnType<typeof loadRuntimeConfig>,
  side: Side,
  tokenId: string,
  orderNotionalUsd: number,
  size: number
): Promise<{ checks: Record<string, unknown>; warnings: PolicyWarning[] }> {
  if (!hasTradingCredentials(config)) {
    return {
      checks: {},
      warnings: [info("NO_AUTH", "Balance and allowance checks were skipped because CLOB credentials are not configured.")]
    };
  }
  try {
    if (side === "BUY") {
      const collateral = await invokePythonHelper<Record<string, unknown>>(config, "balance_allowance", {
        asset_type: "COLLATERAL"
      });
      const balance = normalizeAtomicAmount(collateral.balance, COLLATERAL_DECIMALS);
      const allowanceSnapshot = normalizeAllowanceSnapshot(collateral, COLLATERAL_DECIMALS);
      const allowance = allowanceSnapshot.allowance;
      const warnings: PolicyWarning[] = [];
      if (balance < orderNotionalUsd) {
        warnings.push(
          block("INSUFFICIENT_BALANCE", `Collateral balance ${balance.toFixed(6)} is below required notional ${orderNotionalUsd.toFixed(4)}.`)
        );
      }
      if (allowance < orderNotionalUsd) {
        warnings.push(
          block(
            "INSUFFICIENT_ALLOWANCE",
            `Collateral allowance ${allowance.toFixed(6)} is below required notional ${orderNotionalUsd.toFixed(4)}.`
          )
        );
      }
      return {
        checks: {
          collateral,
          collateral_normalized: {
            balance,
            allowance,
            decimals: COLLATERAL_DECIMALS,
            allowanceEntries: allowanceSnapshot.allowanceEntries
          }
        },
        warnings
      };
    }

    const conditional = await invokePythonHelper<Record<string, unknown>>(config, "balance_allowance", {
      asset_type: "CONDITIONAL",
      token_id: tokenId
    });
    const balance = normalizeAtomicAmount(conditional.balance, CONDITIONAL_TOKEN_DECIMALS);
    const allowanceSnapshot = normalizeAllowanceSnapshot(conditional, CONDITIONAL_TOKEN_DECIMALS);
    const allowance = allowanceSnapshot.allowance;
    const warnings: PolicyWarning[] = [];
    if (balance < size) {
      warnings.push(block("INSUFFICIENT_BALANCE", `Outcome-token balance ${balance.toFixed(6)} is below sell size ${size.toFixed(6)}.`));
    }
    if (allowance < size) {
      warnings.push(
        block("INSUFFICIENT_ALLOWANCE", `Outcome-token allowance ${allowance.toFixed(6)} is below sell size ${size.toFixed(6)}.`)
      );
    }
    return {
      checks: {
        conditional,
        conditional_normalized: {
          balance,
          allowance,
          decimals: CONDITIONAL_TOKEN_DECIMALS,
          allowanceEntries: allowanceSnapshot.allowanceEntries
        }
      },
      warnings
    };
  } catch (error) {
    return {
      checks: {},
      warnings: [warn("BALANCE_CHECK_FAILED", `Unable to verify balances or allowances: ${String(error)}`)]
    };
  }
}

async function exposureContext(
  config: ReturnType<typeof loadRuntimeConfig>,
  marketSnapshot: MarketSnapshot,
  incrementalNotionalUsd: number
): Promise<{ grossExposureUsd: number; marketExposureUsd: number; warnings: PolicyWarning[]; ownerAddress?: string }> {
  const ownerAddress = resolveDefaultUserAddress(config);
  if (!ownerAddress) {
    return {
      ownerAddress: undefined,
      grossExposureUsd: incrementalNotionalUsd,
      marketExposureUsd: incrementalNotionalUsd,
      warnings: [info("NO_OWNER", "Exposure checks were limited because no default owner address is configured.")]
    };
  }
  try {
    const marketPositions = await getPositions(config, {
      ownerAddress,
      market: marketSnapshot.conditionId,
      includeClosed: false,
      limit: 500
    });
    const allPositions = await getPositions(config, {
      ownerAddress,
      includeClosed: false,
      limit: 500
    });

    const marketCurrentExposure = Array.isArray(marketPositions.current)
      ? marketPositions.current.reduce((sum, position) => sum + Math.abs(Number((position as Record<string, unknown>).currentValue ?? 0)), 0)
      : 0;
    const grossCurrentExposure = Number(allPositions.grossCurrentValueUsd ?? 0);

    return {
      ownerAddress,
      grossExposureUsd: Number((grossCurrentExposure + incrementalNotionalUsd).toFixed(4)),
      marketExposureUsd: Number((marketCurrentExposure + incrementalNotionalUsd).toFixed(4)),
      warnings: []
    };
  } catch (error) {
    return {
      ownerAddress,
      grossExposureUsd: incrementalNotionalUsd,
      marketExposureUsd: incrementalNotionalUsd,
      warnings: [warn("EXPOSURE_CHECK_FAILED", `Unable to load current positions: ${String(error)}`)]
    };
  }
}

export function applyOrderbookSummary(
  marketSnapshot: MarketSnapshot,
  orderbook: {
    bestBid?: number;
    bestAsk?: number;
    midpoint?: number;
    tickSize?: number;
    minOrderSize?: number;
    negRisk?: boolean;
  }
): MarketSnapshot {
  return {
    ...marketSnapshot,
    bestBid: orderbook.bestBid ?? marketSnapshot.bestBid,
    bestAsk: orderbook.bestAsk ?? marketSnapshot.bestAsk,
    midpoint: orderbook.midpoint ?? marketSnapshot.midpoint,
    spreadCents:
      orderbook.bestBid !== undefined && orderbook.bestAsk !== undefined
        ? Number(((orderbook.bestAsk - orderbook.bestBid) * 100).toFixed(2))
        : marketSnapshot.spreadCents,
    minimumTickSize: orderbook.tickSize ?? marketSnapshot.minimumTickSize,
    minimumOrderSize: orderbook.minOrderSize ?? marketSnapshot.minimumOrderSize,
    negRisk: orderbook.negRisk ?? marketSnapshot.negRisk
  };
}

function previewSummaryText(previewId: string, warnings: PolicyWarning[], canSubmit: boolean): string {
  const status = canSubmit ? "Preview passed all blocking checks." : "Preview contains blocking issues.";
  const warningText = warnings.length > 0 ? summarizeWarnings(warnings) : "No warnings.";
  return [`Preview ID: ${previewId}`, status, warningText].join("\n");
}

server.registerTool(
  "search_markets",
  {
    description: toolDescription("search_markets"),
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(10),
      active_only: z.boolean().default(true),
      include_closed: z.boolean().default(false),
      min_liquidity_usdc: z.number().min(0).optional(),
      sort_by: z.enum(["relevance", "volume", "liquidity", "newest", "ending_soon"]).default("relevance"),
      tag_filters: z.array(z.string()).max(10).optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const markets = await searchMarkets(config, {
      query: input.query,
      limit: input.limit,
      activeOnly: input.active_only,
      includeClosed: input.include_closed,
      minLiquidityUsd: input.min_liquidity_usdc,
      sortBy: input.sort_by,
      tagFilters: input.tag_filters
    });
    return textResult({ query: input.query, count: markets.length, markets });
  }
);

server.registerTool(
  "get_market_snapshot",
  {
    description: toolDescription("get_market_snapshot"),
    inputSchema: {
      identifier_type: z.enum(["slug", "condition_id", "token_id", "market_id"]),
      identifier: z.string().min(1),
      include_related_markets: z.boolean().default(true),
      include_comments: z.boolean().default(true),
      include_orderbook_summary: z.boolean().default(true)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const snapshot = await resolveMarketByIdentifier(config, input.identifier_type, input.identifier, {
      includeRelatedMarkets: input.include_related_markets,
      includeComments: input.include_comments,
      includeOrderbookSummary: input.include_orderbook_summary
    });
    return textResult(snapshot as unknown as Record<string, unknown>);
  }
);

server.registerTool(
  "get_orderbook",
  {
    description: toolDescription("get_orderbook"),
    inputSchema: {
      token_id: z.string().min(1),
      depth: z.number().int().min(1).max(200).default(50)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const book = await getOrderbook(config, input.token_id, input.depth);
    return textResult(book as unknown as Record<string, unknown>);
  }
);

server.registerTool(
  "get_price_history",
  {
    description: toolDescription("get_price_history"),
    inputSchema: {
      token_id: z.string().min(1),
      interval: z.enum(["1m", "5m", "15m", "1h", "6h", "1d"]),
      start: isoDateTimeSchema.optional(),
      end: isoDateTimeSchema.optional(),
      limit: z.number().int().min(1).max(500).default(100)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const history = await getPriceHistory(config, input.token_id, input.interval, input.start, input.end, input.limit);
    return textResult(history);
  }
);

server.registerTool(
  "get_recent_trades",
  {
    description: toolDescription("get_recent_trades"),
    inputSchema: {
      scope_type: z.enum(["condition_id", "token_id", "market_id"]),
      scope_id: z.string().min(1),
      side: z.enum(["BUY", "SELL"]).optional(),
      status: z.array(z.enum(["MATCHED", "MINED", "CONFIRMED", "RETRYING", "FAILED"])).max(5).optional(),
      limit: z.number().int().min(1).max(200).default(50)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const trades = await getRecentTrades(config, {
      scopeType: input.scope_type,
      scopeId: input.scope_id,
      side: input.side,
      limit: input.limit
    });
    if (input.status && input.status.length > 0) {
      (trades as Record<string, unknown>).requestedStatusFilter = input.status;
    }
    return textResult(trades);
  }
);

server.registerTool(
  "get_open_orders",
  {
    description: toolDescription("get_open_orders"),
    inputSchema: {
      market: z.string().optional(),
      asset_id: z.string().optional(),
      side: z.enum(["BUY", "SELL"]).optional(),
      limit: z.number().int().min(1).max(500).default(100)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required for open-order queries.");
    }
    const orders = await invokePythonHelper<Record<string, unknown>[]>(config, "open_orders", {
      market: input.market,
      asset_id: input.asset_id,
      side: input.side,
      limit: input.limit
    });
    return textResult({ count: orders.length, orders });
  }
);

server.registerTool(
  "get_positions",
  {
    description: toolDescription("get_positions"),
    inputSchema: {
      owner_address: z.string().optional(),
      market: z.string().optional(),
      include_closed: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(100)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const positions = await getPositions(config, {
      ownerAddress: input.owner_address,
      market: input.market,
      includeClosed: input.include_closed,
      limit: input.limit
    });
    return textResult(positions);
  }
);

server.registerTool(
  "get_rewards_status",
  {
    description: toolDescription("get_rewards_status"),
    inputSchema: {
      market: z.string().optional(),
      order_ids: z.array(z.string()).min(1).max(50).optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const rewards = await getRewardsStatus(config, {
      market: input.market,
      orderIds: input.order_ids
    });
    return textResult(rewards);
  }
);

server.registerTool(
  "get_live_alerts",
  {
    description: toolDescription("get_live_alerts"),
    inputSchema: {
      scope: z.enum(["watchlist", "portfolio", "all"]).default("all"),
      since: isoDateTimeSchema.optional(),
      limit: z.number().int().min(1).max(200).default(50)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const alerts = await getLiveAlerts(config, {
      scope: input.scope,
      since: input.since,
      limit: input.limit
    });
    return textResult(alerts);
  }
);

server.registerTool(
  "preview_limit_order",
  {
    description: toolDescription("preview_limit_order"),
    inputSchema: {
      token_id: z.string().min(1),
      side: z.enum(["BUY", "SELL"]),
      price: z.number().gt(0).lte(1),
      size: z.number().gt(0),
      order_type: z.enum(["GTC", "GTD"]).default("GTC"),
      expiration: isoDateTimeSchema.optional(),
      post_only: z.boolean().default(false),
      client_order_id: z.string().max(128).optional()
    }
  },
  async (input) => {
    const { config, limits, policyHash } = await currentLimits();
    const warnings: PolicyWarning[] = [];

    const marketSnapshot = await resolveMarketByIdentifier(config, "token_id", input.token_id, {
      includeComments: false,
      includeOrderbookSummary: false,
      includeRelatedMarkets: false
    });
    const orderbook = await getOrderbook(config, input.token_id, 50);
    const liveMarketSnapshot = applyOrderbookSummary(marketSnapshot, orderbook);

    const tickSize = orderbook.tickSize ?? liveMarketSnapshot.minimumTickSize ?? 0.01;
    const normalizedPrice = normalizeLimitPrice(input.side, input.price, tickSize);
    if (normalizedPrice !== input.price) {
      warnings.push(info("PRICE_ADJUSTED", `Price ${input.price} was normalized to ${normalizedPrice} to respect tick size ${tickSize}.`));
    }

    if (input.order_type === "GTD" && !input.expiration) {
      warnings.push(block("MISSING_EXPIRATION", "GTD orders require an expiration timestamp."));
    }
    if (input.expiration && isPast(input.expiration)) {
      warnings.push(block("EXPIRATION_IN_PAST", "Expiration must be in the future."));
    }

    if (input.post_only && input.side === "BUY" && orderbook.bestAsk !== undefined && normalizedPrice >= orderbook.bestAsk) {
      warnings.push(block("POST_ONLY_CROSSES_BOOK", `BUY post-only price ${normalizedPrice} crosses the best ask ${orderbook.bestAsk}.`));
    }
    if (input.post_only && input.side === "SELL" && orderbook.bestBid !== undefined && normalizedPrice <= orderbook.bestBid) {
      warnings.push(block("POST_ONLY_CROSSES_BOOK", `SELL post-only price ${normalizedPrice} crosses the best bid ${orderbook.bestBid}.`));
    }
    if (!input.post_only && input.side === "BUY" && orderbook.bestAsk !== undefined && normalizedPrice >= orderbook.bestAsk) {
      warnings.push(warn("IMMEDIATE_EXECUTION", "This limit buy is marketable and may execute immediately against the ask."));
    }
    if (!input.post_only && input.side === "SELL" && orderbook.bestBid !== undefined && normalizedPrice <= orderbook.bestBid) {
      warnings.push(warn("IMMEDIATE_EXECUTION", "This limit sell is marketable and may execute immediately against the bid."));
    }

    const orderNotionalUsd = Number((normalizedPrice * input.size).toFixed(6));
    const geoblockContext = await geoblockIfNeeded(config, limits);
    warnings.push(...geoblockContext.warnings);

    const exposure = await exposureContext(config, liveMarketSnapshot, orderNotionalUsd);
    warnings.push(...exposure.warnings);

    const openOrders = await openOrdersContext(config, undefined, liveMarketSnapshot.conditionId);
    warnings.push(...openOrders.warnings);

    const balance = await balanceContext(config, input.side, input.token_id, orderNotionalUsd, input.size);
    warnings.push(...balance.warnings);

    const policy = evaluatePolicy(limits, {
      marketId: liveMarketSnapshot.conditionId,
      tokenId: input.token_id,
      tags: liveMarketSnapshot.tags,
      orderNotionalUsd,
      marketExposureUsd: exposure.marketExposureUsd,
      grossExposureUsd: exposure.grossExposureUsd,
      openOrderCount: openOrders.allOpenOrders.length,
      resolvesWithinHours: hoursUntil(liveMarketSnapshot.endDate),
      geoblockPassed: geoblockContext.geoblockPassed
    });
    warnings.push(...policy.warnings);

    const submissionPayload = {
      kind: "limit",
      token_id: input.token_id,
      side: input.side,
      price: normalizedPrice,
      size: input.size,
      order_type: input.order_type,
      expiration: input.expiration ? Math.floor(Date.parse(input.expiration) / 1000) : undefined,
      post_only: input.post_only,
      client_order_id: input.client_order_id,
      tick_size: String(tickSize),
      neg_risk: marketSnapshot.negRisk ?? false
    };

    const preview = storePreview({
      orderKind: "limit",
      normalizedParams: {
        token_id: input.token_id,
        side: input.side,
        normalized_price: normalizedPrice,
        requested_price: input.price,
        size: input.size,
        order_type: input.order_type,
        expiration: input.expiration,
        post_only: input.post_only,
        order_notional_usd: orderNotionalUsd,
        tick_size: tickSize,
        best_bid: orderbook.bestBid,
        best_ask: orderbook.bestAsk
      },
      warnings: dedupeWarnings(warnings),
      canSubmit: policy.allow && !warnings.some((warning) => warning.severity === "block"),
      policyHash,
      submissionPayload,
      marketSnapshot: liveMarketSnapshot
    });

    return textResult(
      {
        preview,
        marketSnapshot: liveMarketSnapshot,
        geoblock: geoblockContext.geoblock,
        balances: balance.checks,
        ownerAddress: exposure.ownerAddress,
        openOrderCount: openOrders.allOpenOrders.length,
        policySummary: summarizeWarnings(dedupeWarnings(warnings))
      },
      previewSummaryText(preview.previewId, preview.warnings, preview.canSubmit)
    );
  }
);

server.registerTool(
  "preview_marketable_order",
  {
    description: toolDescription("preview_marketable_order"),
    inputSchema: {
      token_id: z.string().min(1),
      side: z.enum(["BUY", "SELL"]),
      order_type: z.enum(["FOK", "FAK"]).default("FAK"),
      budget_usdc: z.number().gt(0).optional(),
      shares: z.number().gt(0).optional(),
      worst_price: z.number().gt(0).lte(1).optional(),
      max_slippage_bps: z.number().int().min(1).max(5000).default(200),
      client_order_id: z.string().max(128).optional()
    }
  },
  async (input) => {
    const { config, limits, policyHash } = await currentLimits();
    const warnings: PolicyWarning[] = [];
    if (input.side === "BUY" && input.budget_usdc === undefined) {
      warnings.push(block("MISSING_BUDGET", "BUY marketable previews require budget_usdc."));
    }
    if (input.side === "SELL" && input.shares === undefined) {
      warnings.push(block("MISSING_SHARES", "SELL marketable previews require shares."));
    }

    const marketSnapshot = await resolveMarketByIdentifier(config, "token_id", input.token_id, {
      includeComments: false,
      includeOrderbookSummary: false,
      includeRelatedMarkets: false
    });
    const orderbook = await getOrderbook(config, input.token_id, 100);
    const liveMarketSnapshot = applyOrderbookSummary(marketSnapshot, orderbook);
    const tickSize = orderbook.tickSize ?? marketSnapshot.minimumTickSize ?? 0.01;
    const effectiveTickSize = orderbook.tickSize ?? liveMarketSnapshot.minimumTickSize ?? 0.01;

    const topOfBook = input.side === "BUY" ? orderbook.bestAsk : orderbook.bestBid;
    if (topOfBook === undefined) {
      warnings.push(block("NO_LIQUIDITY", `No ${input.side === "BUY" ? "asks" : "bids"} are currently available on the book.`));
    }

    const requestedWorst = input.worst_price ?? (topOfBook !== undefined ? deriveWorstPrice({ side: input.side, topOfBookPrice: topOfBook, maxSlippageBps: input.max_slippage_bps }) : undefined);
    const normalizedWorst = requestedWorst !== undefined ? normalizeMarketablePrice(input.side, requestedWorst, effectiveTickSize) : undefined;
    if (requestedWorst !== undefined && normalizedWorst !== undefined && normalizedWorst !== requestedWorst) {
      warnings.push(info("PRICE_ADJUSTED", `Worst price ${requestedWorst} was normalized to ${normalizedWorst} for tick size ${effectiveTickSize}.`));
    }

    let estimate;
    let incrementalNotionalUsd = 0;
    if (normalizedWorst !== undefined) {
      if (input.side === "BUY") {
        estimate = estimateBuyFromBudget(orderbook.asks, input.budget_usdc ?? 0, normalizedWorst);
        incrementalNotionalUsd = input.budget_usdc ?? 0;
        if (input.order_type === "FOK" && !estimate.fullyFilled) {
          warnings.push(block("FOK_NOT_FULLY_FILLED", "Estimated book depth suggests the FOK buy would not fill completely at the requested worst price."));
        } else if (!estimate.fullyFilled) {
          warnings.push(warn("PARTIAL_FILL", "Available asks do not cover the full budget at the requested worst price."));
        }
      } else {
        estimate = estimateSellShares(orderbook.bids, input.shares ?? 0, normalizedWorst);
        incrementalNotionalUsd = estimate.totalNotionalUsd || ((input.shares ?? 0) * normalizedWorst);
        if (input.order_type === "FOK" && !estimate.fullyFilled) {
          warnings.push(block("FOK_NOT_FULLY_FILLED", "Estimated book depth suggests the FOK sell would not fill completely at the requested worst price."));
        } else if (!estimate.fullyFilled) {
          warnings.push(warn("PARTIAL_FILL", "Available bids do not cover the full sell size at the requested worst price."));
        }
      }
    }

    const geoblockContext = await geoblockIfNeeded(config, limits);
    warnings.push(...geoblockContext.warnings);

    const exposure = await exposureContext(config, liveMarketSnapshot, incrementalNotionalUsd);
    warnings.push(...exposure.warnings);

    const openOrders = await openOrdersContext(config, undefined, liveMarketSnapshot.conditionId);
    warnings.push(...openOrders.warnings);

    const balance = await balanceContext(
      config,
      input.side,
      input.token_id,
      incrementalNotionalUsd,
      input.shares ?? 0
    );
    warnings.push(...balance.warnings);

    const policy = evaluatePolicy(limits, {
      marketId: liveMarketSnapshot.conditionId,
      tokenId: input.token_id,
      tags: liveMarketSnapshot.tags,
      orderNotionalUsd: incrementalNotionalUsd,
      marketExposureUsd: exposure.marketExposureUsd,
      grossExposureUsd: exposure.grossExposureUsd,
      openOrderCount: openOrders.allOpenOrders.length,
      resolvesWithinHours: hoursUntil(liveMarketSnapshot.endDate),
      geoblockPassed: geoblockContext.geoblockPassed
    });
    warnings.push(...policy.warnings);

    const submissionPayload = {
      kind: "marketable",
      token_id: input.token_id,
      side: input.side,
      order_type: input.order_type,
      budget_usdc: input.budget_usdc,
      shares: input.shares,
      worst_price: normalizedWorst,
      max_slippage_bps: input.max_slippage_bps,
      client_order_id: input.client_order_id,
      tick_size: String(tickSize),
      neg_risk: marketSnapshot.negRisk ?? false
    };

    const preview = storePreview({
      orderKind: "marketable",
      normalizedParams: {
        token_id: input.token_id,
        side: input.side,
        order_type: input.order_type,
        requested_worst_price: input.worst_price,
        normalized_worst_price: normalizedWorst,
        budget_usdc: input.budget_usdc,
        shares: input.shares,
        max_slippage_bps: input.max_slippage_bps,
        estimate,
        tick_size: tickSize,
        best_bid: orderbook.bestBid,
        best_ask: orderbook.bestAsk
      },
      warnings: dedupeWarnings(warnings),
      canSubmit: policy.allow && !warnings.some((warning) => warning.severity === "block"),
      policyHash,
      submissionPayload,
      marketSnapshot: liveMarketSnapshot
    });

    return textResult(
      {
        preview,
        marketSnapshot: liveMarketSnapshot,
        geoblock: geoblockContext.geoblock,
        balances: balance.checks,
        ownerAddress: exposure.ownerAddress,
        openOrderCount: openOrders.allOpenOrders.length,
        policySummary: summarizeWarnings(dedupeWarnings(warnings))
      },
      previewSummaryText(preview.previewId, preview.warnings, preview.canSubmit)
    );
  }
);

server.registerTool(
  "submit_previewed_order",
  {
    description: toolDescription("submit_previewed_order"),
    inputSchema: {
      preview_id: z.string().min(1),
      expected_policy_hash: z.string().optional(),
      note: z.string().max(500).optional()
    }
  },
  async (input) => {
    const { config, limits, policyHash } = await currentLimits();
    const preview = getPreview(input.preview_id);
    if (!preview) {
      throw new Error(`Unknown preview_id ${input.preview_id}. Generate a fresh preview first.`);
    }
    if (config.requirePreview || limits.requirePreviewBeforeSubmit) {
      if (!preview.canSubmit) {
        throw new Error(`Preview ${input.preview_id} is not currently submit-safe. Re-run the preview after fixing blocking issues.`);
      }
    }
    if (!config.enableTrading || !limits.tradingEnabled) {
      throw new Error("Trading is disabled. Set POLYMARKET_ENABLE_TRADING=true and trading_enabled: true to submit live orders.");
    }
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required for live order submission.");
    }
    if (input.expected_policy_hash && input.expected_policy_hash !== preview.policyHash) {
      throw new Error(`expected_policy_hash mismatch. Preview was generated with ${preview.policyHash}.`);
    }
    if (preview.policyHash !== policyHash) {
      throw new Error("Risk policy changed since the preview was generated. Re-run the preview before submitting.");
    }

    const result = await invokePythonHelper<Record<string, unknown>>(config, "submit_preview", preview.submissionPayload);
    deletePreview(preview.previewId);
    return textResult({ preview, result, note: input.note });
  }
);

server.registerTool(
  "cancel_orders",
  {
    description: toolDescription("cancel_orders"),
    inputSchema: {
      order_ids: z.array(z.string()).min(1).max(100)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required to cancel orders.");
    }
    const result = await invokePythonHelper<Record<string, unknown>>(config, "cancel_orders", {
      order_ids: input.order_ids
    });
    return textResult(result);
  }
);

server.registerTool(
  "cancel_market_orders",
  {
    description: toolDescription("cancel_market_orders"),
    inputSchema: {
      market: z.string().optional(),
      asset_id: z.string().optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required to cancel market orders.");
    }
    const result = await invokePythonHelper<Record<string, unknown>>(config, "cancel_market_orders", {
      market: input.market,
      asset_id: input.asset_id
    });
    return textResult(result);
  }
);

server.registerTool(
  "cancel_all_orders",
  {
    description: toolDescription("cancel_all_orders"),
    inputSchema: {
      acknowledge_all_markets: z.literal(true),
      note: z.string().max(200).optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required to cancel all orders.");
    }
    const result = await invokePythonHelper<Record<string, unknown>>(config, "cancel_all_orders", {
      acknowledge_all_markets: input.acknowledge_all_markets
    });
    return textResult({ result, note: input.note });
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("polymarket MCP server running on stdio");
}

const isEntrypoint = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
