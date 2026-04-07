import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

export interface RiskLimits {
  tradingEnabled: boolean;
  requirePreviewBeforeSubmit: boolean;
  requireGeoblockCheck: boolean;
  maxSingleOrderUsd: number;
  maxPerMarketUsd: number;
  maxGrossExposureUsd: number;
  maxDailyLossUsd: number;
  maxOpenOrders: number;
  avoidMarketsResolvingWithinHours: number;
  cancelStaleOrdersAfterMinutes: number;
  blockedTags: string[];
}

export interface PolicyContext {
  marketId?: string;
  tokenId?: string;
  tags?: string[];
  orderNotionalUsd?: number;
  marketExposureUsd?: number;
  grossExposureUsd?: number;
  openOrderCount?: number;
  resolvesWithinHours?: number;
  geoblockPassed?: boolean;
}

export interface PolicyWarning {
  code: string;
  severity: "info" | "warn" | "block";
  message: string;
}

export interface PolicyDecision {
  allow: boolean;
  warnings: PolicyWarning[];
}

export function defaultRiskLimits(): RiskLimits {
  return {
    tradingEnabled: false,
    requirePreviewBeforeSubmit: true,
    requireGeoblockCheck: true,
    maxSingleOrderUsd: 100,
    maxPerMarketUsd: 250,
    maxGrossExposureUsd: 1000,
    maxDailyLossUsd: 100,
    maxOpenOrders: 20,
    avoidMarketsResolvingWithinHours: 2,
    cancelStaleOrdersAfterMinutes: 30,
    blockedTags: []
  };
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeRiskLimits(raw: Record<string, unknown> | null | undefined): RiskLimits {
  const defaults = defaultRiskLimits();
  const data = raw ?? {};
  return {
    tradingEnabled: Boolean(data.trading_enabled ?? data.tradingEnabled ?? defaults.tradingEnabled),
    requirePreviewBeforeSubmit: Boolean(
      data.require_preview_before_submit ??
        data.requirePreviewBeforeSubmit ??
        defaults.requirePreviewBeforeSubmit
    ),
    requireGeoblockCheck: Boolean(
      data.require_geoblock_check ??
        data.requireGeoblockCheck ??
        defaults.requireGeoblockCheck
    ),
    maxSingleOrderUsd: toNumber(
      data.max_single_order_usdc ?? data.maxSingleOrderUsd,
      defaults.maxSingleOrderUsd
    ),
    maxPerMarketUsd: toNumber(
      data.max_per_market_usdc ?? data.maxPerMarketUsd,
      defaults.maxPerMarketUsd
    ),
    maxGrossExposureUsd: toNumber(
      data.max_gross_exposure_usdc ?? data.maxGrossExposureUsd,
      defaults.maxGrossExposureUsd
    ),
    maxDailyLossUsd: toNumber(
      data.max_daily_loss_usdc ?? data.maxDailyLossUsd,
      defaults.maxDailyLossUsd
    ),
    maxOpenOrders: Math.max(
      0,
      Math.trunc(toNumber(data.max_open_orders ?? data.maxOpenOrders, defaults.maxOpenOrders))
    ),
    avoidMarketsResolvingWithinHours: toNumber(
      data.avoid_markets_resolving_within_hours ??
        data.avoidMarketsResolvingWithinHours,
      defaults.avoidMarketsResolvingWithinHours
    ),
    cancelStaleOrdersAfterMinutes: toNumber(
      data.cancel_stale_orders_after_minutes ??
        data.cancelStaleOrdersAfterMinutes,
      defaults.cancelStaleOrdersAfterMinutes
    ),
    blockedTags: Array.isArray(data.blocked_tags)
      ? data.blocked_tags.map(String)
      : Array.isArray(data.blockedTags)
        ? data.blockedTags.map(String)
        : defaults.blockedTags
  };
}

export async function loadRiskLimits(configPath: string): Promise<RiskLimits> {
  try {
    const raw = await readFile(configPath, "utf8");
    return normalizeRiskLimits(YAML.parse(raw) as Record<string, unknown>);
  } catch {
    return defaultRiskLimits();
  }
}

export function computePolicyHash(limits: RiskLimits): string {
  return createHash("sha256")
    .update(JSON.stringify(limits, Object.keys(limits).sort()))
    .digest("hex");
}

export function evaluatePolicy(limits: RiskLimits, ctx: PolicyContext): PolicyDecision {
  const warnings: PolicyWarning[] = [];

  if (!limits.tradingEnabled) {
    warnings.push({
      code: "TRADING_DISABLED",
      severity: "block",
      message: "Trading is disabled by configuration."
    });
  }

  if (limits.requireGeoblockCheck && ctx.geoblockPassed === false) {
    warnings.push({
      code: "GEO_BLOCKED",
      severity: "block",
      message: "Geographic restriction check failed."
    });
  }

  if ((ctx.orderNotionalUsd ?? 0) > limits.maxSingleOrderUsd) {
    warnings.push({
      code: "MAX_SINGLE_ORDER",
      severity: "block",
      message: `Proposed order exceeds max_single_order_usdc (${limits.maxSingleOrderUsd}).`
    });
  }

  if ((ctx.marketExposureUsd ?? 0) > limits.maxPerMarketUsd) {
    warnings.push({
      code: "MAX_PER_MARKET",
      severity: "block",
      message: `Projected per-market exposure exceeds max_per_market_usdc (${limits.maxPerMarketUsd}).`
    });
  }

  if ((ctx.grossExposureUsd ?? 0) > limits.maxGrossExposureUsd) {
    warnings.push({
      code: "MAX_GROSS_EXPOSURE",
      severity: "block",
      message: `Projected gross exposure exceeds max_gross_exposure_usdc (${limits.maxGrossExposureUsd}).`
    });
  }

  if ((ctx.openOrderCount ?? 0) > limits.maxOpenOrders) {
    warnings.push({
      code: "MAX_OPEN_ORDERS",
      severity: "warn",
      message: `Open-order count (${ctx.openOrderCount}) exceeds configured max_open_orders (${limits.maxOpenOrders}).`
    });
  }

  if (
    ctx.resolvesWithinHours !== undefined &&
    ctx.resolvesWithinHours <= limits.avoidMarketsResolvingWithinHours
  ) {
    warnings.push({
      code: "NEAR_RESOLUTION",
      severity: "warn",
      message: `Market is close to resolution (${ctx.resolvesWithinHours.toFixed(2)}h remaining).`
    });
  }

  for (const tag of ctx.tags ?? []) {
    if (limits.blockedTags.includes(tag)) {
      warnings.push({
        code: "BLOCKED_TAG",
        severity: "block",
        message: `Trading is blocked for tag: ${tag}`
      });
    }
  }

  return {
    allow: !warnings.some((warning) => warning.severity === "block"),
    warnings
  };
}
