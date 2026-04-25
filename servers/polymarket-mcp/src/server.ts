import path from "node:path";
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import YAML from "yaml";

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
  type PreviewRecord,
  type Side
} from "../../../packages/polymarket-core/src/index.js";
import {
  applyUniverseViewDefaults,
  enrichUniverseMarkets,
  filtersForCandidateProfile,
  ingestUniverseMarkets,
  loadDiscoveryPolicies,
  normalizeUniverseMarketForStorage,
  type CandidateProfile,
  type DiscoveryPolicies,
  type ListUniverseFilters,
  type UniverseMarket,
  type UniverseSource
} from "../../../packages/market-universe/src/index.js";
import {
  computePolicyHash,
  evaluatePolicy,
  loadRiskLimits,
  type RiskLimits
} from "../../../packages/policy-engine/src/index.js";
import { TOOLS } from "./tool-specs.js";
import {
  openStateStore,
  type StoredAutoTradingSessionRecord,
  type StoredAutoTradingDecisionRecord,
  type StoredUniverseMarketInput
} from "../../../packages/state-store/src/index.js";
import {
  buildExecutionQueue,
  listStrategyCandidates,
  loadStrategyPolicies
} from "../../../packages/strategy-engine/src/index.js";
import {
  buildAutoTradingExecutionGate,
  compactAutoTradingIterationResult,
  runAutoTradingIteration,
  type AutoTradingRiskProfile
} from "../../../packages/auto-trader/src/index.js";

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

function compactStoredAutoTradingDecision(decision: StoredAutoTradingDecisionRecord): Record<string, unknown> {
  return {
    decisionId: decision.decisionId,
    sessionId: decision.sessionId,
    iterationId: decision.iterationId,
    marketKey: decision.marketKey,
    title: decision.title,
    action: decision.action,
    status: decision.status,
    score: decision.score,
    allocatedBudgetUsdc: decision.allocatedBudgetUsdc,
    targetPrice: decision.targetPrice,
    nextCheckAt: decision.nextCheckAt,
    reasonCodes: decision.reasonCodes,
    blockers: decision.blockers,
    payload: {
      tokenId: decision.payload.tokenId,
      shares: decision.payload.shares,
      mode: decision.payload.mode,
      liveSubmissionEnabled: decision.payload.liveSubmissionEnabled
    },
    createdAt: decision.createdAt
  };
}

function compactStoredAutoTradingSession(session: StoredAutoTradingSessionRecord): Record<string, unknown> {
  return {
    sessionId: session.sessionId,
    name: session.name,
    status: session.status,
    mode: session.mode,
    riskProfile: session.riskProfile,
    budgetUsdc: session.budgetUsdc,
    timeframeHours: session.timeframeHours,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    heartbeatMinutes: session.heartbeatMinutes,
    updatedAt: session.updatedAt
  };
}

const AUTO_TRADING_EXECUTION_FINAL_STATUSES = new Set([
  "awaiting_approval",
  "preview_created",
  "submitted",
  "blocked",
  "blocked_preview",
  "blocked_submission_config",
  "blocked_policy_changed"
]);

function autoTradingDecisionExecutionStatus(decision: StoredAutoTradingDecisionRecord): string | undefined {
  const execution = decision.payload.execution;
  if (execution && typeof execution === "object" && !Array.isArray(execution)) {
    const status = (execution as Record<string, unknown>).status;
    return typeof status === "string" ? status : undefined;
  }
  return undefined;
}

function isPendingLiveAutoTradingDecision(decision: StoredAutoTradingDecisionRecord): boolean {
  const status = autoTradingDecisionExecutionStatus(decision);
  return (
    decision.status === "proposed" &&
    (decision.action === "live_buy_yes" || decision.action === "live_sell_yes") &&
    (status === undefined || !AUTO_TRADING_EXECUTION_FINAL_STATUSES.has(status))
  );
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

async function currentStrategyPolicies(config = loadRuntimeConfig()) {
  const policies = await loadStrategyPolicies(path.resolve(config.cwd, "configs/strategy-policies.yaml"));
  return { config, policies };
}

function currentStateStore(config = loadRuntimeConfig()) {
  return openStateStore(config.stateDbPath);
}

async function resolveAndPersistMarket(
  config: ReturnType<typeof loadRuntimeConfig>,
  identifierType: "slug" | "condition_id" | "token_id" | "market_id",
  identifier: string
) {
  const snapshot = await resolveMarketByIdentifier(config, identifierType, identifier, {
    includeComments: false,
    includeOrderbookSummary: true,
    includeRelatedMarkets: false
  });
  const stateStore = currentStateStore(config);
  const stored = stateStore.recordMarketSnapshot(snapshot);
  return {
    snapshot,
    stateStore,
    marketKey: stored.marketKey
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function orderRecordFromSubmitResult(
  preview: ReturnType<typeof getPreview> extends infer T ? T : never,
  result: Record<string, unknown>
): {
  orderId?: string;
  side?: string;
  status?: string;
  orderKind?: string;
  price?: number;
  size?: number;
  notionalUsd?: number;
  payload: Record<string, unknown>;
} {
  const order = (result.order ?? result.result ?? result) as Record<string, unknown>;
  const normalizedParams = (preview?.normalizedParams ?? {}) as Record<string, unknown>;
  const submissionPayload = (preview?.submissionPayload ?? {}) as Record<string, unknown>;
  const estimate = (normalizedParams.estimate ?? {}) as Record<string, unknown>;
  const price =
    numericValue(order.price) ??
    numericValue(order.avgPrice) ??
    numericValue(submissionPayload.price) ??
    numericValue(submissionPayload.worst_price);
  const size =
    numericValue(order.size) ??
    numericValue(order.original_size) ??
    numericValue(order.amount) ??
    numericValue(submissionPayload.size) ??
    numericValue(submissionPayload.shares) ??
    numericValue(estimate.totalShares);
  const notionalUsd =
    numericValue(order.notional) ??
    numericValue(order.usdc_size) ??
    numericValue(order.value) ??
    numericValue(submissionPayload.budget_usdc) ??
    numericValue(estimate.totalNotionalUsd) ??
    (price !== undefined && size !== undefined ? Number((price * size).toFixed(6)) : undefined);

  return {
    orderId: firstString(order.orderID, order.order_id, order.id, order.orderId),
    side: firstString(order.side, submissionPayload.side),
    status: firstString(order.status, result.status, "submitted"),
    orderKind: typeof preview?.orderKind === "string" ? preview.orderKind : undefined,
    price,
    size,
    notionalUsd,
    payload: result
  };
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

function thesisExposureContext(
  config: ReturnType<typeof loadRuntimeConfig>,
  marketSnapshot: MarketSnapshot,
  incrementalNotionalUsd: number
): { marketKey: string; thesisKey?: string; thesisExposureUsd?: number; thesisMarketCount?: number; warnings: PolicyWarning[] } {
  const store = currentStateStore(config);
  const { marketKey } = store.recordMarketSnapshot(marketSnapshot);
  const thesisLink = store.getLatestMarketThesisLink({ marketKey });
  if (!thesisLink?.thesisKey) {
    return {
      marketKey,
      warnings: []
    };
  }

  const summary = store.getPortfolioRiskSummary({ limit: 500 });
  const marketExposure = summary.marketExposures.find((entry) => entry.marketKey === marketKey);
  const thesisExposure = summary.thesisExposures.find((entry) => entry.thesisKey === thesisLink.thesisKey);
  const projectedThesisExposureUsd = Number(
    (((thesisExposure?.totalExposureUsd ?? 0) + incrementalNotionalUsd)).toFixed(4)
  );
  const projectedThesisMarketCount = (thesisExposure?.marketCount ?? 0) + ((marketExposure?.totalExposureUsd ?? 0) > 0 ? 0 : 1);
  return {
    marketKey,
    thesisKey: thesisLink.thesisKey,
    thesisExposureUsd: projectedThesisExposureUsd,
    thesisMarketCount: projectedThesisMarketCount,
    warnings: []
  };
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

interface LimitOrderPreviewInput {
  token_id: string;
  side: Side;
  price: number;
  size: number;
  order_type: "GTC" | "GTD";
  expiration?: string;
  post_only: boolean;
  client_order_id?: string;
}

interface GuardedLimitOrderPreviewResult {
  preview: PreviewRecord;
  marketSnapshot: MarketSnapshot;
  geoblock?: Record<string, unknown>;
  balances: Record<string, unknown>;
  ownerAddress?: string;
  openOrderCount: number;
  policySummary: string;
}

async function createGuardedLimitOrderPreview(input: LimitOrderPreviewInput): Promise<GuardedLimitOrderPreviewResult> {
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
  const thesisExposure = thesisExposureContext(config, liveMarketSnapshot, orderNotionalUsd);
  warnings.push(...thesisExposure.warnings);

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
    thesisExposureUsd: thesisExposure.thesisExposureUsd,
    thesisMarketCount: thesisExposure.thesisMarketCount,
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

  return {
    preview,
    marketSnapshot: liveMarketSnapshot,
    geoblock: geoblockContext.geoblock,
    balances: balance.checks,
    ownerAddress: exposure.ownerAddress,
    openOrderCount: openOrders.allOpenOrders.length,
    policySummary: summarizeWarnings(dedupeWarnings(warnings))
  };
}

export interface BookmarkedMarketSummary {
  title: string;
  identifierType: "slug" | "condition_id" | "market_id";
  identifier: string;
  slug?: string;
  conditionId?: string;
  marketId?: string;
  eventTitle?: string;
  price?: number;
  bestBid?: number;
  bestAsk?: number;
  volumeUsd?: number;
  liquidityUsd?: number;
  endDate?: string;
  category?: string;
}

function bookmarkedMarketItems(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const record = raw as Record<string, unknown>;
  const candidates = [record.data, record.markets, record.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }
  return [];
}

export function normalizeBookmarkedMarketsResponse(raw: unknown): {
  count: number;
  markets: BookmarkedMarketSummary[];
} {
  const seen = new Set<string>();
  const markets: BookmarkedMarketSummary[] = [];

  for (const market of bookmarkedMarketItems(raw)) {
    const slug = firstString(market.slug, market.market_slug);
    const rawMarketId = firstString(market.id, market.marketId, market.market_id);
    const rawConditionRef = firstString(market.conditionId, market.condition_id);
    const fallbackRef = firstString(market.market);
    const conditionId =
      rawConditionRef ??
      (fallbackRef && fallbackRef.startsWith("0x") ? fallbackRef : undefined);
    const marketId =
      rawMarketId ??
      (fallbackRef && !fallbackRef.startsWith("0x") ? fallbackRef : undefined);
    const identifierType = slug ? "slug" : conditionId ? "condition_id" : "market_id";
    const identifier = slug ?? conditionId ?? marketId;
    if (!identifier) {
      continue;
    }
    const dedupeKey = `${identifierType}:${identifier}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    markets.push({
      title: firstString(market.question, market.title, market.market_question, identifier) ?? identifier,
      identifierType,
      identifier,
      slug,
      conditionId,
      marketId,
      eventTitle: firstString(market.eventTitle, market.event_title, market.eventName, market.event_name),
      price: numericValue(market.lastTradePrice) ?? numericValue(market.price),
      bestBid: numericValue(market.bestBid),
      bestAsk: numericValue(market.bestAsk),
      volumeUsd:
        numericValue(market.volumeNum) ??
        numericValue(market.volumeClob) ??
        numericValue(market.volume),
      liquidityUsd:
        numericValue(market.liquidityNum) ??
        numericValue(market.liquidityClob) ??
        numericValue(market.liquidity),
      endDate: firstString(market.endDateIso, market.endDate, market.end_date),
      category: firstString(market.category)
    });
  }

  return {
    count: markets.length,
    markets
  };
}

interface BookmarkSyncOptions {
  watchlist_name: string;
  replace_existing_group: boolean;
  move_threshold_pct_points: number;
  spread_threshold_cents: number;
  include_related_markets: boolean;
  include_comments: boolean;
  scope: "watchlist" | "portfolio" | "all";
  description?: string;
}

export interface WatchlistMergeMarket {
  title: string;
  identifierType: "slug" | "condition_id" | "market_id" | "token_id";
  identifier: string;
}

export function mergeMarketsIntoWatchlistsYaml(
  rawYaml: string,
  marketsInput: { markets: WatchlistMergeMarket[] },
  options: BookmarkSyncOptions
): {
  yaml: string;
  groupName: string;
  marketCount: number;
  replacedExistingGroup: boolean;
} {
  const parsed = (YAML.parse(rawYaml) ?? {}) as Record<string, unknown>;
  const watchlists = Array.isArray(parsed.watchlists) ? [...parsed.watchlists] : [];
  const syncedMarkets = marketsInput.markets.map((market) => ({
    identifier_type: market.identifierType,
    identifier: market.identifier,
    move_threshold_pct_points: options.move_threshold_pct_points,
    spread_threshold_cents: options.spread_threshold_cents,
    include_related_markets: options.include_related_markets,
    include_comments: options.include_comments,
    scope: options.scope
  }));

  const nextGroup = {
    name: options.watchlist_name,
    description: options.description ?? "managed Polymarket watchlist",
    markets: syncedMarkets
  };

  const existingIndex = watchlists.findIndex((group) => {
    const record = (group ?? {}) as Record<string, unknown>;
    return String(record.name ?? "") === options.watchlist_name;
  });

  let replacedExistingGroup = false;
  if (existingIndex >= 0) {
    replacedExistingGroup = true;
    if (options.replace_existing_group) {
      watchlists[existingIndex] = nextGroup;
    } else {
      const existing = (watchlists[existingIndex] ?? {}) as Record<string, unknown>;
      const existingMarkets = Array.isArray(existing.markets) ? existing.markets : [];
      const merged = [...existingMarkets];
      const seen = new Set(
        merged.map((market) => {
          const record = (market ?? {}) as Record<string, unknown>;
          return `${String(record.identifier_type ?? record.identifierType ?? "slug")}:${String(record.identifier ?? "")}`;
        })
      );
      for (const market of syncedMarkets) {
        const key = `${market.identifier_type}:${market.identifier}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(market);
        }
      }
      watchlists[existingIndex] = {
        ...existing,
        name: options.watchlist_name,
        description: typeof existing.description === "string" ? existing.description : nextGroup.description,
        markets: merged
      };
    }
  } else {
    watchlists.push(nextGroup);
  }

  parsed.watchlists = watchlists;
  return {
    yaml: YAML.stringify(parsed),
    groupName: options.watchlist_name,
    marketCount: syncedMarkets.length,
    replacedExistingGroup
  };
}

export function mergeBookmarkedMarketsIntoWatchlistsYaml(
  rawYaml: string,
  bookmarks: { markets: BookmarkedMarketSummary[] },
  options: BookmarkSyncOptions
) {
  return mergeMarketsIntoWatchlistsYaml(rawYaml, bookmarks, {
    ...options,
    description: options.description ?? "synced from Polymarket website bookmarks"
  });
}

async function discoveryPoliciesForConfig(
  config = loadRuntimeConfig()
): Promise<DiscoveryPolicies> {
  return await loadDiscoveryPolicies(path.resolve(config.cwd, "configs/discovery-policies.yaml"));
}

function universeMarketFromStoredRecord(record: Record<string, unknown>): UniverseMarket {
  const rawJson = (record.rawJson ?? {}) as Record<string, unknown>;
  return {
    marketKey: String(record.marketKey ?? ""),
    source: "markets_keyset",
    marketId: firstString(record.marketId),
    conditionId: firstString(record.conditionId),
    questionId: firstString(record.questionId),
    eventId: firstString(record.eventId),
    eventSlug: firstString(record.eventSlug),
    eventTitle: firstString(record.eventTitle),
    seriesSlug: firstString(record.seriesSlug),
    seriesTitle: firstString(record.seriesTitle),
    slug: firstString(record.slug),
    title: firstString(record.title) ?? "Untitled market",
    description: firstString(record.description),
    resolutionSource: firstString(record.resolutionSource),
    resolutionText: firstString(record.resolutionText),
    category: firstString(record.category),
    subcategory: firstString(record.subcategory),
    tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    outcomes: Array.isArray(record.outcomes) ? record.outcomes.map(String) : [],
    outcomePrices: Array.isArray(record.outcomePrices) ? record.outcomePrices.map((value) => Number(value)) : [],
    clobTokenIds: Array.isArray(record.clobTokenIds) ? record.clobTokenIds.map(String) : [],
    yesTokenId: firstString(record.yesTokenId),
    noTokenId: firstString(record.noTokenId),
    active: typeof record.active === "boolean" ? record.active : undefined,
    closed: typeof record.closed === "boolean" ? record.closed : undefined,
    archived: typeof record.archived === "boolean" ? record.archived : undefined,
    restricted: typeof record.restricted === "boolean" ? record.restricted : undefined,
    acceptingOrders: typeof record.acceptingOrders === "boolean" ? record.acceptingOrders : undefined,
    enableOrderBook: typeof record.enableOrderBook === "boolean" ? record.enableOrderBook : undefined,
    startDate: firstString(record.startDate),
    endDate: firstString(record.endDate),
    endDateIso: firstString(record.endDate),
    eventStartTime: firstString(record.eventStartTime),
    createdAt: firstString(record.createdAt),
    updatedAt: firstString(record.updatedAt),
    liquidityUsd: numericValue(record.liquidityUsd),
    liquidityClobUsd: numericValue(record.liquidityClobUsd),
    volumeUsd: numericValue(record.volumeUsd),
    volume24hUsd: numericValue(record.volume24hUsd),
    volume7dUsd: numericValue(record.volume7dUsd),
    volume30dUsd: numericValue(record.volume30dUsd),
    openInterestUsd: numericValue(record.openInterestUsd),
    impliedProb: numericValue(record.impliedProb),
    lastTradePrice: numericValue(record.lastTradePrice),
    bestBid: numericValue(record.bestBid),
    bestAsk: numericValue(record.bestAsk),
    midpoint: numericValue(record.midpoint),
    spreadCents: numericValue(record.spreadCents),
    orderPriceMinTickSize: numericValue(record.orderPriceMinTickSize),
    orderMinSize: numericValue(record.orderMinSize),
    negRisk: typeof record.negRisk === "boolean" ? record.negRisk : undefined,
    sportsMarketType: firstString(record.sportsMarketType),
    line: numericValue(record.line),
    depthUsdWithin2c: numericValue(record.depthUsdWithin2c),
    depthUsdWithin5c: numericValue(record.depthUsdWithin5c),
    slippageCentsAt50Usd: numericValue(record.slippageCentsAt50Usd),
    slippageCentsAt250Usd: numericValue(record.slippageCentsAt250Usd),
    structuralType: String(record.structuralType ?? "unknown") as UniverseMarket["structuralType"],
    categoryGroup: String(record.categoryGroup ?? "other") as UniverseMarket["categoryGroup"],
    horizonBucket: String(record.horizonBucket ?? "unknown") as UniverseMarket["horizonBucket"],
    priceBucket: String(record.priceBucket ?? "unknown") as UniverseMarket["priceBucket"],
    liquidityBucket: String(record.liquidityBucket ?? "unknown") as UniverseMarket["liquidityBucket"],
    spreadBucket: String(record.spreadBucket ?? "unknown") as UniverseMarket["spreadBucket"],
    opportunityMode: String(record.opportunityMode ?? "deep-research") as UniverseMarket["opportunityMode"],
    modelabilityScore: numericValue(record.modelabilityScore) ?? 0,
    tradabilityScore: numericValue(record.tradabilityScore) ?? 0,
    catalystScore: numericValue(record.catalystScore) ?? 0,
    resolutionAmbiguityScore: numericValue(record.resolutionAmbiguityScore) ?? 0,
    attentionGapScore: numericValue(record.attentionGapScore) ?? 0,
    crossMarketScore: numericValue(record.crossMarketScore) ?? 0,
    researchPriorityScore: numericValue(record.researchPriorityScore) ?? 0,
    tradeOpportunityScore: numericValue(record.tradeOpportunityScore) ?? 0,
    makerScore: numericValue(record.makerScore) ?? 0,
    riskScore: numericValue(record.riskScore) ?? 0,
    reasonCodes: Array.isArray(record.reasonCodes) ? record.reasonCodes.map(String) : [],
    disqualifiers: Array.isArray(record.disqualifiers) ? record.disqualifiers.map(String) : [],
    rawGammaMarket: rawJson.rawGammaMarket,
    rawGammaEvent: rawJson.rawGammaEvent
  };
}

function universeMarketToStoredInput(
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

function recommendedUniverseHandoff(market: Record<string, unknown>): string {
  const opportunityMode = String(market.opportunityMode ?? "");
  if (opportunityMode === "market-making") {
    return "maker-rewards-check";
  }
  if (opportunityMode === "resolution-watch") {
    return "resolution-watch";
  }
  if ((numericValue(market.tradeOpportunityScore) ?? 0) >= 70) {
    return "opportunity-classifier";
  }
  return "deep-market-research";
}

function formatUniverseMarketRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    market_key: record.marketKey,
    title: record.title,
    slug: record.slug,
    event_title: record.eventTitle,
    category_group: record.categoryGroup,
    structural_type: record.structuralType,
    horizon_bucket: record.horizonBucket,
    price_bucket: record.priceBucket,
    liquidity_bucket: record.liquidityBucket,
    spread_bucket: record.spreadBucket,
    opportunity_mode: record.opportunityMode,
    implied_prob: record.impliedProb,
    liquidity_usd: record.liquidityUsd,
    volume_24h_usd: record.volume24hUsd,
    best_bid: record.bestBid,
    best_ask: record.bestAsk,
    spread_cents: record.spreadCents,
    end_date: record.endDate,
    scores: {
      modelability: record.modelabilityScore,
      tradability: record.tradabilityScore,
      catalyst: record.catalystScore,
      resolution_ambiguity: record.resolutionAmbiguityScore,
      attention_gap: record.attentionGapScore,
      research_priority: record.researchPriorityScore,
      trade_opportunity: record.tradeOpportunityScore,
      maker: record.makerScore,
      risk: record.riskScore
    },
    reason_codes: record.reasonCodes,
    disqualifiers: record.disqualifiers,
    recommended_next_skill: recommendedUniverseHandoff(record)
  };
}

function formatUniverseClusterRecord(record: Record<string, unknown>): Record<string, unknown> {
  const outsiderMarkets = Array.isArray(record.outsiderMarkets)
    ? record.outsiderMarkets.filter((market): market is Record<string, unknown> => Boolean(market) && typeof market === "object")
    : [];
  return {
    cluster_key: record.clusterKey,
    cluster_title: record.clusterTitle,
    cluster_basis: record.clusterBasis,
    market_count: record.marketCount,
    active_market_count: record.activeMarketCount,
    outsider_count: record.outsiderCount,
    longshot_count: record.longshotCount,
    cheap_count: record.cheapCount,
    total_liquidity_usd: record.totalLiquidityUsd,
    total_volume_24h_usd: record.totalVolume24hUsd,
    median_spread_cents: record.medianSpreadCents,
    min_implied_prob: record.minImpliedProb,
    max_implied_prob: record.maxImpliedProb,
    category_groups: record.categoryGroups,
    horizon_buckets: record.horizonBuckets,
    structural_types: record.structuralTypes,
    reason_codes: record.reasonCodes,
    outsider_convexity_score: record.outsiderConvexityScore,
    outsider_markets: outsiderMarkets.map((market) => ({
      ...formatUniverseMarketRecord(market),
      outsider_convexity_score: market.outsiderConvexityScore,
      double_price: market.doublePrice
    })),
    recommended_next_skill: "codex-polymarket:opportunity-classifier"
  };
}

function latestUniverseRunAgeMinutes(run: Record<string, unknown> | null): number | undefined {
  if (!run) {
    return undefined;
  }
  const startedAt = Date.parse(String(run.startedAt ?? run.completedAt ?? ""));
  if (!Number.isFinite(startedAt)) {
    return undefined;
  }
  return (Date.now() - startedAt) / (1000 * 60);
}

function listUniverseFiltersFromInput(
  input: {
    run_id?: string;
    view?: string;
    category_groups?: string[];
    structural_types?: string[];
    horizon_buckets?: string[];
    price_buckets?: string[];
    opportunity_modes?: string[];
    min_liquidity_usdc?: number;
    min_volume_24h_usdc?: number;
    max_spread_cents?: number;
    min_tradability_score?: number;
    min_research_priority_score?: number;
    max_resolution_ambiguity_score?: number;
    include_tags?: string[];
    exclude_tags?: string[];
    search?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  },
  policies: DiscoveryPolicies
): ListUniverseFilters {
  return applyUniverseViewDefaults({
    runId: input.run_id,
    view: input.view as ListUniverseFilters["view"] | undefined,
    categoryGroups: input.category_groups as ListUniverseFilters["categoryGroups"],
    structuralTypes: input.structural_types as ListUniverseFilters["structuralTypes"],
    horizonBuckets: input.horizon_buckets as ListUniverseFilters["horizonBuckets"],
    priceBuckets: input.price_buckets as ListUniverseFilters["priceBuckets"],
    opportunityModes: input.opportunity_modes as ListUniverseFilters["opportunityModes"],
    minLiquidityUsdc: input.min_liquidity_usdc,
    minVolume24hUsdc: input.min_volume_24h_usdc,
    maxSpreadCents: input.max_spread_cents,
    minTradabilityScore: input.min_tradability_score,
    minResearchPriorityScore: input.min_research_priority_score,
    maxResolutionAmbiguityScore: input.max_resolution_ambiguity_score,
    includeTags: input.include_tags,
    excludeTags: input.exclude_tags,
    search: input.search,
    sort: input.sort as ListUniverseFilters["sort"] | undefined,
    limit: input.limit,
    offset: input.offset
  }, policies);
}

export async function ingestAndPersistUniverseRun(
  input: {
    active_only?: boolean;
    include_closed?: boolean;
    source?: UniverseSource;
    page_size?: number;
    limit_pages?: number;
    min_liquidity_usdc?: number;
    include_tags?: boolean;
    order?: string;
    ascending?: boolean;
    enrich_top_n?: number;
    enrichment_profile?: "none" | "microstructure" | "microstructure_and_history";
  },
  config = loadRuntimeConfig()
): Promise<Record<string, unknown>> {
  const policies = await discoveryPoliciesForConfig(config);
  const store = currentStateStore(config);
  const runId = store.startUniverseRun({
    source: input.source ?? policies.defaults.source,
    activeOnly: input.active_only ?? policies.defaults.activeOnly,
    closedIncluded: input.include_closed ?? policies.defaults.includeClosed,
    status: "running",
    metadata: {
      pageSize: input.page_size ?? policies.defaults.pageSize,
      limitPages: input.limit_pages,
      order: input.order ?? policies.defaults.order,
      enrichmentProfile: input.enrichment_profile ?? policies.defaults.enrichmentProfile
    }
  });

  try {
    const result = await ingestUniverseMarkets(config, {
      activeOnly: input.active_only ?? policies.defaults.activeOnly,
      includeClosed: input.include_closed ?? policies.defaults.includeClosed,
      source: input.source ?? policies.defaults.source,
      pageSize: input.page_size ?? policies.defaults.pageSize,
      limitPages: input.limit_pages,
      minLiquidityUsdc: input.min_liquidity_usdc ?? policies.defaults.minLiquidityUsdc,
      includeTags: input.include_tags ?? policies.defaults.includeTags,
      order: input.order ?? policies.defaults.order,
      ascending: input.ascending ?? policies.defaults.ascending,
      enrichTopN: input.enrich_top_n ?? policies.defaults.enrichTopN,
      enrichmentProfile: input.enrichment_profile ?? policies.defaults.enrichmentProfile
    }, policies);

    const capturedAt = new Date().toISOString();
    store.recordUniverseMarkets(
      runId,
      result.markets.map((market) => universeMarketToStoredInput(runId, market, capturedAt))
    );
    store.completeUniverseRun(runId, {
      status: "completed",
      completedAt: capturedAt,
      totalEvents: result.rawEvents.length,
      totalMarkets: result.markets.length,
      enrichedMarkets: result.enrichedCount
    });

    return {
      run_id: runId,
      source: result.source,
      total_markets: result.markets.length,
      enriched_markets: result.enrichedCount,
      started_at: store.getUniverseRun(runId)?.startedAt,
      completed_at: capturedAt,
      top_preview: result.markets
        .slice()
        .sort((left, right) => right.researchPriorityScore - left.researchPriorityScore)
        .slice(0, 5)
        .map((market) =>
          formatUniverseMarketRecord({
            ...(normalizeUniverseMarketForStorage(market) as Record<string, unknown>)
          })
        )
    };
  } catch (error) {
    store.completeUniverseRun(runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: String(error)
    });
    throw error;
  }
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
  "get_bookmarked_markets",
  {
    description: toolDescription("get_bookmarked_markets"),
    inputSchema: {
      page_size: z.number().int().min(1).max(500).default(100),
      next_cursor: z.string().optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required to load bookmarked markets.");
    }
    const raw = await invokePythonHelper<Record<string, unknown> | Record<string, unknown>[]>(config, "bookmarked_markets", {
      page_size: input.page_size,
      next_cursor: input.next_cursor
    });
    const bookmarks = normalizeBookmarkedMarketsResponse(raw);
    return textResult({
      count: bookmarks.count,
      page_size: input.page_size,
      next_cursor: typeof (raw as Record<string, unknown>).next_cursor === "string"
        ? (raw as Record<string, unknown>).next_cursor
        : undefined,
      markets: bookmarks.markets,
      raw
    });
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
  "get_state_summary",
  {
    description: toolDescription("get_state_summary"),
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(10)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const summary = currentStateStore(config).getStateSummary(input.limit);
    return textResult(summary as unknown as Record<string, unknown>);
  }
);

server.registerTool(
  "get_market_state",
  {
    description: toolDescription("get_market_state"),
    inputSchema: {
      identifier_type: z.enum(["slug", "condition_id", "token_id", "market_id"]),
      identifier: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const persisted = await resolveAndPersistMarket(config, input.identifier_type, input.identifier);
    const state = persisted.stateStore.getMarketState({
      marketKey: persisted.marketKey,
      limit: input.limit
    });
    return textResult({
      marketKey: persisted.marketKey,
      stateDbPath: config.stateDbPath,
      snapshot: persisted.snapshot,
      state
    });
  }
);

server.registerTool(
  "get_portfolio_risk_summary",
  {
    description: toolDescription("get_portfolio_risk_summary"),
    inputSchema: {
      limit: z.number().int().min(1).max(200).default(50)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const summary = store.getPortfolioRiskSummary({ limit: input.limit });
    return textResult({
      stateDbPath: config.stateDbPath,
      summary
    });
  }
);

server.registerTool(
  "get_strategy_candidates",
  {
    description: toolDescription("get_strategy_candidates"),
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(25),
      interest_tiers: z.array(z.enum(["A", "B", "C", "AVOID"]))
        .max(4)
        .optional(),
      include_waiting: z.boolean().default(false),
      include_blocked: z.boolean().default(false)
    }
  },
  async (input) => {
    const { config, limits } = await currentLimits();
    const { policies } = await currentStrategyPolicies(config);
    const store = currentStateStore(config);
    const candidates = listStrategyCandidates(store, policies, limits, {
      limit: input.limit,
      interestTiers: input.interest_tiers,
      includeWaiting: input.include_waiting,
      includeBlocked: input.include_blocked
    });
    return textResult({
      stateDbPath: config.stateDbPath,
      count: candidates.length,
      candidates
    });
  }
);

server.registerTool(
  "get_execution_queue",
  {
    description: toolDescription("get_execution_queue"),
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(25),
      include_waiting: z.boolean().default(false)
    }
  },
  async (input) => {
    const { config, limits } = await currentLimits();
    const { policies } = await currentStrategyPolicies(config);
    const store = currentStateStore(config);
    const queue = buildExecutionQueue(store, policies, limits, {
      limit: input.limit,
      includeWaiting: input.include_waiting
    });
    return textResult({
      stateDbPath: config.stateDbPath,
      count: queue.length,
      queue
    });
  }
);

server.registerTool(
  "start_auto_trading_session",
  {
    description: toolDescription("start_auto_trading_session"),
    inputSchema: {
      name: z.string().max(120).optional(),
      budget_usdc: z.number().positive().max(10_000),
      timeframe_hours: z.number().positive().max(24 * 30),
      risk_profile: z.enum(["conservative", "balanced", "aggressive"]),
      mode: z.enum(["paper", "live_guarded", "live_autonomous"]).default("paper"),
      max_single_order_usdc: z.number().positive().optional(),
      max_open_positions: z.number().int().min(1).max(50).optional(),
      max_market_horizon_hours: z.number().positive().optional(),
      min_liquidity_usdc: z.number().min(0).optional(),
      max_spread_cents: z.number().positive().optional(),
      stop_loss_usdc: z.number().min(0).optional(),
      take_profit_pct: z.number().positive().optional(),
      position_stop_loss_pct: z.number().positive().optional(),
      position_stop_loss_grace_minutes: z.number().min(0).optional(),
      paper_reentry_cooldown_minutes: z.number().min(0).optional(),
      time_exit_hours: z.number().min(0).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      compact: z.boolean().default(true)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const result = runAutoTradingIteration(store, {
      mandate: {
        name: input.name,
        budgetUsdc: input.budget_usdc,
        timeframeHours: input.timeframe_hours,
        riskProfile: input.risk_profile as AutoTradingRiskProfile,
        mode: input.mode,
        maxSingleOrderUsdc: input.max_single_order_usdc,
        maxOpenPositions: input.max_open_positions,
        maxMarketHorizonHours: input.max_market_horizon_hours,
        minLiquidityUsdc: input.min_liquidity_usdc,
        maxSpreadCents: input.max_spread_cents,
        stopLossUsdc: input.stop_loss_usdc,
        takeProfitPct: input.take_profit_pct,
        positionStopLossPct: input.position_stop_loss_pct,
        positionStopLossGraceMinutes: input.position_stop_loss_grace_minutes,
        paperReentryCooldownMinutes: input.paper_reentry_cooldown_minutes,
        timeExitHours: input.time_exit_hours
      },
      limit: input.limit
    });
    store.recordAutomationRun({
      automationName: "auto-trading-session",
      status: "completed",
      projectMode: "local",
      findingsCount: result.candidates.length,
      summary: `started auto-trading session ${result.session.sessionId}; proposed ${result.summary.proposedOrders} paper orders`,
      output: compactAutoTradingIterationResult(result) as unknown as Record<string, unknown>
    });
    const response = input.compact ? compactAutoTradingIterationResult(result) : result;
    return textResult(response as unknown as Record<string, unknown>);
  }
);

server.registerTool(
  "list_auto_trading_sessions",
  {
    description: toolDescription("list_auto_trading_sessions"),
    inputSchema: {
      status: z.enum(["active", "paused", "completed", "stopped"]).optional(),
      mode: z.enum(["paper", "live_guarded", "live_autonomous"]).optional(),
      include_expired: z.boolean().default(true),
      limit: z.number().int().min(1).max(200).default(50)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const now = Date.now();
    const sessions = store
      .listAutoTradingSessions({ status: input.status, limit: input.limit })
      .filter((session) => !input.mode || session.mode === input.mode)
      .filter((session) => input.include_expired || Date.parse(session.endsAt) > now);
    return textResult({
      stateDbPath: config.stateDbPath,
      count: sessions.length,
      sessions: sessions.map(compactStoredAutoTradingSession)
    });
  }
);

server.registerTool(
  "run_auto_trading_iteration",
  {
    description: toolDescription("run_auto_trading_iteration"),
    inputSchema: {
      session_id: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(25),
      compact: z.boolean().default(true)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const result = runAutoTradingIteration(store, {
      sessionId: input.session_id,
      limit: input.limit
    });
    store.recordAutomationRun({
      automationName: "auto-trading-iteration",
      status: "completed",
      projectMode: "local",
      findingsCount: result.candidates.length,
      summary: `auto-trading session ${result.session.sessionId}; proposed ${result.summary.proposedOrders} paper orders`,
      output: compactAutoTradingIterationResult(result) as unknown as Record<string, unknown>
    });
    const response = input.compact ? compactAutoTradingIterationResult(result) : result;
    return textResult(response as unknown as Record<string, unknown>);
  }
);

server.registerTool(
  "get_auto_trading_session",
  {
    description: toolDescription("get_auto_trading_session"),
    inputSchema: {
      session_id: z.string().min(1),
      decision_limit: z.number().int().min(1).max(500).default(100),
      compact: z.boolean().default(true)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const session = store.getAutoTradingSession(input.session_id);
    if (!session) {
      throw new Error(`Unknown auto-trading session ${input.session_id}.`);
    }
    const decisions = store.listAutoTradingDecisions({
      sessionId: input.session_id,
      limit: input.decision_limit
    });
    const ledger = store.getPaperTradingLedger(input.session_id);
    return textResult({
      stateDbPath: config.stateDbPath,
      session,
      ledger: input.compact ? ledger.summary : ledger,
      decisionCount: decisions.length,
      decisions: input.compact ? decisions.map(compactStoredAutoTradingDecision) : decisions
    });
  }
);

server.registerTool(
  "ingest_market_universe",
  {
    description: toolDescription("ingest_market_universe"),
    inputSchema: {
      active_only: z.boolean().default(true),
      include_closed: z.boolean().default(false),
      source: z.enum(["markets_keyset", "events_keyset", "gamma_markets", "gamma_events", "composite", "both"]).default("composite"),
      page_size: z.number().int().min(1).max(1000).default(1000),
      limit_pages: z.number().int().min(1).max(1000).optional(),
      min_liquidity_usdc: z.number().min(0).optional(),
      include_tags: z.boolean().default(true),
      order: z.string().max(120).default("volume_num,liquidity_num"),
      ascending: z.boolean().default(false),
      enrich_top_n: z.number().int().min(0).max(1000).default(250),
      enrichment_profile: z.enum(["none", "microstructure", "microstructure_and_history"]).default("microstructure")
    }
  },
  async (input) => {
    const summary = await ingestAndPersistUniverseRun(input);
    return textResult(summary);
  }
);

server.registerTool(
  "list_market_universe",
  {
    description: toolDescription("list_market_universe"),
    inputSchema: {
      run_id: z.string().optional(),
      view: z.enum([
        "best_research_candidates",
        "clean_catalyst_bets",
        "execution_ready",
        "market_making_candidates",
        "cross_market_dislocations",
        "resolution_watch",
        "low_attention_modelable",
        "avoid_or_blocked"
      ]).optional(),
      category_groups: z.array(z.string()).max(10).optional(),
      structural_types: z.array(z.string()).max(10).optional(),
      horizon_buckets: z.array(z.string()).max(10).optional(),
      price_buckets: z.array(z.string()).max(10).optional(),
      opportunity_modes: z.array(z.string()).max(10).optional(),
      min_liquidity_usdc: z.number().min(0).optional(),
      min_volume_24h_usdc: z.number().min(0).optional(),
      max_spread_cents: z.number().min(0).optional(),
      min_tradability_score: z.number().min(0).max(100).optional(),
      min_research_priority_score: z.number().min(0).max(100).optional(),
      max_resolution_ambiguity_score: z.number().min(0).max(100).optional(),
      include_tags: z.array(z.string()).max(20).optional(),
      exclude_tags: z.array(z.string()).max(20).optional(),
      search: z.string().max(200).optional(),
      sort: z.enum([
        "research_priority_desc",
        "trade_opportunity_desc",
        "maker_score_desc",
        "liquidity_desc",
        "volume_24h_desc",
        "ending_soon",
        "attention_gap_desc",
        "spread_asc",
        "risk_desc"
      ]).default("research_priority_desc"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const policies = await discoveryPoliciesForConfig(config);
    const store = currentStateStore(config);
    const filters = listUniverseFiltersFromInput(input, policies);
    const result = store.listUniverseMarkets({
      runId: filters.runId,
      view: filters.view,
      categoryGroups: filters.categoryGroups,
      structuralTypes: filters.structuralTypes,
      horizonBuckets: filters.horizonBuckets,
      priceBuckets: filters.priceBuckets,
      opportunityModes: filters.opportunityModes,
      minLiquidityUsdc: filters.minLiquidityUsdc,
      minVolume24hUsdc: filters.minVolume24hUsdc,
      maxSpreadCents: filters.maxSpreadCents,
      minTradabilityScore: filters.minTradabilityScore,
      minResearchPriorityScore: filters.minResearchPriorityScore,
      maxResolutionAmbiguityScore: filters.maxResolutionAmbiguityScore,
      includeTags: filters.includeTags,
      excludeTags: filters.excludeTags,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset
    });
    if (!result.runId) {
      throw new Error("No persisted universe run found. Call ingest_market_universe first.");
    }
    return textResult({
      run_id: result.runId,
      latest_run: store.getUniverseRun(result.runId),
      total: result.total,
      filters,
      markets: result.markets.map(formatUniverseMarketRecord)
    });
  }
);

server.registerTool(
  "get_universe_facets",
  {
    description: toolDescription("get_universe_facets"),
    inputSchema: {
      run_id: z.string().optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const facets = currentStateStore(config).getUniverseFacets(input.run_id);
    return textResult(facets);
  }
);

server.registerTool(
  "get_universe_event_clusters",
  {
    description: toolDescription("get_universe_event_clusters"),
    inputSchema: {
      run_id: z.string().optional(),
      profile: z.enum(["outsider-convexity", "large-event"]).default("outsider-convexity"),
      category_groups: z.array(z.string()).max(10).optional(),
      search: z.string().max(200).optional(),
      min_market_count: z.number().int().min(2).max(500).optional(),
      min_outsider_count: z.number().int().min(0).max(200).optional(),
      min_cluster_liquidity_usdc: z.number().min(0).optional(),
      min_outsider_liquidity_usdc: z.number().min(0).optional(),
      min_outsider_price: z.number().min(0).max(0.5).optional(),
      max_outsider_price: z.number().min(0.01).max(0.5).optional(),
      max_outsider_spread_cents: z.number().min(0).max(100).optional(),
      sort: z.enum(["outsider_convexity_desc", "market_count_desc", "liquidity_desc"]).default("outsider_convexity_desc"),
      limit: z.number().int().min(1).max(100).default(25),
      markets_per_cluster: z.number().int().min(1).max(50).default(8)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const result = store.listUniverseEventClusters({
      runId: input.run_id,
      profile: input.profile,
      categoryGroups: input.category_groups,
      search: input.search,
      minMarketCount: input.min_market_count,
      minOutsiderCount: input.min_outsider_count,
      minClusterLiquidityUsdc: input.min_cluster_liquidity_usdc,
      minOutsiderLiquidityUsdc: input.min_outsider_liquidity_usdc,
      minOutsiderPrice: input.min_outsider_price,
      maxOutsiderPrice: input.max_outsider_price,
      maxOutsiderSpreadCents: input.max_outsider_spread_cents,
      sort: input.sort,
      limit: input.limit,
      marketsPerCluster: input.markets_per_cluster
    });
    if (!result.runId) {
      throw new Error("No persisted universe run found. Call ingest_market_universe first.");
    }
    return textResult({
      run_id: result.runId,
      latest_run: store.getUniverseRun(result.runId),
      profile: input.profile,
      total: result.total,
      filters: input,
      clusters: result.clusters.map(formatUniverseClusterRecord)
    });
  }
);

server.registerTool(
  "get_bet_candidates",
  {
    description: toolDescription("get_bet_candidates"),
    inputSchema: {
      profile: z.enum([
        "clean-short-term",
        "liquid-politics",
        "macro-catalyst",
        "market-making",
        "longshot-research",
        "resolution-watch",
        "cross-market"
      ]),
      run_id: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(25),
      ensure_fresh: z.boolean().default(false),
      max_age_minutes: z.number().int().min(1).max(10080).default(1440)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const policies = await discoveryPoliciesForConfig(config);
    const store = currentStateStore(config);
    let runId = input.run_id ?? (store.getLatestUniverseRun()?.runId as string | undefined);
    const latestRun = runId ? store.getUniverseRun(runId) : store.getLatestUniverseRun();
    if (
      input.ensure_fresh &&
      (!latestRun || ((latestUniverseRunAgeMinutes(latestRun) ?? Number.POSITIVE_INFINITY) > input.max_age_minutes))
    ) {
      const ingested = await ingestAndPersistUniverseRun({
        active_only: true,
        include_closed: false,
        source: policies.defaults.source,
        page_size: policies.defaults.pageSize,
        min_liquidity_usdc: policies.defaults.minLiquidityUsdc,
        include_tags: policies.defaults.includeTags,
        order: policies.defaults.order,
        ascending: policies.defaults.ascending,
        enrich_top_n: 0,
        enrichment_profile: "none"
      }, config);
      runId = String(ingested.run_id);
    }

    if (!runId) {
      throw new Error("No persisted universe run found. Call ingest_market_universe first.");
    }

    const filters = applyUniverseViewDefaults(
      {
        ...filtersForCandidateProfile(input.profile as CandidateProfile, policies),
        runId,
        limit: input.limit
      },
      policies
    );
    const result = store.listUniverseMarkets({
      runId: filters.runId,
      view: filters.view,
      categoryGroups: filters.categoryGroups,
      structuralTypes: filters.structuralTypes,
      horizonBuckets: filters.horizonBuckets,
      priceBuckets: filters.priceBuckets,
      opportunityModes: filters.opportunityModes,
      minLiquidityUsdc: filters.minLiquidityUsdc,
      minVolume24hUsdc: filters.minVolume24hUsdc,
      maxSpreadCents: filters.maxSpreadCents,
      minTradabilityScore: filters.minTradabilityScore,
      minResearchPriorityScore: filters.minResearchPriorityScore,
      maxResolutionAmbiguityScore: filters.maxResolutionAmbiguityScore,
      includeTags: filters.includeTags,
      excludeTags: filters.excludeTags,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset
    });

    const markets = result.markets.map(formatUniverseMarketRecord);
    return textResult({
      profile: input.profile,
      run_id: result.runId,
      total: result.total,
      filters,
      handoff_recommendation: markets[0]?.recommended_next_skill,
      markets
    });
  }
);

server.registerTool(
  "get_auto_trading_execution_gate",
  {
    description: toolDescription("get_auto_trading_execution_gate"),
    inputSchema: {
      session_id: z.string().min(1),
      decision_id: z.string().min(1)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const session = store.getAutoTradingSession(input.session_id);
    if (!session) {
      throw new Error(`Unknown auto-trading session ${input.session_id}.`);
    }
    const decision = store
      .listAutoTradingDecisions({ sessionId: input.session_id, limit: 500 })
      .find((candidate) => candidate.decisionId === input.decision_id);
    if (!decision) {
      throw new Error(`Unknown auto-trading decision ${input.decision_id} for session ${input.session_id}.`);
    }
    const gate = buildAutoTradingExecutionGate(session, decision);
    const previewLimitOrderInput = gate.previewRequest
      ? {
        token_id: gate.previewRequest.tokenId,
        side: gate.previewRequest.side,
        price: gate.previewRequest.price,
        size: gate.previewRequest.size,
        order_type: gate.previewRequest.orderType,
        post_only: gate.previewRequest.postOnly,
        client_order_id: gate.previewRequest.clientOrderId
      }
      : undefined;
    return textResult({
      session,
      decision: compactStoredAutoTradingDecision(decision),
      gate,
      previewLimitOrderInput,
      submissionPolicy: gate.canSubmitAutonomously
        ? "live_autonomous_may_submit_after_preview_policy_passes"
        : gate.requiresApproval
          ? "live_guarded_requires_explicit_approval_after_preview"
          : "not_submittable"
    });
  }
);

server.registerTool(
  "execute_auto_trading_decision",
  {
    description: toolDescription("execute_auto_trading_decision"),
    inputSchema: {
      session_id: z.string().min(1),
      decision_id: z.string().min(1),
      auto_submit: z.boolean().default(true)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const session = store.getAutoTradingSession(input.session_id);
    if (!session) {
      throw new Error(`Unknown auto-trading session ${input.session_id}.`);
    }
    let decision = store
      .listAutoTradingDecisions({ sessionId: input.session_id, limit: 500 })
      .find((candidate) => candidate.decisionId === input.decision_id);
    if (!decision) {
      throw new Error(`Unknown auto-trading decision ${input.decision_id} for session ${input.session_id}.`);
    }

    const now = new Date().toISOString();
    const gate = buildAutoTradingExecutionGate(session, decision);
    const existingHistory = Array.isArray(decision.payload.executionHistory)
      ? decision.payload.executionHistory
      : [];
    const writeExecution = (execution: Record<string, unknown>) => {
      const entry = { ...execution, updatedAt: new Date().toISOString() };
      decision = store.updateAutoTradingDecisionPayload(decision?.decisionId ?? input.decision_id, {
        execution: entry,
        executionHistory: [...existingHistory, entry].slice(-50)
      });
      return decision;
    };

    if (!gate.canPreview || !gate.previewRequest) {
      const updatedDecision = writeExecution({
        status: "blocked",
        mode: session.mode,
        decisionId: input.decision_id,
        blockers: gate.blockers,
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        execution: updatedDecision.payload.execution
      });
    }

    const previewResult = await createGuardedLimitOrderPreview({
      token_id: gate.previewRequest.tokenId,
      side: gate.previewRequest.side,
      price: gate.previewRequest.price,
      size: gate.previewRequest.size,
      order_type: gate.previewRequest.orderType,
      post_only: gate.previewRequest.postOnly,
      client_order_id: gate.previewRequest.clientOrderId
    });
    const preview = previewResult.preview;

    if (!preview.canSubmit) {
      const updatedDecision = writeExecution({
        status: "blocked_preview",
        mode: session.mode,
        decisionId: input.decision_id,
        previewId: preview.previewId,
        canSubmit: preview.canSubmit,
        policyHash: preview.policyHash,
        warnings: preview.warnings,
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        previewResult,
        execution: updatedDecision.payload.execution
      });
    }

    if (gate.requiresApproval) {
      const updatedDecision = writeExecution({
        status: "awaiting_approval",
        mode: session.mode,
        decisionId: input.decision_id,
        previewId: preview.previewId,
        canSubmit: preview.canSubmit,
        policyHash: preview.policyHash,
        warnings: preview.warnings,
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        previewResult,
        execution: updatedDecision.payload.execution
      });
    }

    if (!gate.canSubmitAutonomously) {
      const updatedDecision = writeExecution({
        status: "blocked",
        mode: session.mode,
        decisionId: input.decision_id,
        previewId: preview.previewId,
        blockers: ["mode_not_autonomous"],
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        previewResult,
        execution: updatedDecision.payload.execution
      });
    }

    if (!input.auto_submit) {
      const updatedDecision = writeExecution({
        status: "preview_created",
        mode: session.mode,
        decisionId: input.decision_id,
        previewId: preview.previewId,
        canSubmit: preview.canSubmit,
        policyHash: preview.policyHash,
        autoSubmitDisabled: true,
        warnings: preview.warnings,
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        previewResult,
        execution: updatedDecision.payload.execution
      });
    }

    const { limits, policyHash } = await currentLimits();
    if (!config.enableTrading || !limits.tradingEnabled || !hasTradingCredentials(config)) {
      const updatedDecision = writeExecution({
        status: "blocked_submission_config",
        mode: session.mode,
        decisionId: input.decision_id,
        previewId: preview.previewId,
        blockers: [
          !config.enableTrading ? "env_trading_disabled" : undefined,
          !limits.tradingEnabled ? "risk_config_trading_disabled" : undefined,
          !hasTradingCredentials(config) ? "missing_trading_credentials" : undefined
        ].filter(Boolean),
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        previewResult,
        execution: updatedDecision.payload.execution
      });
    }
    if (preview.policyHash !== policyHash) {
      const updatedDecision = writeExecution({
        status: "blocked_policy_changed",
        mode: session.mode,
        decisionId: input.decision_id,
        previewId: preview.previewId,
        previewPolicyHash: preview.policyHash,
        currentPolicyHash: policyHash,
        createdAt: now
      });
      return textResult({
        session,
        decision: compactStoredAutoTradingDecision(updatedDecision),
        gate,
        previewResult,
        execution: updatedDecision.payload.execution
      });
    }

    const submitResult = await invokePythonHelper<Record<string, unknown>>(config, "submit_preview", preview.submissionPayload);
    const marketSnapshot = preview.marketSnapshot;
    const marketKey = store.resolveMarketKey({
      conditionId: marketSnapshot?.conditionId,
      marketId: marketSnapshot?.marketId,
      slug: marketSnapshot?.slug,
      title: marketSnapshot?.title
    });
    store.markPreviewSubmitted(preview.previewId);
    const orderRecord = orderRecordFromSubmitResult(preview, submitResult);
    store.recordOrderSubmission({
      previewId: preview.previewId,
      marketKey,
      orderId: orderRecord.orderId,
      side: orderRecord.side,
      status: orderRecord.status,
      orderKind: orderRecord.orderKind,
      price: orderRecord.price,
      size: orderRecord.size,
      notionalUsd: orderRecord.notionalUsd,
      payload: orderRecord.payload
    });
    deletePreview(preview.previewId);
    const updatedDecision = writeExecution({
      status: "submitted",
      mode: session.mode,
      decisionId: input.decision_id,
      previewId: preview.previewId,
      orderId: orderRecord.orderId,
      orderStatus: orderRecord.status,
      createdAt: now
    });
    return textResult({
      session,
      decision: compactStoredAutoTradingDecision(updatedDecision),
      gate,
      previewResult,
      submitResult,
      execution: updatedDecision.payload.execution
    });
  }
);

server.registerTool(
  "run_auto_trading_executor",
  {
    description: toolDescription("run_auto_trading_executor"),
    inputSchema: {
      session_id: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(25).default(5),
      auto_submit: z.boolean().default(true),
      dry_run: z.boolean().default(false)
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const sessions = input.session_id
      ? [store.getAutoTradingSession(input.session_id)].filter((session): session is NonNullable<typeof session> => Boolean(session))
      : store.listAutoTradingSessions({ status: "active", limit: 100 })
        .filter((session) => session.mode === "live_guarded" || session.mode === "live_autonomous");
    if (input.session_id && sessions.length === 0) {
      throw new Error(`Unknown auto-trading session ${input.session_id}.`);
    }

    const candidates = sessions.flatMap((session) => store
      .listAutoTradingDecisions({ sessionId: session.sessionId, limit: 500 })
      .filter(isPendingLiveAutoTradingDecision)
      .map((decision) => ({ session, decision })))
      .slice(0, input.limit);
    const results: Record<string, unknown>[] = [];

    for (const { session, decision: initialDecision } of candidates) {
      let decision = initialDecision;
      const now = new Date().toISOString();
      const gate = buildAutoTradingExecutionGate(session, decision);
      const existingHistory = Array.isArray(decision.payload.executionHistory)
        ? decision.payload.executionHistory
        : [];
      const writeExecution = (execution: Record<string, unknown>) => {
        const entry = { ...execution, updatedAt: new Date().toISOString() };
        decision = store.updateAutoTradingDecisionPayload(decision.decisionId, {
          execution: entry,
          executionHistory: [...existingHistory, entry].slice(-50)
        });
        return decision;
      };

      if (input.dry_run) {
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          dryRun: true,
          gate,
          decision: compactStoredAutoTradingDecision(decision)
        });
        continue;
      }

      if (!gate.canPreview || !gate.previewRequest) {
        const updatedDecision = writeExecution({
          status: "blocked",
          mode: session.mode,
          decisionId: decision.decisionId,
          blockers: gate.blockers,
          createdAt: now
        });
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          gate,
          execution: updatedDecision.payload.execution,
          decision: compactStoredAutoTradingDecision(updatedDecision)
        });
        continue;
      }

      const previewResult = await createGuardedLimitOrderPreview({
        token_id: gate.previewRequest.tokenId,
        side: gate.previewRequest.side,
        price: gate.previewRequest.price,
        size: gate.previewRequest.size,
        order_type: gate.previewRequest.orderType,
        post_only: gate.previewRequest.postOnly,
        client_order_id: gate.previewRequest.clientOrderId
      });
      const preview = previewResult.preview;

      if (!preview.canSubmit) {
        const updatedDecision = writeExecution({
          status: "blocked_preview",
          mode: session.mode,
          decisionId: decision.decisionId,
          previewId: preview.previewId,
          canSubmit: preview.canSubmit,
          policyHash: preview.policyHash,
          warnings: preview.warnings,
          createdAt: now
        });
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          gate,
          previewId: preview.previewId,
          execution: updatedDecision.payload.execution,
          decision: compactStoredAutoTradingDecision(updatedDecision)
        });
        continue;
      }

      if (gate.requiresApproval) {
        const updatedDecision = writeExecution({
          status: "awaiting_approval",
          mode: session.mode,
          decisionId: decision.decisionId,
          previewId: preview.previewId,
          canSubmit: preview.canSubmit,
          policyHash: preview.policyHash,
          warnings: preview.warnings,
          createdAt: now
        });
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          gate,
          previewId: preview.previewId,
          execution: updatedDecision.payload.execution,
          decision: compactStoredAutoTradingDecision(updatedDecision)
        });
        continue;
      }

      if (!gate.canSubmitAutonomously || !input.auto_submit) {
        const updatedDecision = writeExecution({
          status: gate.canSubmitAutonomously ? "preview_created" : "blocked",
          mode: session.mode,
          decisionId: decision.decisionId,
          previewId: preview.previewId,
          canSubmit: preview.canSubmit,
          policyHash: preview.policyHash,
          autoSubmitDisabled: !input.auto_submit,
          blockers: gate.canSubmitAutonomously ? [] : ["mode_not_autonomous"],
          createdAt: now
        });
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          gate,
          previewId: preview.previewId,
          execution: updatedDecision.payload.execution,
          decision: compactStoredAutoTradingDecision(updatedDecision)
        });
        continue;
      }

      const { limits, policyHash } = await currentLimits();
      if (!config.enableTrading || !limits.tradingEnabled || !hasTradingCredentials(config)) {
        const updatedDecision = writeExecution({
          status: "blocked_submission_config",
          mode: session.mode,
          decisionId: decision.decisionId,
          previewId: preview.previewId,
          blockers: [
            !config.enableTrading ? "env_trading_disabled" : undefined,
            !limits.tradingEnabled ? "risk_config_trading_disabled" : undefined,
            !hasTradingCredentials(config) ? "missing_trading_credentials" : undefined
          ].filter(Boolean),
          createdAt: now
        });
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          gate,
          previewId: preview.previewId,
          execution: updatedDecision.payload.execution,
          decision: compactStoredAutoTradingDecision(updatedDecision)
        });
        continue;
      }
      if (preview.policyHash !== policyHash) {
        const updatedDecision = writeExecution({
          status: "blocked_policy_changed",
          mode: session.mode,
          decisionId: decision.decisionId,
          previewId: preview.previewId,
          previewPolicyHash: preview.policyHash,
          currentPolicyHash: policyHash,
          createdAt: now
        });
        results.push({
          sessionId: session.sessionId,
          decisionId: decision.decisionId,
          gate,
          previewId: preview.previewId,
          execution: updatedDecision.payload.execution,
          decision: compactStoredAutoTradingDecision(updatedDecision)
        });
        continue;
      }

      const submitResult = await invokePythonHelper<Record<string, unknown>>(config, "submit_preview", preview.submissionPayload);
      const marketSnapshot = preview.marketSnapshot;
      const marketKey = store.resolveMarketKey({
        conditionId: marketSnapshot?.conditionId,
        marketId: marketSnapshot?.marketId,
        slug: marketSnapshot?.slug,
        title: marketSnapshot?.title
      });
      store.markPreviewSubmitted(preview.previewId);
      const orderRecord = orderRecordFromSubmitResult(preview, submitResult);
      store.recordOrderSubmission({
        previewId: preview.previewId,
        marketKey,
        orderId: orderRecord.orderId,
        side: orderRecord.side,
        status: orderRecord.status,
        orderKind: orderRecord.orderKind,
        price: orderRecord.price,
        size: orderRecord.size,
        notionalUsd: orderRecord.notionalUsd,
        payload: orderRecord.payload
      });
      deletePreview(preview.previewId);
      const updatedDecision = writeExecution({
        status: "submitted",
        mode: session.mode,
        decisionId: decision.decisionId,
        previewId: preview.previewId,
        orderId: orderRecord.orderId,
        orderStatus: orderRecord.status,
        createdAt: now
      });
      results.push({
        sessionId: session.sessionId,
        decisionId: decision.decisionId,
        gate,
        previewId: preview.previewId,
        submitResult,
        execution: updatedDecision.payload.execution,
        decision: compactStoredAutoTradingDecision(updatedDecision)
      });
    }

    return textResult({
      sessionCount: sessions.length,
      candidateCount: candidates.length,
      executedCount: results.length,
      dryRun: input.dry_run,
      autoSubmit: input.auto_submit,
      results
    });
  }
);

server.registerTool(
  "enrich_universe_markets",
  {
    description: toolDescription("enrich_universe_markets"),
    inputSchema: {
      run_id: z.string().optional(),
      market_keys: z.array(z.string()).max(100).optional(),
      view: z.enum([
        "best_research_candidates",
        "clean_catalyst_bets",
        "execution_ready",
        "market_making_candidates",
        "cross_market_dislocations",
        "resolution_watch",
        "low_attention_modelable",
        "avoid_or_blocked"
      ]).optional(),
      top_n: z.number().int().min(1).max(500).default(100),
      enrichment_profile: z.enum(["microstructure", "microstructure_and_history"]).default("microstructure")
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const policies = await discoveryPoliciesForConfig(config);
    const store = currentStateStore(config);
    const runId = input.run_id ?? (store.getLatestUniverseRun()?.runId as string | undefined);
    if (!runId) {
      throw new Error("No persisted universe run found. Call ingest_market_universe first.");
    }

    let selected = input.market_keys?.map((marketKey) => store.getUniverseMarket(runId, marketKey)).filter(Boolean) as Record<string, unknown>[] | undefined;
    if (!selected || selected.length === 0) {
      const filters = applyUniverseViewDefaults({
        runId,
        view: input.view,
        limit: input.top_n
      }, policies);
      selected = store.listUniverseMarkets({
        runId: filters.runId,
        view: filters.view,
        categoryGroups: filters.categoryGroups,
        structuralTypes: filters.structuralTypes,
        horizonBuckets: filters.horizonBuckets,
        priceBuckets: filters.priceBuckets,
        opportunityModes: filters.opportunityModes,
        minLiquidityUsdc: filters.minLiquidityUsdc,
        minVolume24hUsdc: filters.minVolume24hUsdc,
        maxSpreadCents: filters.maxSpreadCents,
        minTradabilityScore: filters.minTradabilityScore,
        minResearchPriorityScore: filters.minResearchPriorityScore,
        maxResolutionAmbiguityScore: filters.maxResolutionAmbiguityScore,
        includeTags: filters.includeTags,
        excludeTags: filters.excludeTags,
        search: filters.search,
        sort: filters.sort,
        limit: input.top_n,
        offset: 0
      }).markets;
    }

    const markets = selected.map(universeMarketFromStoredRecord);
    const enriched = await enrichUniverseMarkets(config, markets, {
      topN: input.market_keys?.length ?? input.top_n,
      profile: input.enrichment_profile
    });
    const capturedAt = new Date().toISOString();
    store.recordUniverseMarkets(
      runId,
      enriched.markets.map((market) => universeMarketToStoredInput(runId, market, capturedAt))
    );
    return textResult({
      run_id: runId,
      requested_count: markets.length,
      enriched_count: enriched.enrichedCount,
      markets: enriched.markets.map((market) =>
        formatUniverseMarketRecord(normalizeUniverseMarketForStorage(market) as Record<string, unknown>)
      )
    });
  }
);

server.registerTool(
  "promote_universe_markets_to_watchlist",
  {
    description: toolDescription("promote_universe_markets_to_watchlist"),
    inputSchema: {
      run_id: z.string().optional(),
      market_keys: z.array(z.string()).min(1).max(100),
      watchlist_name: z.string().min(1).max(120),
      replace_existing_group: z.boolean().default(false),
      move_threshold_pct_points: z.number().min(0).default(3),
      spread_threshold_cents: z.number().min(0).default(5),
      include_related_markets: z.boolean().default(true),
      include_comments: z.boolean().default(true),
      scope: z.enum(["watchlist", "portfolio", "all"]).default("watchlist")
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const store = currentStateStore(config);
    const runId = input.run_id ?? (store.getLatestUniverseRun()?.runId as string | undefined);
    if (!runId) {
      throw new Error("No persisted universe run found. Call ingest_market_universe first.");
    }

    const selected = input.market_keys
      .map((marketKey) => store.getUniverseMarket(runId, marketKey))
      .filter(Boolean) as Record<string, unknown>[];

    const skipped: Array<Record<string, unknown>> = [];
    const watchlistMarkets: WatchlistMergeMarket[] = [];
    for (const market of selected) {
      const slug = firstString(market.slug);
      const conditionId = firstString(market.conditionId);
      const marketId = firstString(market.marketId);
      const tokenId = Array.isArray(market.clobTokenIds) ? String(market.clobTokenIds[0] ?? "") : "";
      if (slug) {
        watchlistMarkets.push({ title: String(market.title ?? slug), identifierType: "slug", identifier: slug });
      } else if (conditionId) {
        watchlistMarkets.push({ title: String(market.title ?? conditionId), identifierType: "condition_id", identifier: conditionId });
      } else if (marketId) {
        watchlistMarkets.push({ title: String(market.title ?? marketId), identifierType: "market_id", identifier: marketId });
      } else if (tokenId) {
        watchlistMarkets.push({ title: String(market.title ?? tokenId), identifierType: "token_id", identifier: tokenId });
      } else {
        skipped.push({ market_key: market.marketKey, title: market.title, reason: "missing_identifier" });
      }
    }

    const watchlistPath = path.resolve(config.cwd, "configs/watchlists.yaml");
    const currentYaml = await readFile(watchlistPath, "utf8");
    const merged = mergeMarketsIntoWatchlistsYaml(currentYaml, { markets: watchlistMarkets }, {
      watchlist_name: input.watchlist_name,
      replace_existing_group: input.replace_existing_group,
      move_threshold_pct_points: input.move_threshold_pct_points,
      spread_threshold_cents: input.spread_threshold_cents,
      include_related_markets: input.include_related_markets,
      include_comments: input.include_comments,
      scope: input.scope,
      description: "managed from universe discovery"
    });
    await writeFile(watchlistPath, merged.yaml, "utf8");

    return textResult({
      run_id: runId,
      watchlist_path: watchlistPath,
      group_name: merged.groupName,
      added_count: watchlistMarkets.length,
      skipped,
      markets: watchlistMarkets
    }, `Promoted ${watchlistMarkets.length} universe markets into ${merged.groupName} at ${watchlistPath}.`);
  }
);

server.registerTool(
  "record_development",
  {
    description: toolDescription("record_development"),
    inputSchema: {
      identifier_type: z.enum(["slug", "condition_id", "token_id", "market_id"]),
      identifier: z.string().min(1),
      title: z.string().min(1).max(300),
      summary: z.string().min(1).max(4000),
      source: z.string().min(1).max(200),
      url: z.string().url().optional(),
      impact: z.enum(["bullish", "bearish", "neutral", "unclear"]).default("unclear"),
      importance: z.number().int().min(0).max(100).default(50),
      event_time: isoDateTimeSchema.optional(),
      discovered_at: isoDateTimeSchema.optional(),
      tags: z.array(z.string()).max(20).optional(),
      notes: z.string().max(2000).optional(),
      payload: z.record(z.string(), z.unknown()).optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const persisted = await resolveAndPersistMarket(config, input.identifier_type, input.identifier);
    const developmentId = persisted.stateStore.recordDevelopment({
      marketKey: persisted.marketKey,
      title: input.title,
      summary: input.summary,
      source: input.source,
      url: input.url,
      impact: input.impact,
      importance: input.importance,
      eventTime: input.event_time,
      discoveredAt: input.discovered_at,
      tags: input.tags,
      notes: input.notes,
      payload: input.payload
    });
    return textResult({
      developmentId,
      marketKey: persisted.marketKey,
      stateDbPath: config.stateDbPath,
      snapshot: persisted.snapshot
    }, `Recorded development ${developmentId} for ${persisted.marketKey}.`);
  }
);

const evidenceItemSchema = z.object({
  source: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  url: z.string().url().optional(),
  summary: z.string().min(1).max(4000),
  stance: z.string().min(1).max(80),
  confidence: z.string().min(1).max(40)
});

server.registerTool(
  "record_thesis_link",
  {
    description: toolDescription("record_thesis_link"),
    inputSchema: {
      identifier_type: z.enum(["slug", "condition_id", "token_id", "market_id"]),
      identifier: z.string().min(1),
      thesis_key: z.string().min(1).max(200),
      thesis_title: z.string().min(1).max(300).optional(),
      confidence: z.number().min(0).max(100).optional(),
      is_primary: z.boolean().default(true),
      created_at: isoDateTimeSchema.optional(),
      metadata: z.record(z.string(), z.unknown()).optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const persisted = await resolveAndPersistMarket(config, input.identifier_type, input.identifier);
    const thesisLinkId = persisted.stateStore.recordThesisLink({
      marketKey: persisted.marketKey,
      marketId: persisted.snapshot.marketId,
      conditionId: persisted.snapshot.conditionId,
      slug: persisted.snapshot.slug,
      title: persisted.snapshot.title,
      thesisKey: input.thesis_key,
      thesisTitle: input.thesis_title,
      confidence: input.confidence,
      isPrimary: input.is_primary,
      createdAt: input.created_at,
      metadata: input.metadata,
      linkSource: "manual"
    });
    return textResult({
      thesisLinkId,
      marketKey: persisted.marketKey,
      stateDbPath: config.stateDbPath,
      snapshot: persisted.snapshot,
      thesisKey: input.thesis_key
    }, `Recorded thesis link ${thesisLinkId} for ${persisted.marketKey}.`);
  }
);

server.registerTool(
  "record_research_synthesis",
  {
    description: toolDescription("record_research_synthesis"),
    inputSchema: {
      identifier_type: z.enum(["slug", "condition_id", "token_id", "market_id"]),
      identifier: z.string().min(1),
      title: z.string().min(1).max(300),
      question: z.string().min(1).max(1000),
      thesis: z.string().min(1).max(8000),
      supports_yes: z.array(evidenceItemSchema).max(50).optional(),
      supports_no: z.array(evidenceItemSchema).max(50).optional(),
      open_questions: z.array(z.string().min(1).max(500)).max(50).optional(),
      fair_value_low: z.number().optional(),
      fair_value_base: z.number().optional(),
      fair_value_high: z.number().optional(),
      providers: z.array(z.string().min(1).max(120)).max(20).optional(),
      notes: z.string().max(4000).optional(),
      skill_version: z.string().max(120).optional(),
      policy_version: z.string().max(120).optional(),
      model_id: z.string().max(120).optional(),
      prompt_hash: z.string().max(256).optional(),
      automation_name: z.string().max(200).optional(),
      thesis_key: z.string().min(1).max(200).optional(),
      thesis_title: z.string().min(1).max(300).optional(),
      thesis_confidence: z.number().min(0).max(100).optional(),
      created_at: isoDateTimeSchema.optional(),
      completed_at: isoDateTimeSchema.optional(),
      synthesis: z.record(z.string(), z.unknown()).optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const persisted = await resolveAndPersistMarket(config, input.identifier_type, input.identifier);
    const runId = persisted.stateStore.recordResearchRun({
      marketKey: persisted.marketKey,
      title: input.title,
      question: input.question,
      thesis: input.thesis,
      supportsYes: input.supports_yes,
      supportsNo: input.supports_no,
      openQuestions: input.open_questions,
      fairValueLow: input.fair_value_low,
      fairValueBase: input.fair_value_base,
      fairValueHigh: input.fair_value_high,
      providers: input.providers,
      notes: input.notes,
      skillVersion: input.skill_version,
      policyVersion: input.policy_version,
      modelId: input.model_id,
      promptHash: input.prompt_hash,
      automationName: input.automation_name,
      thesisKey: input.thesis_key,
      thesisTitle: input.thesis_title,
      thesisConfidence: input.thesis_confidence,
      createdAt: input.created_at,
      completedAt: input.completed_at,
      synthesis: input.synthesis
    });
    return textResult({
      runId,
      marketKey: persisted.marketKey,
      stateDbPath: config.stateDbPath,
      snapshot: persisted.snapshot
    }, `Recorded research run ${runId} for ${persisted.marketKey}.`);
  }
);

server.registerTool(
  "record_classification",
  {
    description: toolDescription("record_classification"),
    inputSchema: {
      identifier_type: z.enum(["slug", "condition_id", "token_id", "market_id"]),
      identifier: z.string().min(1),
      structural_type: z.string().max(120).optional(),
      category: z.string().max(120).optional(),
      horizon_bucket: z.string().max(80).optional(),
      pricing_status: z.string().max(80).optional(),
      modelability_score: z.number().min(0).max(100).optional(),
      tradability_score: z.number().min(0).max(100).optional(),
      resolution_ambiguity_score: z.number().min(0).max(100).optional(),
      attention_gap_score: z.number().min(0).max(100).optional(),
      cross_market_consistency_score: z.number().min(0).max(100).optional(),
      research_priority_score: z.number().min(0).max(100).optional(),
      trade_opportunity_score: z.number().min(0).max(100).optional(),
      confidence_score: z.number().min(0).max(100).optional(),
      interest_tier: z.string().max(40).optional(),
      reason_codes: z.array(z.string().min(1).max(120)).max(50).optional(),
      disqualifiers: z.array(z.string().min(1).max(120)).max(50).optional(),
      thesis_key: z.string().min(1).max(200).optional(),
      thesis_title: z.string().min(1).max(300).optional(),
      thesis_confidence: z.number().min(0).max(100).optional(),
      decision: z.record(z.string(), z.unknown()),
      created_at: isoDateTimeSchema.optional()
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    const persisted = await resolveAndPersistMarket(config, input.identifier_type, input.identifier);
    const classificationId = persisted.stateStore.recordClassification({
      marketKey: persisted.marketKey,
      structuralType: input.structural_type,
      category: input.category,
      horizonBucket: input.horizon_bucket,
      pricingStatus: input.pricing_status,
      modelabilityScore: input.modelability_score,
      tradabilityScore: input.tradability_score,
      resolutionAmbiguityScore: input.resolution_ambiguity_score,
      attentionGapScore: input.attention_gap_score,
      crossMarketConsistencyScore: input.cross_market_consistency_score,
      researchPriorityScore: input.research_priority_score,
      tradeOpportunityScore: input.trade_opportunity_score,
      confidenceScore: input.confidence_score,
      interestTier: input.interest_tier,
      reasonCodes: input.reason_codes,
      disqualifiers: input.disqualifiers,
      thesisKey: input.thesis_key,
      thesisTitle: input.thesis_title,
      thesisConfidence: input.thesis_confidence,
      decision: input.decision,
      createdAt: input.created_at
    });
    return textResult({
      classificationId,
      marketKey: persisted.marketKey,
      stateDbPath: config.stateDbPath,
      snapshot: persisted.snapshot
    }, `Recorded classification ${classificationId} for ${persisted.marketKey}.`);
  }
);

server.registerTool(
  "sync_bookmarked_markets_to_watchlist",
  {
    description: toolDescription("sync_bookmarked_markets_to_watchlist"),
    inputSchema: {
      watchlist_name: z.string().min(1).max(120).default("bookmarks"),
      replace_existing_group: z.boolean().default(true),
      page_size: z.number().int().min(1).max(500).default(100),
      next_cursor: z.string().optional(),
      move_threshold_pct_points: z.number().min(0).default(3),
      spread_threshold_cents: z.number().min(0).default(5),
      include_related_markets: z.boolean().default(true),
      include_comments: z.boolean().default(true),
      scope: z.enum(["watchlist", "portfolio", "all"]).default("watchlist")
    }
  },
  async (input) => {
    const config = loadRuntimeConfig();
    if (!hasTradingCredentials(config)) {
      throw new Error("Authenticated CLOB credentials are required to sync bookmarked markets.");
    }
    const raw = await invokePythonHelper<Record<string, unknown> | Record<string, unknown>[]>(config, "bookmarked_markets", {
      page_size: input.page_size,
      next_cursor: input.next_cursor
    });
    const bookmarks = normalizeBookmarkedMarketsResponse(raw);
    if (bookmarks.count === 0) {
      return textResult({
        watchlistPath: path.resolve(config.cwd, "configs/watchlists.yaml"),
        count: 0,
        bookmarks: []
      }, "No bookmarked markets were returned, so watchlists.yaml was left unchanged.");
    }

    const watchlistPath = path.resolve(config.cwd, "configs/watchlists.yaml");
    const currentYaml = await readFile(watchlistPath, "utf8");
    const merged = mergeBookmarkedMarketsIntoWatchlistsYaml(currentYaml, bookmarks, {
      watchlist_name: input.watchlist_name,
      replace_existing_group: input.replace_existing_group,
      move_threshold_pct_points: input.move_threshold_pct_points,
      spread_threshold_cents: input.spread_threshold_cents,
      include_related_markets: input.include_related_markets,
      include_comments: input.include_comments,
      scope: input.scope
    });
    await writeFile(watchlistPath, merged.yaml, "utf8");

    return textResult(
      {
        watchlistPath,
        groupName: merged.groupName,
        replacedExistingGroup: merged.replacedExistingGroup,
        count: bookmarks.count,
        bookmarks: bookmarks.markets
      },
      `Synced ${bookmarks.count} bookmarked markets into ${merged.groupName} at ${watchlistPath}.`
    );
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
    const thesisExposure = thesisExposureContext(config, liveMarketSnapshot, orderNotionalUsd);
    warnings.push(...thesisExposure.warnings);

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
      thesisExposureUsd: thesisExposure.thesisExposureUsd,
      thesisMarketCount: thesisExposure.thesisMarketCount,
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
    const thesisExposure = thesisExposureContext(config, liveMarketSnapshot, incrementalNotionalUsd);
    warnings.push(...thesisExposure.warnings);

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
      thesisExposureUsd: thesisExposure.thesisExposureUsd,
      thesisMarketCount: thesisExposure.thesisMarketCount,
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
    try {
      const store = currentStateStore(config);
      const marketSnapshot = preview.marketSnapshot;
      const marketKey = store.resolveMarketKey({
        conditionId: marketSnapshot?.conditionId,
        marketId: marketSnapshot?.marketId,
        slug: marketSnapshot?.slug,
        title: marketSnapshot?.title
      });
      store.markPreviewSubmitted(preview.previewId);
      const orderRecord = orderRecordFromSubmitResult(preview, result);
      store.recordOrderSubmission({
        previewId: preview.previewId,
        marketKey,
        orderId: orderRecord.orderId,
        side: orderRecord.side,
        status: orderRecord.status,
        orderKind: orderRecord.orderKind,
        price: orderRecord.price,
        size: orderRecord.size,
        notionalUsd: orderRecord.notionalUsd,
        payload: orderRecord.payload
      });
    } catch {
      // submitting the live order should succeed even if local state persistence fails
    }
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
