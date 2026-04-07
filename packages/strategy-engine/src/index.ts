import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

import { hoursUntil } from "../../polymarket-core/src/index.js";
import type { RiskLimits } from "../../policy-engine/src/index.js";
import type {
  StateStore,
  StoredMarketState,
  StoredOrderRecord,
  StoredPortfolioRiskSummary,
  StoredThesisLinkRecord,
  StoredTrackedMarket
} from "../../state-store/src/index.js";

export interface StrategyPolicies {
  minEdgePctPoints: number;
  minLiquidityUsd: number;
  maxSpreadCentsForAggressiveEntry: number;
  preferLimitOrders: boolean;
  defaultLimitOrderType: "GTC" | "GTD";
  defaultMarketableOrderType: "FOK" | "FAK";
  defaultMaxSlippageBps: number;
  requireTwoSidedEvidence: boolean;
  requireRelatedMarketCheck: boolean;
  maxThesisExposureUsd: number;
  maxMarketsPerThesis: number;
  suppressLowerRankedSameThesisEntries: boolean;
  suppressWhenSameThesisHasActiveOrders: boolean;
  thesisExposurePenaltyPer10Usd: number;
}

export interface StrategyLatestClassification {
  createdAt?: string;
  structuralType?: string;
  category?: string;
  interestTier?: string;
  modelabilityScore?: number;
  tradabilityScore?: number;
  resolutionAmbiguityScore?: number;
  attentionGapScore?: number;
  crossMarketConsistencyScore?: number;
  researchPriorityScore?: number;
  tradeOpportunityScore?: number;
  confidenceScore?: number;
  reasonCodes: string[];
  disqualifiers: string[];
  decision: Record<string, unknown>;
}

export interface StrategyLatestResearch {
  runId?: string;
  title?: string;
  question?: string;
  thesis?: string;
  completedAt?: string;
  fairValueLow?: number;
  fairValueBase?: number;
  fairValueHigh?: number;
  providers: string[];
  openQuestions: string[];
  evidenceCounts: {
    supportsYes: number;
    supportsNo: number;
    neutral: number;
    unclear: number;
  };
}

export interface StrategySnapshotSummary {
  title?: string;
  marketKey?: string;
  slug?: string;
  marketId?: string;
  conditionId?: string;
  category?: string;
  tags: string[];
  currentYesPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
  spreadCents?: number;
  liquidityUsd?: number;
  volumeUsd?: number;
  minimumTickSize?: number;
  minimumOrderSize?: number;
  endDate?: string;
  hoursToResolution?: number;
}

export interface StrategyThesisContext {
  thesisKey: string;
  thesisTitle?: string;
  linkSource?: string;
  confidence?: number;
}

export interface StrategyPortfolioRiskContext {
  marketExposureUsd: number;
  thesisExposureUsd: number;
  thesisMarketCount: number;
  sameThesisActiveOrderCount: number;
  grossCurrentValueUsd: number;
  grossOpenOrderNotionalUsd: number;
  grossEffectiveExposureUsd: number;
  existingMarketExposureUsd: number;
  hasExistingMarketExposure: boolean;
}

export type StrategyStatus =
  | "preview-ready"
  | "strategy-ready"
  | "research-required"
  | "research-refresh-required"
  | "monitor-live-order"
  | "cancel-stale-order"
  | "wait"
  | "blocked";

export type ExecutionAction =
  | "prepare-preview"
  | "draft-strategy"
  | "run-deep-research"
  | "refresh-research"
  | "monitor-orders"
  | "cancel-orders"
  | "wait";

export interface StrategyEntryRecommendation {
  preferredSide: "buy-yes" | "buy-no";
  orderStyle: "limit" | "marketable";
  currentTokenPrice?: number;
  fairTokenValue?: number;
  entryCeilingTokenPrice?: number;
  defaultOrderType: "GTC" | "GTD" | "FOK" | "FAK";
  defaultMaxSlippageBps?: number;
}

export interface StrategyCandidate {
  marketKey: string;
  title: string;
  slug?: string;
  marketId?: string;
  conditionId?: string;
  category?: string;
  status: StrategyStatus;
  action: ExecutionAction;
  priorityScore: number;
  snapshot: StrategySnapshotSummary;
  classification?: StrategyLatestClassification;
  research?: StrategyLatestResearch;
  thesis?: StrategyThesisContext;
  portfolioRisk?: StrategyPortfolioRiskContext;
  edgePctPoints?: number;
  edgeDirection?: "buy-yes" | "buy-no";
  activeOrderCount: number;
  staleOrderIds: string[];
  activeOrders: StoredOrderRecord[];
  recommendedEntry?: StrategyEntryRecommendation;
  blockers: string[];
  notes: string[];
}

export interface ExecutionQueueItem {
  marketKey: string;
  title: string;
  action: ExecutionAction;
  priorityScore: number;
  status: StrategyStatus;
  staleOrderIds?: string[];
  recommendedEntry?: StrategyEntryRecommendation;
  blockers: string[];
  notes: string[];
}

export interface StrategyCandidateOptions {
  limit?: number;
  interestTiers?: string[];
  includeWaiting?: boolean;
  includeBlocked?: boolean;
}

export interface ExecutionQueueOptions {
  limit?: number;
  includeWaiting?: boolean;
}

const TERMINAL_ORDER_STATUSES = new Set([
  "cancelled",
  "canceled",
  "filled",
  "failed",
  "rejected",
  "expired",
  "closed",
  "deleted",
  "not_on_venue"
]);

function unknownRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function latestTimestamp(...values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function minutesSince(timestamp?: string): number | undefined {
  if (!timestamp) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return (Date.now() - parsed) / (1000 * 60);
}

function normalizeInterestTier(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.trim().toUpperCase();
}

function isActiveOrderStatus(status: string | undefined): boolean {
  if (!status) {
    return true;
  }
  return !TERMINAL_ORDER_STATUSES.has(status.trim().toLowerCase());
}

function extractSnapshotSummary(state: StoredMarketState): StrategySnapshotSummary {
  const latest = unknownRecord(state.latestSnapshot);
  const nested = unknownRecord(latest.snapshot);
  const market = unknownRecord(state.market);
  const bestBid = asNumber(latest.best_bid ?? latest.bestBid ?? nested.bestBid);
  const bestAsk = asNumber(latest.best_ask ?? latest.bestAsk ?? nested.bestAsk);
  const midpoint =
    asNumber(latest.midpoint ?? nested.midpoint) ??
    (bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestBid + bestAsk) / 2).toFixed(6))
      : undefined);
  const currentYesPrice =
    midpoint ??
    asNumber(latest.price ?? nested.price) ??
    (bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestBid + bestAsk) / 2).toFixed(6))
      : undefined);
  const endDate = firstString(latest.end_date, latest.endDate, nested.endDate, market.end_date, market.endDate);

  return {
    title: firstString(latest.title, nested.title, market.title),
    marketKey: firstString(latest.market_key, market.market_key),
    slug: firstString(latest.slug, nested.slug, market.slug),
    marketId: firstString(latest.market_id, latest.marketId, nested.marketId, market.market_id, market.marketId),
    conditionId: firstString(latest.condition_id, latest.conditionId, nested.conditionId, market.condition_id, market.conditionId),
    category: firstString(latest.category, nested.category, market.category),
    tags: asStringArray(latest.tags ?? nested.tags ?? market.tags_json),
    currentYesPrice,
    bestBid,
    bestAsk,
    midpoint,
    spreadCents: asNumber(latest.spread_cents ?? latest.spreadCents ?? nested.spreadCents),
    liquidityUsd: asNumber(latest.liquidity_usd ?? latest.liquidityUsd ?? nested.liquidityUsd),
    volumeUsd: asNumber(latest.volume_usd ?? latest.volumeUsd ?? nested.volumeUsd),
    minimumTickSize: asNumber(latest.minimum_tick_size ?? latest.minimumTickSize ?? nested.minimumTickSize),
    minimumOrderSize: asNumber(latest.minimum_order_size ?? latest.minimumOrderSize ?? nested.minimumOrderSize),
    endDate,
    hoursToResolution: hoursUntil(endDate)
  };
}

function extractLatestClassification(state: StoredMarketState): StrategyLatestClassification | undefined {
  const latest = unknownRecord(state.classifications[0]);
  if (Object.keys(latest).length === 0) {
    return undefined;
  }
  return {
    createdAt: firstString(latest.created_at, latest.createdAt),
    structuralType: firstString(latest.structural_type, latest.structuralType),
    category: firstString(latest.category),
    interestTier: firstString(latest.interest_tier, latest.interestTier),
    modelabilityScore: asNumber(latest.modelability_score ?? latest.modelabilityScore),
    tradabilityScore: asNumber(latest.tradability_score ?? latest.tradabilityScore),
    resolutionAmbiguityScore: asNumber(latest.resolution_ambiguity_score ?? latest.resolutionAmbiguityScore),
    attentionGapScore: asNumber(latest.attention_gap_score ?? latest.attentionGapScore),
    crossMarketConsistencyScore: asNumber(latest.cross_market_consistency_score ?? latest.crossMarketConsistencyScore),
    researchPriorityScore: asNumber(latest.research_priority_score ?? latest.researchPriorityScore),
    tradeOpportunityScore: asNumber(latest.trade_opportunity_score ?? latest.tradeOpportunityScore),
    confidenceScore: asNumber(latest.confidence_score ?? latest.confidenceScore),
    reasonCodes: asStringArray(latest.reasonCodes),
    disqualifiers: asStringArray(latest.disqualifiers),
    decision: unknownRecord(latest.decision)
  };
}

function extractLatestResearch(state: StoredMarketState): StrategyLatestResearch | undefined {
  const latest = unknownRecord(state.researchRuns[0]);
  if (Object.keys(latest).length === 0) {
    return undefined;
  }
  const synthesis = unknownRecord(latest.synthesis);
  const evidence = Array.isArray(latest.evidence) ? (latest.evidence as Array<Record<string, unknown>>) : [];
  let supportsYes = 0;
  let supportsNo = 0;
  let neutral = 0;
  let unclear = 0;
  for (const item of evidence) {
    const stance = String(item.stance ?? "").toLowerCase();
    if (stance === "supports-yes") {
      supportsYes += 1;
    } else if (stance === "supports-no") {
      supportsNo += 1;
    } else if (stance === "neutral") {
      neutral += 1;
    } else {
      unclear += 1;
    }
  }
  return {
    runId: firstString(latest.run_id, latest.runId),
    title: firstString(latest.title),
    question: firstString(latest.question),
    thesis: firstString(latest.thesis, synthesis.thesis),
    completedAt: firstString(latest.completed_at, latest.completedAt),
    fairValueLow: asNumber(latest.fair_value_low ?? latest.fairValueLow ?? synthesis.fairValueLow),
    fairValueBase: asNumber(latest.fair_value_base ?? latest.fairValueBase ?? synthesis.fairValueBase),
    fairValueHigh: asNumber(latest.fair_value_high ?? latest.fairValueHigh ?? synthesis.fairValueHigh),
    providers: asStringArray(latest.providers),
    openQuestions: asStringArray(latest.openQuestions),
    evidenceCounts: {
      supportsYes,
      supportsNo,
      neutral,
      unclear
    }
  };
}

function extractLatestThesis(state: StoredMarketState): StrategyThesisContext | undefined {
  const latest = (state.thesisLinks?.[0] ?? undefined) as StoredThesisLinkRecord | undefined;
  if (!latest?.thesisKey) {
    return undefined;
  }
  return {
    thesisKey: latest.thesisKey,
    thesisTitle: latest.thesisTitle,
    linkSource: latest.linkSource,
    confidence: latest.confidence
  } satisfies StrategyThesisContext;
}

function buildPortfolioRiskContext(
  summary: StoredPortfolioRiskSummary | undefined,
  marketKey: string,
  thesis: StrategyThesisContext | undefined
): StrategyPortfolioRiskContext {
  const marketExposure = summary?.marketExposures.find((entry) => entry.marketKey === marketKey);
  const thesisExposure = thesis?.thesisKey
    ? summary?.thesisExposures.find((entry) => entry.thesisKey === thesis.thesisKey)
    : undefined;
  const existingMarketExposureUsd = Number((marketExposure?.totalExposureUsd ?? 0).toFixed(6));
  return {
    marketExposureUsd: existingMarketExposureUsd,
    thesisExposureUsd: Number((thesisExposure?.totalExposureUsd ?? 0).toFixed(6)),
    thesisMarketCount: thesisExposure?.marketCount ?? 0,
    sameThesisActiveOrderCount: thesisExposure?.activeOrderCount ?? 0,
    grossCurrentValueUsd: summary?.grossCurrentValueUsd ?? 0,
    grossOpenOrderNotionalUsd: summary?.grossOpenOrderNotionalUsd ?? 0,
    grossEffectiveExposureUsd: summary?.grossEffectiveExposureUsd ?? 0,
    existingMarketExposureUsd,
    hasExistingMarketExposure: existingMarketExposureUsd > 0
  } satisfies StrategyPortfolioRiskContext;
}

function extractOrderRecords(state: StoredMarketState): StoredOrderRecord[] {
  return state.orders
    .map((order) => {
      const row = unknownRecord(order);
      return {
        id: asNumber(row.id),
        orderId: String(row.order_id ?? row.orderId ?? ""),
        previewId: firstString(row.preview_id, row.previewId),
        marketKey: firstString(row.market_key, row.marketKey),
        side: firstString(row.side),
        status: firstString(row.status),
        orderKind: firstString(row.order_kind, row.orderKind),
        price: asNumber(row.price),
        size: asNumber(row.size),
        notionalUsd: asNumber(row.notional_usd ?? row.notionalUsd),
        submittedAt: firstString(row.submitted_at, row.submittedAt),
        updatedAt: firstString(row.updated_at, row.updatedAt),
        payload: unknownRecord(row.payload)
      } satisfies StoredOrderRecord;
    })
    .filter((order) => order.orderId.length > 0);
}

function hasTwoSidedEvidence(research: StrategyLatestResearch | undefined): boolean {
  if (!research) {
    return false;
  }
  return research.evidenceCounts.supportsYes > 0 && research.evidenceCounts.supportsNo > 0;
}

function needsResearchRefresh(state: StoredMarketState, research: StrategyLatestResearch | undefined): boolean {
  if (!research?.completedAt) {
    return false;
  }
  const latestDevelopment = unknownRecord(state.developments[0]);
  const latestAlert = unknownRecord(state.alerts[0]);
  const latestSignalAt = latestTimestamp(
    firstString(latestDevelopment.discovered_at, latestDevelopment.discoveredAt),
    firstString(latestAlert.createdAt, latestAlert.created_at)
  );
  return Boolean(latestSignalAt && latestSignalAt > research.completedAt);
}

function derivePriorityScore(args: {
  status: StrategyStatus;
  classification?: StrategyLatestClassification;
  edgePctPoints?: number;
  staleOrderCount: number;
  activeOrderCount: number;
  thesisExposurePenalty: number;
}): number {
  const statusBase: Record<StrategyStatus, number> = {
    "preview-ready": 92,
    "strategy-ready": 82,
    "research-required": 68,
    "research-refresh-required": 74,
    "monitor-live-order": 60,
    "cancel-stale-order": 96,
    wait: 20,
    blocked: 5
  };
  return Number(
    (
      statusBase[args.status] +
      (args.classification?.tradeOpportunityScore ?? 0) * 0.35 +
      (args.classification?.researchPriorityScore ?? 0) * 0.2 +
      (args.classification?.confidenceScore ?? 0) * 0.15 +
      Math.min(Math.abs(args.edgePctPoints ?? 0), 25) +
      args.staleOrderCount * 3 +
      args.activeOrderCount -
      args.thesisExposurePenalty
    ).toFixed(2)
  );
}

export function defaultStrategyPolicies(): StrategyPolicies {
  return {
    minEdgePctPoints: 3,
    minLiquidityUsd: 10_000,
    maxSpreadCentsForAggressiveEntry: 2,
    preferLimitOrders: true,
    defaultLimitOrderType: "GTC",
    defaultMarketableOrderType: "FAK",
    defaultMaxSlippageBps: 150,
    requireTwoSidedEvidence: true,
    requireRelatedMarketCheck: true,
    maxThesisExposureUsd: 40,
    maxMarketsPerThesis: 2,
    suppressLowerRankedSameThesisEntries: true,
    suppressWhenSameThesisHasActiveOrders: true,
    thesisExposurePenaltyPer10Usd: 1.5
  };
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeStrategyPolicies(raw: Record<string, unknown> | null | undefined): StrategyPolicies {
  const defaults = defaultStrategyPolicies();
  const data = raw ?? {};
  const limitOrderType = String(data.default_limit_order_type ?? defaults.defaultLimitOrderType).toUpperCase();
  const marketableOrderType = String(data.default_marketable_order_type ?? defaults.defaultMarketableOrderType).toUpperCase();
  return {
    minEdgePctPoints: toNumber(data.min_edge_pct_points, defaults.minEdgePctPoints),
    minLiquidityUsd: toNumber(data.min_liquidity_usdc, defaults.minLiquidityUsd),
    maxSpreadCentsForAggressiveEntry: toNumber(
      data.max_spread_cents_for_aggressive_entry,
      defaults.maxSpreadCentsForAggressiveEntry
    ),
    preferLimitOrders: Boolean(data.prefer_limit_orders ?? defaults.preferLimitOrders),
    defaultLimitOrderType: limitOrderType === "GTD" ? "GTD" : "GTC",
    defaultMarketableOrderType: marketableOrderType === "FOK" ? "FOK" : "FAK",
    defaultMaxSlippageBps: toNumber(data.default_max_slippage_bps, defaults.defaultMaxSlippageBps),
    requireTwoSidedEvidence: Boolean(data.require_two_sided_evidence ?? defaults.requireTwoSidedEvidence),
    requireRelatedMarketCheck: Boolean(data.require_related_market_check ?? defaults.requireRelatedMarketCheck),
    maxThesisExposureUsd: toNumber(data.max_thesis_exposure_usdc, defaults.maxThesisExposureUsd),
    maxMarketsPerThesis: Math.max(
      0,
      Math.trunc(toNumber(data.max_markets_per_thesis, defaults.maxMarketsPerThesis))
    ),
    suppressLowerRankedSameThesisEntries: Boolean(
      data.suppress_lower_ranked_same_thesis_entries ?? defaults.suppressLowerRankedSameThesisEntries
    ),
    suppressWhenSameThesisHasActiveOrders: Boolean(
      data.suppress_when_same_thesis_has_active_orders ?? defaults.suppressWhenSameThesisHasActiveOrders
    ),
    thesisExposurePenaltyPer10Usd: toNumber(
      data.thesis_exposure_penalty_per_10_usdc,
      defaults.thesisExposurePenaltyPer10Usd
    )
  };
}

export async function loadStrategyPolicies(configPath: string): Promise<StrategyPolicies> {
  try {
    const raw = await readFile(configPath, "utf8");
    return normalizeStrategyPolicies(YAML.parse(raw) as Record<string, unknown>);
  } catch {
    return defaultStrategyPolicies();
  }
}

export function computeStrategyPolicyHash(policies: StrategyPolicies): string {
  return createHash("sha256")
    .update(JSON.stringify(policies, Object.keys(policies).sort()))
    .digest("hex");
}

export function deriveStrategyCandidate(
  state: StoredMarketState,
  policies: StrategyPolicies,
  riskLimits: RiskLimits,
  portfolioSummary?: StoredPortfolioRiskSummary
): StrategyCandidate {
  const snapshot = extractSnapshotSummary(state);
  const classification = extractLatestClassification(state);
  const research = extractLatestResearch(state);
  const thesis = extractLatestThesis(state);
  const marketKey =
    firstString(snapshot.marketKey, unknownRecord(state.market).market_key, unknownRecord(state.market).marketKey) ??
    "unknown";
  const portfolioRisk = buildPortfolioRiskContext(portfolioSummary, marketKey, thesis);
  const orders = extractOrderRecords(state);
  const activeOrders = orders.filter((order) => isActiveOrderStatus(order.status));
  const staleOrderIds = activeOrders
    .filter((order) => {
      const ageMinutes = minutesSince(order.submittedAt ?? order.updatedAt);
      return ageMinutes !== undefined && ageMinutes >= riskLimits.cancelStaleOrdersAfterMinutes;
    })
    .map((order) => order.orderId);

  const blockers: string[] = [];
  const notes: string[] = [];

  const blockedTags = snapshot.tags.filter((tag) => riskLimits.blockedTags.includes(tag));
  if (blockedTags.length > 0) {
    blockers.push(`blocked_tags:${blockedTags.join(",")}`);
  }

  for (const disqualifier of classification?.disqualifiers ?? []) {
    blockers.push(`classifier:${disqualifier}`);
  }

  if (
    snapshot.hoursToResolution !== undefined &&
    snapshot.hoursToResolution <= riskLimits.avoidMarketsResolvingWithinHours
  ) {
    blockers.push(`near_resolution:${snapshot.hoursToResolution.toFixed(2)}h`);
  }

  if (thesis) {
    notes.push(`Primary thesis: ${thesis.thesisTitle ?? thesis.thesisKey}.`);
  }
  if (portfolioRisk.grossEffectiveExposureUsd > 0) {
    notes.push(`Gross persisted exposure: ${portfolioRisk.grossEffectiveExposureUsd.toFixed(2)} USD.`);
  }
  if (thesis && portfolioRisk.thesisExposureUsd > 0) {
    notes.push(`Persisted thesis exposure: ${portfolioRisk.thesisExposureUsd.toFixed(2)} USD across ${portfolioRisk.thesisMarketCount} market(s).`);
  }
  if (
    thesis &&
    !portfolioRisk.hasExistingMarketExposure &&
    portfolioRisk.thesisExposureUsd >= policies.maxThesisExposureUsd
  ) {
    blockers.push(`thesis_exposure_limit:${portfolioRisk.thesisExposureUsd.toFixed(2)}`);
  }
  if (
    thesis &&
    !portfolioRisk.hasExistingMarketExposure &&
    portfolioRisk.thesisMarketCount >= policies.maxMarketsPerThesis
  ) {
    blockers.push(`thesis_market_limit:${portfolioRisk.thesisMarketCount}`);
  }
  if (
    thesis &&
    policies.suppressWhenSameThesisHasActiveOrders &&
    !portfolioRisk.hasExistingMarketExposure &&
    Math.max(0, portfolioRisk.sameThesisActiveOrderCount - activeOrders.length) > 0
  ) {
    notes.push("Another market in the same thesis already has a live order; new entries should be suppressed unless this is the highest-priority thesis expression.");
  }

  const currentYesPrice = snapshot.currentYesPrice;
  const fairValueBase = research?.fairValueBase ?? asNumber(classification?.decision.fairValueBase);
  const rawEdgePctPoints =
    fairValueBase !== undefined && currentYesPrice !== undefined
      ? Number(((fairValueBase - currentYesPrice) * 100).toFixed(2))
      : undefined;
  const edgePctPoints = rawEdgePctPoints !== undefined ? Math.abs(rawEdgePctPoints) : undefined;
  const edgeDirection =
    rawEdgePctPoints === undefined ? undefined : rawEdgePctPoints >= 0 ? ("buy-yes" as const) : ("buy-no" as const);

  const hasFairValue = fairValueBase !== undefined;
  const hasEnoughLiquidity =
    snapshot.liquidityUsd === undefined ? false : snapshot.liquidityUsd >= policies.minLiquidityUsd;
  const hasTightAggressiveSpread =
    snapshot.spreadCents !== undefined && snapshot.spreadCents <= policies.maxSpreadCentsForAggressiveEntry;
  const relatedMarketCheckPassed =
    !policies.requireRelatedMarketCheck || classification?.crossMarketConsistencyScore !== undefined;
  const twoSidedEvidenceOkay = !policies.requireTwoSidedEvidence || hasTwoSidedEvidence(research);
  const researchRefreshNeeded = needsResearchRefresh(state, research);
  const highInterest = ["A", "B"].includes(normalizeInterestTier(classification?.interestTier) ?? "");

  if (!classification) {
    notes.push("No persisted classification found yet.");
  }
  if (researchRefreshNeeded) {
    notes.push("Developments or alerts are newer than the latest research run.");
  }
  if (!twoSidedEvidenceOkay) {
    notes.push("Latest research is missing explicit evidence on both sides.");
  }
  if (!relatedMarketCheckPassed) {
    notes.push("No persisted related-market / basket consistency signal is available yet.");
  }
  if (!hasEnoughLiquidity) {
    notes.push("Stored liquidity is below the configured strategy threshold.");
  }
  if (edgePctPoints !== undefined && edgePctPoints < policies.minEdgePctPoints) {
    notes.push(
      `Stored edge ${edgePctPoints.toFixed(2)}pt is below the configured minimum edge ${policies.minEdgePctPoints.toFixed(2)}pt.`
    );
  }

  let status: StrategyStatus = "wait";
  let action: ExecutionAction = "wait";
  let recommendedEntry: StrategyEntryRecommendation | undefined;

  if (activeOrders.length > 0) {
    if (staleOrderIds.length > 0 || blockers.length > 0) {
      status = "cancel-stale-order";
      action = "cancel-orders";
    } else {
      status = "monitor-live-order";
      action = "monitor-orders";
    }
  } else if (blockers.length > 0) {
    status = "blocked";
    action = "wait";
  } else if (!classification) {
    status = "research-required";
    action = "run-deep-research";
  } else if (!hasFairValue) {
    status = highInterest ? "research-required" : "wait";
    action = highInterest ? "run-deep-research" : "wait";
  } else if (researchRefreshNeeded) {
    status = "research-refresh-required";
    action = "refresh-research";
  } else if (!twoSidedEvidenceOkay || !relatedMarketCheckPassed) {
    status = "research-required";
    action = "run-deep-research";
  } else if (edgePctPoints === undefined || edgePctPoints < policies.minEdgePctPoints) {
    status = "wait";
    action = "wait";
  } else {
    const currentTokenPrice =
      currentYesPrice === undefined || edgeDirection === undefined
        ? undefined
        : edgeDirection === "buy-yes"
          ? currentYesPrice
          : Number((1 - currentYesPrice).toFixed(6));
    const fairTokenValue =
      fairValueBase === undefined || edgeDirection === undefined
        ? undefined
        : edgeDirection === "buy-yes"
          ? fairValueBase
          : Number((1 - fairValueBase).toFixed(6));
    const entryCeilingTokenPrice =
      fairTokenValue === undefined
        ? undefined
        : Number(Math.max(0.0001, fairTokenValue - policies.minEdgePctPoints / 100).toFixed(6));
    const orderStyle =
      policies.preferLimitOrders || !hasTightAggressiveSpread ? ("limit" as const) : ("marketable" as const);
    recommendedEntry = edgeDirection
      ? {
          preferredSide: edgeDirection,
          orderStyle,
          currentTokenPrice,
          fairTokenValue,
          entryCeilingTokenPrice,
          defaultOrderType:
            orderStyle === "limit" ? policies.defaultLimitOrderType : policies.defaultMarketableOrderType,
          defaultMaxSlippageBps:
            orderStyle === "marketable" ? policies.defaultMaxSlippageBps : undefined
        }
      : undefined;

    if (
      hasEnoughLiquidity &&
      (snapshot.spreadCents === undefined ||
        snapshot.spreadCents <= Math.max(6, policies.maxSpreadCentsForAggressiveEntry * 2))
    ) {
      status = "preview-ready";
      action = "prepare-preview";
    } else {
      status = "strategy-ready";
      action = "draft-strategy";
    }
  }

  if (classification?.resolutionAmbiguityScore !== undefined) {
    notes.push(`Resolution ambiguity score: ${classification.resolutionAmbiguityScore.toFixed(1)}.`);
  }
  if (classification?.tradeOpportunityScore !== undefined) {
    notes.push(`Trade opportunity score: ${classification.tradeOpportunityScore.toFixed(1)}.`);
  }
  if (research?.completedAt) {
    notes.push(`Latest research completed at ${research.completedAt}.`);
  }

  const thesisExposurePenalty = thesis
    ? Number(((portfolioRisk.thesisExposureUsd / 10) * policies.thesisExposurePenaltyPer10Usd).toFixed(2))
    : 0;
  const priorityScore = derivePriorityScore({
    status,
    classification,
    edgePctPoints,
    staleOrderCount: staleOrderIds.length,
    activeOrderCount: activeOrders.length,
    thesisExposurePenalty
  });

  return {
    marketKey,
    title: snapshot.title ?? "unknown market",
    slug: snapshot.slug,
    marketId: snapshot.marketId,
    conditionId: snapshot.conditionId,
    category: snapshot.category,
    status,
    action,
    priorityScore,
    snapshot,
    classification,
    research,
    thesis,
    portfolioRisk,
    edgePctPoints,
    edgeDirection,
    activeOrderCount: activeOrders.length,
    staleOrderIds,
    activeOrders,
    recommendedEntry,
    blockers,
    notes
  };
}

function isEntryCandidate(candidate: StrategyCandidate): boolean {
  return candidate.status === "preview-ready" || candidate.status === "strategy-ready";
}

function applyThesisCorrelationSuppression(
  candidates: StrategyCandidate[],
  policies: StrategyPolicies
): StrategyCandidate[] {
  if (!policies.suppressLowerRankedSameThesisEntries && !policies.suppressWhenSameThesisHasActiveOrders) {
    return candidates;
  }

  const grouped = new Map<string, StrategyCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.thesis?.thesisKey || !isEntryCandidate(candidate) || candidate.activeOrderCount > 0) {
      continue;
    }
    const key = candidate.thesis.thesisKey;
    const list = grouped.get(key) ?? [];
    list.push(candidate);
    grouped.set(key, list);
  }

  for (const group of grouped.values()) {
    group.sort((left, right) => right.priorityScore - left.priorityScore);
    const leader = group[0];
    if (!leader) {
      continue;
    }

    for (let index = 0; index < group.length; index += 1) {
      const candidate = group[index];
      if (!candidate) {
        continue;
      }

      const hasSiblingActiveOrders = Math.max(0, (candidate.portfolioRisk?.sameThesisActiveOrderCount ?? 0) - candidate.activeOrderCount) > 0;
      if (
        policies.suppressWhenSameThesisHasActiveOrders &&
        hasSiblingActiveOrders &&
        !candidate.portfolioRisk?.hasExistingMarketExposure
      ) {
        candidate.notes.push("Suppressed because another market in the same thesis already has an active live order.");
        candidate.blockers.push(`thesis_active_orders:${candidate.thesis?.thesisKey ?? "unknown"}`);
        candidate.status = "wait";
        candidate.action = "wait";
        candidate.recommendedEntry = undefined;
        candidate.priorityScore = Number(Math.max(0, candidate.priorityScore - 20).toFixed(2));
        continue;
      }

      if (!policies.suppressLowerRankedSameThesisEntries || index === 0) {
        continue;
      }
      candidate.notes.push(`Suppressed behind higher-priority thesis peer ${leader.title}.`);
      candidate.blockers.push(`thesis_peer:${leader.marketKey}`);
      candidate.status = "wait";
      candidate.action = "wait";
      candidate.recommendedEntry = undefined;
      candidate.priorityScore = Number(Math.max(0, candidate.priorityScore - 25).toFixed(2));
    }
  }

  return candidates;
}

export function listStrategyCandidates(
  store: StateStore,
  policies: StrategyPolicies,
  riskLimits: RiskLimits,
  options?: StrategyCandidateOptions
): StrategyCandidate[] {
  const limit = Math.max(1, Math.min(250, options?.limit ?? 25));
  const interestTiers = new Set((options?.interestTiers ?? []).map((value) => value.trim().toUpperCase()));
  const tracked = store.listTrackedMarkets(Math.max(limit * 4, 100));
  const portfolioSummary = store.getPortfolioRiskSummary({ limit: Math.max(limit * 4, 100) });
  const candidates = applyThesisCorrelationSuppression(
    tracked.map((trackedMarket) => {
      const state = store.getMarketState({ marketKey: trackedMarket.marketKey, limit: 20 });
      return deriveStrategyCandidate(state, policies, riskLimits, portfolioSummary);
    }),
    policies
  );
  return candidates
    .filter((candidate) => {
      const normalizedTier = normalizeInterestTier(candidate.classification?.interestTier);
      if (interestTiers.size > 0 && (!normalizedTier || !interestTiers.has(normalizedTier))) {
        return false;
      }
      if (!options?.includeBlocked && candidate.status === "blocked") {
        return false;
      }
      if (!options?.includeWaiting && (candidate.status === "wait" || candidate.status === "monitor-live-order")) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, limit);
}

export function buildExecutionQueue(
  store: StateStore,
  policies: StrategyPolicies,
  riskLimits: RiskLimits,
  options?: ExecutionQueueOptions
): ExecutionQueueItem[] {
  return listStrategyCandidates(store, policies, riskLimits, {
    limit: Math.max(1, Math.min(250, options?.limit ?? 25)),
    includeBlocked: true,
    includeWaiting: options?.includeWaiting ?? false
  })
    .map((candidate) => ({
      marketKey: candidate.marketKey,
      title: candidate.title,
      action: candidate.action,
      priorityScore: candidate.priorityScore,
      status: candidate.status,
      staleOrderIds: candidate.staleOrderIds.length > 0 ? candidate.staleOrderIds : undefined,
      recommendedEntry: candidate.recommendedEntry,
      blockers: candidate.blockers,
      notes: candidate.notes
    }))
    .filter((item) => options?.includeWaiting || item.action !== "wait")
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, Math.max(1, Math.min(250, options?.limit ?? 25)));
}

export function summarizeTrackedMarkets(trackedMarkets: StoredTrackedMarket[]): Record<string, number> {
  return trackedMarkets.reduce(
    (summary, market) => {
      summary.total += 1;
      if (market.latestInterestTier) {
        const key = `tier_${market.latestInterestTier.toLowerCase()}`;
        summary[key] = (summary[key] ?? 0) + 1;
      }
      if ((market.activeOrderCount ?? 0) > 0) {
        summary.withActiveOrders += 1;
      }
      if (market.latestResearchAt) {
        summary.withResearch += 1;
      }
      return summary;
    },
    { total: 0, withActiveOrders: 0, withResearch: 0 } as Record<string, number>
  );
}
