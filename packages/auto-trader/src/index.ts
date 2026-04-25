import { randomUUID } from "node:crypto";

import type {
  StateStore,
  StoredAutoTradingDecisionRecord,
  StoredAutoTradingSessionRecord,
  StoredPaperTradingLedger,
  StoredUniverseMarketInput
} from "../../state-store/src/index.js";
export {
  buildIndependentForecastArtifact,
  runIndependentForecastWriter,
  type ForecastWriterInput,
  type ForecastWriterResult,
  type IndependentForecastArtifact
} from "./forecast-writer.js";

export type AutoTradingRiskProfile = "conservative" | "balanced" | "aggressive";
export type AutoTradingMode = "paper" | "live_guarded" | "live_autonomous";
export type AutoTradingAction =
  | "paper_buy_yes"
  | "paper_sell_yes"
  | "live_buy_yes"
  | "live_sell_yes"
  | "research_required"
  | "monitor"
  | "skip";

export interface AutoTradingMandateInput {
  name?: string;
  budgetUsdc: number;
  timeframeHours: number;
  riskProfile: AutoTradingRiskProfile;
  mode?: AutoTradingMode;
  maxSingleOrderUsdc?: number;
  minOrderUsdc?: number;
  maxOpenPositions?: number;
  maxEventPositions?: number;
  maxEventExposureUsdc?: number;
  maxMarketHorizonHours?: number;
  minMarketHoursToEnd?: number;
  minLiquidityUsdc?: number;
  maxSpreadCents?: number;
  minTradabilityScore?: number;
  minResearchPriorityScore?: number;
  maxResolutionAmbiguityScore?: number;
  stopLossUsdc?: number;
  takeProfitPct?: number;
  positionStopLossPct?: number;
  positionStopLossGraceMinutes?: number;
  paperReentryCooldownMinutes?: number;
  timeExitHours?: number;
  heartbeatMinutes?: number;
  allowedCategoryGroups?: string[];
  blockedCategoryGroups?: string[];
  allowedOpportunityModes?: string[];
  includeLongshots?: boolean;
}

export interface AutoTradingMandate extends Required<Omit<
  AutoTradingMandateInput,
  "name" | "allowedCategoryGroups" | "blockedCategoryGroups" | "allowedOpportunityModes"
>> {
  name?: string;
  allowedCategoryGroups: string[];
  blockedCategoryGroups: string[];
  allowedOpportunityModes: string[];
}

export interface AutoTradingDecision {
  marketKey?: string;
  title?: string;
  action: AutoTradingAction;
  status: "proposed" | "blocked" | "watch" | "research";
  score: number;
  allocatedBudgetUsdc?: number;
  targetPrice?: number;
  shares?: number;
  tokenId?: string;
  nextCheckAt?: string;
  reasonCodes: string[];
  blockers: string[];
  market: Record<string, unknown>;
  forecastEdge?: AutoTradingForecastEdge;
}

export interface AutoTradingForecastEdge {
  fairProbability: number;
  executionPrice: number;
  uncertainty: number;
  spreadPenalty: number;
  rawEdge: number;
  adjustedEdge: number;
  minRequiredEdge: number;
  forecastedAt?: string;
  expiresAt?: string;
}

export interface AutoTradingIterationResult {
  session: StoredAutoTradingSessionRecord;
  iterationId: string;
  generatedAt: string;
  runId: string;
  mandate: AutoTradingMandate;
  summary: {
    mode: AutoTradingMode;
    riskProfile: AutoTradingRiskProfile;
    budgetUsdc: number;
    spentUsdc: number;
    positionValueUsdc: number;
    unrealizedPnlUsdc: number;
    realizedPnlUsdc: number;
    totalPnlUsdc: number;
    portfolioValueUsdc: number;
    openPositions: number;
    proposedBudgetUsdc: number;
    remainingBudgetUsdc: number;
    eligibleMarkets: number;
    proposedOrders: number;
    exitOrders: number;
    researchRequired: number;
    blocked: number;
    blockerCounts: Record<string, number>;
    riskBlockedNewBuys: boolean;
    nextRunAt?: string;
  };
  decisions: StoredAutoTradingDecisionRecord[];
  ledger: StoredPaperTradingLedger;
  candidates: AutoTradingDecision[];
}

export interface AutoTradingExecutionPreviewRequest {
  sessionId: string;
  decisionId: string;
  mode: AutoTradingMode;
  action: AutoTradingAction;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderType: "GTC";
  postOnly: boolean;
  clientOrderId: string;
  notionalUsdc: number;
}

export interface AutoTradingExecutionGate {
  decisionId: string;
  mode: AutoTradingMode;
  canPreview: boolean;
  canSubmitAutonomously: boolean;
  requiresApproval: boolean;
  blockers: string[];
  previewRequest?: AutoTradingExecutionPreviewRequest;
}

export interface CompactAutoTradingDecision {
  marketKey?: string;
  title?: string;
  action: AutoTradingAction;
  status: AutoTradingDecision["status"];
  score: number;
  allocatedBudgetUsdc?: number;
  targetPrice?: number;
  shares?: number;
  tokenId?: string;
  nextCheckAt?: string;
  reasonCodes: string[];
  blockers: string[];
  forecastEdge?: AutoTradingForecastEdge;
  market?: {
    eventTitle?: string;
    eventSlug?: string;
    categoryGroup?: string;
    structuralType?: string;
    opportunityMode?: string;
    horizonBucket?: string;
    priceBucket?: string;
    liquidityUsd?: number;
    volume24hUsd?: number;
    impliedProb?: number;
    bestBid?: number;
    bestAsk?: number;
    spreadCents?: number;
    endDate?: string;
    active?: boolean;
    closed?: boolean;
    restricted?: boolean;
    acceptingOrders?: boolean;
    disqualifiers?: string[];
  };
}

export interface CompactAutoTradingIterationResult {
  session: Pick<
    StoredAutoTradingSessionRecord,
    "sessionId" | "status" | "mode" | "riskProfile" | "budgetUsdc" | "timeframeHours" | "startedAt" | "endsAt" | "heartbeatMinutes"
  >;
  iterationId: string;
  generatedAt: string;
  runId: string;
  summary: AutoTradingIterationResult["summary"];
  mandate: Pick<
    AutoTradingMandate,
    | "riskProfile"
    | "mode"
    | "budgetUsdc"
    | "timeframeHours"
    | "maxSingleOrderUsdc"
    | "minOrderUsdc"
    | "maxOpenPositions"
    | "maxEventPositions"
    | "maxEventExposureUsdc"
    | "maxMarketHorizonHours"
    | "minLiquidityUsdc"
    | "maxSpreadCents"
    | "takeProfitPct"
    | "positionStopLossPct"
    | "positionStopLossGraceMinutes"
    | "paperReentryCooldownMinutes"
    | "timeExitHours"
    | "heartbeatMinutes"
  >;
  candidates: CompactAutoTradingDecision[];
}

export interface AutoTradingSimulationMarket {
  marketKey: string;
  title: string;
  prices: number[];
  eventTitle?: string;
  eventSlug?: string;
  categoryGroup?: string;
  structuralType?: string;
  opportunityMode?: string;
  endHoursFromStart?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  spreadCents?: number;
  tradeOpportunityScore?: number;
  researchPriorityScore?: number;
  tradabilityScore?: number;
  catalystScore?: number;
  resolutionAmbiguityScore?: number;
  riskScore?: number;
  reasonCodes?: string[];
  disqualifiers?: string[];
}

export interface AutoTradingSimulationInput {
  mandate: AutoTradingMandateInput;
  markets: AutoTradingSimulationMarket[];
  startAt?: Date;
  ticks?: number;
  tickMinutes?: number;
  limit?: number;
}

export interface AutoTradingSimulationFill {
  tick: number;
  filledAt: string;
  marketKey: string;
  title?: string;
  price: number;
  shares: number;
  costUsdc: number;
  decisionScore: number;
}

export interface AutoTradingSimulationPosition {
  marketKey: string;
  title?: string;
  shares: number;
  averagePrice: number;
  costUsdc: number;
  currentPrice: number;
  currentValueUsdc: number;
  unrealizedPnlUsdc: number;
  unrealizedPnlPct: number;
}

export interface AutoTradingSimulationTick {
  tick: number;
  now: string;
  runId: string;
  sessionId: string;
  proposedOrders: number;
  blocked: number;
  researchRequired: number;
  fills: AutoTradingSimulationFill[];
  cashUsdc: number;
  positionValueUsdc: number;
  portfolioValueUsdc: number;
}

export interface AutoTradingSimulationResult {
  simulationId: string;
  startedAt: string;
  completedAt: string;
  mandate: AutoTradingMandate;
  sessionId: string;
  summary: {
    initialCashUsdc: number;
    finalCashUsdc: number;
    positionValueUsdc: number;
    finalPortfolioValueUsdc: number;
    totalSpentUsdc: number;
    unrealizedPnlUsdc: number;
    returnPct: number;
    fillCount: number;
    positionCount: number;
    ticks: number;
  };
  ticks: AutoTradingSimulationTick[];
  fills: AutoTradingSimulationFill[];
  positions: AutoTradingSimulationPosition[];
}

interface RiskDefaults {
  maxSingleOrderBudgetFraction: number;
  maxOpenPositions: number;
  maxEventPositions: number;
  maxEventExposureBudgetFraction: number;
  maxMarketHorizonMultiplier: number;
  minMarketHoursToEnd: number;
  minLiquidityUsdc: number;
  maxSpreadCents: number;
  minOrderUsdc: number;
  minTradabilityScore: number;
  minResearchPriorityScore: number;
  maxResolutionAmbiguityScore: number;
  stopLossBudgetFraction: number;
  takeProfitPct: number;
  positionStopLossPct: number;
  positionStopLossGraceMinutes: number;
  paperReentryCooldownMinutes: number;
  timeExitHours: number;
  heartbeatMinutes: number;
  includeLongshots: boolean;
  proposalThreshold: number;
}

const RISK_DEFAULTS: Record<AutoTradingRiskProfile, RiskDefaults> = {
  conservative: {
    maxSingleOrderBudgetFraction: 0.08,
    maxOpenPositions: 4,
    maxEventPositions: 1,
    maxEventExposureBudgetFraction: 0.12,
    maxMarketHorizonMultiplier: 1.25,
    minMarketHoursToEnd: 6,
    minLiquidityUsdc: 10_000,
    maxSpreadCents: 3,
    minOrderUsdc: 1,
    minTradabilityScore: 70,
    minResearchPriorityScore: 70,
    maxResolutionAmbiguityScore: 30,
    stopLossBudgetFraction: 0.12,
    takeProfitPct: 15,
    positionStopLossPct: 8,
    positionStopLossGraceMinutes: 30,
    paperReentryCooldownMinutes: 60,
    timeExitHours: 2,
    heartbeatMinutes: 60,
    includeLongshots: false,
    proposalThreshold: 72
  },
  balanced: {
    maxSingleOrderBudgetFraction: 0.12,
    maxOpenPositions: 6,
    maxEventPositions: 1,
    maxEventExposureBudgetFraction: 0.18,
    maxMarketHorizonMultiplier: 1.5,
    minMarketHoursToEnd: 2,
    minLiquidityUsdc: 5_000,
    maxSpreadCents: 5,
    minOrderUsdc: 1,
    minTradabilityScore: 58,
    minResearchPriorityScore: 58,
    maxResolutionAmbiguityScore: 45,
    stopLossBudgetFraction: 0.22,
    takeProfitPct: 25,
    positionStopLossPct: 15,
    positionStopLossGraceMinutes: 20,
    paperReentryCooldownMinutes: 30,
    timeExitHours: 1,
    heartbeatMinutes: 30,
    includeLongshots: true,
    proposalThreshold: 65
  },
  aggressive: {
    maxSingleOrderBudgetFraction: 0.18,
    maxOpenPositions: 10,
    maxEventPositions: 1,
    maxEventExposureBudgetFraction: 0.22,
    maxMarketHorizonMultiplier: 2,
    minMarketHoursToEnd: 0.05,
    minLiquidityUsdc: 1_000,
    maxSpreadCents: 8,
    minOrderUsdc: 1,
    minTradabilityScore: 42,
    minResearchPriorityScore: 48,
    maxResolutionAmbiguityScore: 60,
    stopLossBudgetFraction: 0.35,
    takeProfitPct: 45,
    positionStopLossPct: 25,
    positionStopLossGraceMinutes: 10,
    paperReentryCooldownMinutes: 15,
    timeExitHours: 0.25,
    heartbeatMinutes: 15,
    includeLongshots: true,
    proposalThreshold: 58
  }
};

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

function roundShares(value: number): number {
  return Number(value.toFixed(6));
}

function redeployAfterExitMinutes(mandate: AutoTradingMandate): number {
  return Math.min(5, mandate.heartbeatMinutes);
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0.001, Math.min(0.999, Number(value.toFixed(4))));
}

function entryActionForMode(mode: AutoTradingMode): AutoTradingAction {
  return mode === "paper" ? "paper_buy_yes" : "live_buy_yes";
}

function exitActionForMode(mode: AutoTradingMode): AutoTradingAction {
  return mode === "paper" ? "paper_sell_yes" : "live_sell_yes";
}

function isEntryAction(action: AutoTradingAction): boolean {
  return action === "paper_buy_yes" || action === "live_buy_yes";
}

function isExitAction(action: AutoTradingAction): boolean {
  return action === "paper_sell_yes" || action === "live_sell_yes";
}

function decisionStatusRank(decision: AutoTradingDecision): number {
  if (decision.status === "proposed") {
    return 0;
  }
  if (decision.status === "research") {
    return 1;
  }
  if (decision.status === "watch") {
    return 2;
  }
  return 3;
}

function actionSide(action: AutoTradingAction): "BUY" | "SELL" | undefined {
  if (isEntryAction(action)) {
    return "BUY";
  }
  if (isExitAction(action)) {
    return "SELL";
  }
  return undefined;
}

type PaperExecutionStatus = "filled" | "partial_filled" | "missed" | "expired" | "rejected";

interface PaperExecutionResult {
  status: PaperExecutionStatus;
  side?: "buy_yes" | "sell_yes";
  limitPrice: number;
  requestedShares: number;
  requestedNotionalUsdc: number;
  fillPrice?: number;
  filledShares: number;
  filledNotionalUsdc: number;
  reasonCodes: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

function paperTradingSideForAction(action: AutoTradingAction): "buy_yes" | "sell_yes" | undefined {
  if (action === "paper_buy_yes") {
    return "buy_yes";
  }
  if (action === "paper_sell_yes") {
    return "sell_yes";
  }
  return undefined;
}

function marketTimestampMs(market: Record<string, unknown>): number | undefined {
  const raw = market.capturedAt ?? market.updatedAt ?? market.updated_at ?? market.createdAt ?? market.created_at;
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

function availablePaperDepthUsdc(
  market: Record<string, unknown>,
  requestedNotionalUsdc: number,
  executionKind: "taker" | "maker"
): number {
  const explicitDepth = asNumber(market.depthUsdWithin2c) ?? asNumber(market.depth_usd_within_2c);
  if (explicitDepth !== undefined) {
    return Math.max(0, explicitDepth);
  }
  const liquidityUsd = asNumber(market.liquidityUsd) ?? asNumber(market.liquidity_usd) ?? 0;
  const volume24hUsd = asNumber(market.volume24hUsd) ?? asNumber(market.volume_24h_usd) ?? 0;
  if (liquidityUsd <= 0 && volume24hUsd <= 0) {
    return executionKind === "taker" ? requestedNotionalUsdc : 0;
  }
  const liquidityFraction = executionKind === "taker" ? 0.005 : 0.002;
  const volumeFraction = executionKind === "taker" ? 0.02 : 0.01;
  const estimated = Math.max(liquidityUsd * liquidityFraction, volume24hUsd * volumeFraction);
  return Math.max(0, estimated);
}

function simulatePaperExecution(decision: AutoTradingDecision, now: Date): PaperExecutionResult {
  const side = paperTradingSideForAction(decision.action);
  const limitPrice = clampProbability(decision.targetPrice ?? 0);
  const requestedShares = roundShares(Math.max(0, decision.shares ?? 0));
  const requestedNotionalUsdc = roundMoney(Math.max(
    0,
    decision.allocatedBudgetUsdc ?? requestedShares * limitPrice
  ));
  const bestBid = asNumber(decision.market.bestBid) ?? asNumber(decision.market.best_bid);
  const bestAsk = asNumber(decision.market.bestAsk) ?? asNumber(decision.market.best_ask);
  const spreadCents = asNumber(decision.market.spreadCents) ?? asNumber(decision.market.spread_cents);
  const volume24hUsd = asNumber(decision.market.volume24hUsd) ?? asNumber(decision.market.volume_24h_usd) ?? 0;
  const liquidityUsd = asNumber(decision.market.liquidityUsd) ?? asNumber(decision.market.liquidity_usd) ?? 0;
  const timestampMs = marketTimestampMs(decision.market);
  const snapshotAgeMinutes = timestampMs === undefined
    ? undefined
    : Math.max(0, (now.getTime() - timestampMs) / 60_000);
  const reasonCodes: string[] = [];
  const warnings: string[] = [];

  if (!side || requestedShares <= 0 || requestedNotionalUsdc <= 0) {
    return {
      status: "rejected",
      side,
      limitPrice,
      requestedShares,
      requestedNotionalUsdc,
      filledShares: 0,
      filledNotionalUsdc: 0,
      reasonCodes: ["invalid_paper_order"],
      warnings,
      metadata: {
        executionModel: "paper_execution_v1",
        bestBid,
        bestAsk,
        spreadCents,
        volume24hUsd,
        liquidityUsd,
        snapshotAgeMinutes
      }
    };
  }

  if (snapshotAgeMinutes !== undefined && snapshotAgeMinutes > 30) {
    return {
      status: "missed",
      side,
      limitPrice,
      requestedShares,
      requestedNotionalUsdc,
      filledShares: 0,
      filledNotionalUsdc: 0,
      reasonCodes: ["stale_market_snapshot"],
      warnings: [`market_snapshot_age_minutes:${Math.round(snapshotAgeMinutes)}`],
      metadata: {
        executionModel: "paper_execution_v1",
        bestBid,
        bestAsk,
        spreadCents,
        volume24hUsd,
        liquidityUsd,
        snapshotAgeMinutes
      }
    };
  }

  let fillPrice: number | undefined;
  let executionKind: "taker" | "maker" | undefined;
  if (side === "buy_yes") {
    if (bestAsk !== undefined && limitPrice >= bestAsk) {
      fillPrice = bestAsk;
      executionKind = "taker";
      reasonCodes.push("crossed_best_ask");
    } else if (
      bestBid !== undefined &&
      limitPrice >= bestBid &&
      (spreadCents ?? 999) <= 2 &&
      (volume24hUsd >= 1_000 || liquidityUsd >= 10_000)
    ) {
      fillPrice = limitPrice;
      executionKind = "maker";
      reasonCodes.push("tight_spread_passive_fill");
    }
  } else if (side === "sell_yes") {
    if (bestBid !== undefined && limitPrice <= bestBid) {
      fillPrice = bestBid;
      executionKind = "taker";
      reasonCodes.push("crossed_best_bid");
    } else if (
      bestAsk !== undefined &&
      limitPrice <= bestAsk &&
      (spreadCents ?? 999) <= 2 &&
      (volume24hUsd >= 1_000 || liquidityUsd >= 10_000)
    ) {
      fillPrice = limitPrice;
      executionKind = "maker";
      reasonCodes.push("tight_spread_passive_fill");
    } else if (bestBid === undefined && bestAsk === undefined && decision.targetPrice !== undefined) {
      fillPrice = limitPrice;
      executionKind = "taker";
      reasonCodes.push("marked_position_exit");
    }
  }

  if (fillPrice === undefined || executionKind === undefined) {
    return {
      status: "missed",
      side,
      limitPrice,
      requestedShares,
      requestedNotionalUsdc,
      filledShares: 0,
      filledNotionalUsdc: 0,
      reasonCodes: ["limit_not_executable"],
      warnings,
      metadata: {
        executionModel: "paper_execution_v1",
        bestBid,
        bestAsk,
        spreadCents,
        volume24hUsd,
        liquidityUsd,
        snapshotAgeMinutes
      }
    };
  }

  const availableNotionalUsdc = availablePaperDepthUsdc(decision.market, requestedNotionalUsdc, executionKind);
  const filledNotionalUsdc = roundMoney(Math.min(requestedNotionalUsdc, availableNotionalUsdc));
  if (filledNotionalUsdc <= 0) {
    return {
      status: "missed",
      side,
      limitPrice,
      requestedShares,
      requestedNotionalUsdc,
      fillPrice,
      filledShares: 0,
      filledNotionalUsdc: 0,
      reasonCodes: [...reasonCodes, "insufficient_paper_depth"],
      warnings,
      metadata: {
        executionModel: "paper_execution_v1",
        executionKind,
        bestBid,
        bestAsk,
        spreadCents,
        volume24hUsd,
        liquidityUsd,
        snapshotAgeMinutes,
        availableNotionalUsdc
      }
    };
  }

  const status: PaperExecutionStatus =
    filledNotionalUsdc + 0.000001 >= requestedNotionalUsdc ? "filled" : "partial_filled";
  const filledShares = side === "sell_yes" && status === "filled"
    ? requestedShares
    : roundShares(filledNotionalUsdc / Math.max(0.000001, fillPrice));
  if (status === "partial_filled") {
    warnings.push("partial_fill_due_to_depth_limit");
  }
  return {
    status,
    side,
    limitPrice,
    requestedShares,
    requestedNotionalUsdc,
    fillPrice,
    filledShares,
    filledNotionalUsdc,
    reasonCodes,
    warnings,
    metadata: {
      executionModel: "paper_execution_v1",
      executionKind,
      bestBid,
      bestAsk,
      spreadCents,
      volume24hUsd,
      liquidityUsd,
      snapshotAgeMinutes,
      availableNotionalUsdc
    }
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function weighted(parts: Array<[number, number]>): number {
  const denominator = parts.reduce((sum, [, weight]) => sum + weight, 0);
  if (denominator <= 0) {
    return 0;
  }
  return clampScore(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / denominator);
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function hoursBetween(now: Date, endDate: unknown): number | undefined {
  if (typeof endDate !== "string" || !endDate.trim()) {
    return undefined;
  }
  const parsed = Date.parse(endDate);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return (parsed - now.getTime()) / (1000 * 60 * 60);
}

function priceForYes(market: Record<string, unknown>): number | undefined {
  return asNumber(market.bestBid) ?? asNumber(market.midpoint) ?? asNumber(market.impliedProb) ?? asNumber(market.lastTradePrice);
}

function targetPriceForPassiveBuy(market: Record<string, unknown>): number | undefined {
  const bestBid = asNumber(market.bestBid);
  const midpoint = asNumber(market.midpoint);
  const implied = asNumber(market.impliedProb);
  const raw = bestBid ?? midpoint ?? implied;
  if (raw === undefined) {
    return undefined;
  }
  return Math.max(0.001, Math.min(0.99, Number(raw.toFixed(4))));
}

function minForecastEdgeForRiskProfile(riskProfile: AutoTradingRiskProfile): number {
  switch (riskProfile) {
    case "aggressive":
      return 0.02;
    case "balanced":
      return 0.04;
    case "conservative":
      return 0.06;
  }
}

function probabilityFromForecast(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  const probability = numeric > 1 ? numeric / 100 : numeric;
  return probability > 0 && probability < 1 ? Number(probability.toFixed(4)) : undefined;
}

function uncertaintyFromForecast(forecast: Record<string, unknown>): number {
  const raw =
    asNumber(forecast.uncertaintyProbability) ??
    asNumber(forecast.uncertainty) ??
    asNumber(forecast.uncertaintyPct) ??
    0;
  const uncertainty = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(0.5, Number(uncertainty.toFixed(4))));
}

function independentForecastArtifact(market: Record<string, unknown>): Record<string, unknown> | undefined {
  const rawJson = asRecord(market.rawJson);
  return asRecord(rawJson?.independentForecast);
}

function booleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function marketLooksActive(record: Record<string, unknown>): boolean {
  const hasStatusFlag = "active" in record || "closed" in record || "archived" in record;
  if (!hasStatusFlag) {
    return false;
  }
  return booleanFlag(record.active) !== false &&
    booleanFlag(record.closed) !== true &&
    booleanFlag(record.archived) !== true;
}

function hasExclusiveFieldSignal(market: Record<string, unknown>): boolean {
  if (market.structuralType === "multi-outcome-exclusive") {
    return true;
  }
  if (booleanFlag(market.negRisk) === true || asStringArray(market.reasonCodes).includes("neg_risk_cluster")) {
    return true;
  }
  const rawJson = asRecord(market.rawJson);
  const rawGammaEvent = asRecord(rawJson?.rawGammaEvent);
  return booleanFlag(rawGammaEvent?.negRisk) === true || booleanFlag(rawGammaEvent?.enableNegRisk) === true;
}

function inferredExclusiveFieldSize(market: Record<string, unknown>): number | undefined {
  if (!hasExclusiveFieldSignal(market)) {
    return undefined;
  }

  const rawJson = asRecord(market.rawJson);
  const rawGammaEvent = asRecord(rawJson?.rawGammaEvent);
  const eventMarkets = rawGammaEvent?.markets;
  if (Array.isArray(eventMarkets)) {
    const activeMarkets = eventMarkets.filter((value) => {
      const record = asRecord(value);
      return record && marketLooksActive(record);
    });
    if (activeMarkets.length >= 3) {
      return activeMarkets.length;
    }
  }

  if (market.structuralType === "multi-outcome-exclusive") {
    const outcomes = asStringArray(market.outcomes);
    if (outcomes.length >= 3) {
      return outcomes.length;
    }
  }

  return undefined;
}

function evaluateIndependentForecastEdge(
  market: Record<string, unknown>,
  executionPrice: number,
  mandate: AutoTradingMandate,
  now: Date
): { edge?: AutoTradingForecastEdge; blockers: string[]; reasonCodes: string[] } {
  const blockers: string[] = [];
  const reasonCodes: string[] = [];
  const forecast = independentForecastArtifact(market);
  if (!forecast) {
    return {
      blockers: ["missing_independent_forecast"],
      reasonCodes: ["forecast_required_before_price_comparison"]
    };
  }

  const fairProbability = probabilityFromForecast(forecast.probability ?? forecast.fairProbability ?? forecast.pYes);
  if (fairProbability === undefined) {
    blockers.push("invalid_independent_forecast_probability");
  }
  if (forecast.sealed !== true) {
    blockers.push("independent_forecast_not_sealed");
  }
  if (mandate.mode !== "paper" && forecast.method === "screening_forecast_v0") {
    blockers.push("independent_forecast_screening_only");
  }
  const forecastEvidence = asRecord(forecast.evidence);
  if (
    mandate.mode === "paper" &&
    forecast.method === "screening_forecast_v0" &&
    (
      forecastEvidence?.confidenceTier === "screening-low" ||
      inferredExclusiveFieldSize(market) !== undefined
    )
  ) {
    blockers.push("independent_forecast_low_confidence_screening");
    reasonCodes.push("forecast_gate:low_confidence_screening");
    if (typeof forecastEvidence?.confidenceTier === "string") {
      reasonCodes.push(`forecast_confidence_tier:${forecastEvidence.confidenceTier}`);
    }
    const exclusiveFieldSize = inferredExclusiveFieldSize(market);
    if (exclusiveFieldSize !== undefined) {
      reasonCodes.push(`exclusive_group_size:${exclusiveFieldSize}`);
    }
  }
  if (forecast.usesVenuePrice === true || forecast.usesMarketPrice === true || forecast.priceContaminated === true) {
    blockers.push("independent_forecast_price_contaminated");
  }
  if (asStringArray(forecast.numericalChecks).length === 0) {
    blockers.push("independent_forecast_missing_numerical_check");
  }

  const forecastedAt = optionalString(forecast.forecastedAt);
  if (!forecastedAt || !Number.isFinite(Date.parse(forecastedAt))) {
    blockers.push("independent_forecast_missing_forecasted_at");
  } else {
    const ageHours = (now.getTime() - Date.parse(forecastedAt)) / (1000 * 60 * 60);
    if (ageHours < -0.01) {
      blockers.push("independent_forecast_from_future");
    }
    if (ageHours > Math.max(24, mandate.timeframeHours)) {
      blockers.push("independent_forecast_stale");
    }
  }

  const expiresAt = optionalString(forecast.expiresAt);
  if (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now.getTime()) {
    blockers.push("independent_forecast_expired");
  }

  if (fairProbability === undefined) {
    return { blockers, reasonCodes };
  }

  const uncertainty = uncertaintyFromForecast(forecast);
  const spreadPenalty = Math.max(0, (asNumber(market.spreadCents) ?? 0) / 100);
  const rawEdge = Number((fairProbability - executionPrice).toFixed(4));
  const adjustedEdge = Number((rawEdge - uncertainty - spreadPenalty).toFixed(4));
  const minRequiredEdge = minForecastEdgeForRiskProfile(mandate.riskProfile);
  const edge = {
    fairProbability,
    executionPrice,
    uncertainty,
    spreadPenalty,
    rawEdge,
    adjustedEdge,
    minRequiredEdge,
    forecastedAt,
    expiresAt
  } satisfies AutoTradingForecastEdge;

  reasonCodes.push(
    `fair_probability:${fairProbability}`,
    `adjusted_edge:${adjustedEdge}`,
    `min_edge:${minRequiredEdge}`
  );
  if (adjustedEdge < minRequiredEdge) {
    blockers.push("forecast_edge_below_minimum");
  }

  return { edge, blockers, reasonCodes };
}

function horizonFitScore(hoursToEnd: number | undefined, mandate: AutoTradingMandate): number {
  if (hoursToEnd === undefined) {
    return 0;
  }
  if (hoursToEnd <= 0) {
    return 0;
  }
  if (hoursToEnd <= mandate.timeframeHours) {
    return 100;
  }
  if (hoursToEnd <= mandate.maxMarketHorizonHours) {
    const extraWindow = Math.max(1, mandate.maxMarketHorizonHours - mandate.timeframeHours);
    return clampScore(80 - ((hoursToEnd - mandate.timeframeHours) / extraWindow) * 35);
  }
  return 0;
}

export function normalizeAutoTradingMandate(input: AutoTradingMandateInput): AutoTradingMandate {
  const defaults = RISK_DEFAULTS[input.riskProfile];
  const budgetUsdc = Math.max(1, Number(input.budgetUsdc));
  const timeframeHours = Math.max(1, Number(input.timeframeHours));
  const maxSingleOrderUsdc = Math.max(
    1,
    Math.min(budgetUsdc, input.maxSingleOrderUsdc ?? budgetUsdc * defaults.maxSingleOrderBudgetFraction)
  );
  const minOrderUsdc = Math.max(0.01, Math.min(maxSingleOrderUsdc, input.minOrderUsdc ?? defaults.minOrderUsdc));
  return {
    name: input.name,
    budgetUsdc,
    timeframeHours,
    riskProfile: input.riskProfile,
    mode: input.mode ?? "paper",
    maxSingleOrderUsdc,
    minOrderUsdc,
    maxOpenPositions: Math.max(1, Math.min(50, input.maxOpenPositions ?? defaults.maxOpenPositions)),
    maxEventPositions: Math.max(1, Math.min(10, input.maxEventPositions ?? defaults.maxEventPositions)),
    maxEventExposureUsdc: Math.max(
      1,
      Math.min(budgetUsdc, input.maxEventExposureUsdc ?? budgetUsdc * defaults.maxEventExposureBudgetFraction)
    ),
    maxMarketHorizonHours: Math.max(
      timeframeHours,
      input.maxMarketHorizonHours ?? timeframeHours * defaults.maxMarketHorizonMultiplier
    ),
    minMarketHoursToEnd: Math.max(0, input.minMarketHoursToEnd ?? defaults.minMarketHoursToEnd),
    minLiquidityUsdc: Math.max(0, input.minLiquidityUsdc ?? defaults.minLiquidityUsdc),
    maxSpreadCents: Math.max(0.1, input.maxSpreadCents ?? defaults.maxSpreadCents),
    minTradabilityScore: Math.max(0, Math.min(100, input.minTradabilityScore ?? defaults.minTradabilityScore)),
    minResearchPriorityScore: Math.max(0, Math.min(100, input.minResearchPriorityScore ?? defaults.minResearchPriorityScore)),
    maxResolutionAmbiguityScore: Math.max(0, Math.min(100, input.maxResolutionAmbiguityScore ?? defaults.maxResolutionAmbiguityScore)),
    stopLossUsdc: Math.max(0, input.stopLossUsdc ?? budgetUsdc * defaults.stopLossBudgetFraction),
    takeProfitPct: Math.max(1, input.takeProfitPct ?? defaults.takeProfitPct),
    positionStopLossPct: Math.max(1, input.positionStopLossPct ?? defaults.positionStopLossPct),
    positionStopLossGraceMinutes: Math.max(0, input.positionStopLossGraceMinutes ?? defaults.positionStopLossGraceMinutes),
    paperReentryCooldownMinutes: Math.max(0, input.paperReentryCooldownMinutes ?? defaults.paperReentryCooldownMinutes),
    timeExitHours: Math.max(0, input.timeExitHours ?? defaults.timeExitHours),
    heartbeatMinutes: Math.max(5, input.heartbeatMinutes ?? defaults.heartbeatMinutes),
    allowedCategoryGroups: input.allowedCategoryGroups ?? [],
    blockedCategoryGroups: input.blockedCategoryGroups ?? [],
    allowedOpportunityModes: input.allowedOpportunityModes ?? [
      "execution-ready",
      "deep-research",
      "resolution-watch",
      "market-making",
      "cross-market-check"
    ],
    includeLongshots: input.includeLongshots ?? defaults.includeLongshots
  };
}

function marketBlockers(market: Record<string, unknown>, mandate: AutoTradingMandate, now: Date): string[] {
  const blockers: string[] = [];
  const hoursToEnd = hoursBetween(now, market.endDate);
  const categoryGroup = typeof market.categoryGroup === "string" ? market.categoryGroup : undefined;
  const opportunityMode = typeof market.opportunityMode === "string" ? market.opportunityMode : undefined;
  const impliedProb = asNumber(market.impliedProb);

  if (market.active === false || market.closed === true || market.acceptingOrders === false) {
    blockers.push("market_not_tradeable");
  }
  if (hoursToEnd === undefined) {
    blockers.push("missing_or_invalid_end_date");
  } else {
    if (hoursToEnd <= 0) {
      blockers.push("market_already_ended");
    }
    if (hoursToEnd < mandate.minMarketHoursToEnd) {
      blockers.push("too_close_to_resolution_for_risk_profile");
    }
    if (hoursToEnd > mandate.maxMarketHorizonHours) {
      blockers.push("outside_session_timeframe");
    }
  }
  if (mandate.allowedCategoryGroups.length > 0 && categoryGroup && !mandate.allowedCategoryGroups.includes(categoryGroup)) {
    blockers.push("category_not_allowed");
  }
  if (categoryGroup && mandate.blockedCategoryGroups.includes(categoryGroup)) {
    blockers.push("category_blocked");
  }
  if (opportunityMode && !mandate.allowedOpportunityModes.includes(opportunityMode)) {
    blockers.push("opportunity_mode_not_allowed");
  }
  if ((asNumber(market.liquidityUsd) ?? 0) < mandate.minLiquidityUsdc) {
    blockers.push("liquidity_below_mandate");
  }
  if ((asNumber(market.spreadCents) ?? 999) > mandate.maxSpreadCents) {
    blockers.push("spread_above_mandate");
  }
  if ((asNumber(market.tradabilityScore) ?? 0) < mandate.minTradabilityScore) {
    blockers.push("tradability_below_mandate");
  }
  if ((asNumber(market.researchPriorityScore) ?? 0) < mandate.minResearchPriorityScore) {
    blockers.push("research_priority_below_mandate");
  }
  if ((asNumber(market.resolutionAmbiguityScore) ?? 100) > mandate.maxResolutionAmbiguityScore) {
    blockers.push("resolution_ambiguity_above_mandate");
  }
  if (!mandate.includeLongshots && impliedProb !== undefined && impliedProb < 0.1) {
    blockers.push("longshot_blocked_by_risk_profile");
  }
  if (!market.yesTokenId && !asStringArray(market.clobTokenIds).at(0)) {
    blockers.push("missing_yes_token");
  }
  for (const disqualifier of asStringArray(market.disqualifiers)) {
    blockers.push(`disqualified:${disqualifier}`);
  }
  return blockers;
}

function scoreMarket(market: Record<string, unknown>, mandate: AutoTradingMandate, now: Date): number {
  const hoursToEnd = hoursBetween(now, market.endDate);
  const impliedProb = asNumber(market.impliedProb);
  const longshotBonus =
    mandate.includeLongshots && impliedProb !== undefined && impliedProb >= 0.02 && impliedProb <= 0.30
      ? mandate.riskProfile === "aggressive" ? 10 : 4
      : 0;
  const riskPenalty = (asNumber(market.riskScore) ?? 50) * (mandate.riskProfile === "conservative" ? 0.24 : 0.14);
  return clampScore(
    weighted([
      [asNumber(market.tradeOpportunityScore) ?? 0, 0.26],
      [asNumber(market.researchPriorityScore) ?? 0, 0.22],
      [asNumber(market.tradabilityScore) ?? 0, 0.20],
      [asNumber(market.catalystScore) ?? 0, 0.14],
      [horizonFitScore(hoursToEnd, mandate), 0.18]
    ]) + longshotBonus - riskPenalty
  );
}

function nextCheckForDecision(decision: AutoTradingDecision, mandate: AutoTradingMandate, now: Date): string {
  const hoursToEnd = hoursBetween(now, decision.market.endDate);
  const baseMinutes = isEntryAction(decision.action) || isExitAction(decision.action)
    ? Math.max(5, Math.floor(mandate.heartbeatMinutes / 2))
    : mandate.heartbeatMinutes;
  if (hoursToEnd !== undefined && hoursToEnd < 6) {
    return addMinutes(now, Math.min(baseMinutes, 10));
  }
  return addMinutes(now, baseMinutes);
}

function eventIdentity(market: Record<string, unknown>): string {
  for (const key of ["eventSlug", "eventId", "seriesSlug", "marketKey", "conditionId", "slug", "title"]) {
    const value = market[key];
    if (typeof value === "string" && value.trim()) {
      return `${key}:${value}`;
    }
  }
  return marketIdentity(market);
}

function positionEventIdentity(position: { marketKey: string; metadata: Record<string, unknown> }): string {
  const eventKey = position.metadata.eventKey;
  return typeof eventKey === "string" && eventKey.trim() ? eventKey : `marketKey:${position.marketKey}`;
}

function hoursUntil(now: Date, isoValue: unknown): number | undefined {
  if (typeof isoValue !== "string" || !isoValue.trim()) {
    return undefined;
  }
  const parsed = Date.parse(isoValue);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return (parsed - now.getTime()) / (1000 * 60 * 60);
}

function hoursSince(now: Date, isoValue: unknown): number | undefined {
  if (typeof isoValue !== "string" || !isoValue.trim()) {
    return undefined;
  }
  const parsed = Date.parse(isoValue);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return (now.getTime() - parsed) / (1000 * 60 * 60);
}

function buildPaperExitDecisions(
  ledger: StoredPaperTradingLedger,
  mandate: AutoTradingMandate,
  session: StoredAutoTradingSessionRecord,
  now: Date
): AutoTradingDecision[] {
  return ledger.positions
    .filter((position) => position.status === "open")
    .map((position) => {
      const currentPrice = position.currentPrice;
      const currentValueUsdc = position.currentValueUsdc ?? (
        currentPrice === undefined ? undefined : position.shares * currentPrice
      );
      const unrealizedPnlPct = position.unrealizedPnlPct ?? 0;
      const hoursToMarketEnd = hoursUntil(now, position.metadata.endDate);
      const hoursToSessionEnd = hoursUntil(now, session.endsAt);
      const positionAgeMinutes = (hoursSince(now, position.openedAt) ?? Number.POSITIVE_INFINITY) * 60;
      const stopLossGraceActive =
        positionAgeMinutes < mandate.positionStopLossGraceMinutes &&
        unrealizedPnlPct > -mandate.positionStopLossPct * 2;
      const reasonCodes: string[] = [];
      const blockers: string[] = [];

      if (currentPrice === undefined || currentValueUsdc === undefined) {
        blockers.push("missing_position_mark");
      }
      if (unrealizedPnlPct >= mandate.takeProfitPct) {
        reasonCodes.push("take_profit");
      }
      if (unrealizedPnlPct <= -mandate.positionStopLossPct && !stopLossGraceActive) {
        reasonCodes.push("position_stop_loss");
      }
      if (hoursToMarketEnd !== undefined && hoursToMarketEnd <= mandate.timeExitHours) {
        reasonCodes.push("time_exit_market_near_resolution");
      }
      if (hoursToSessionEnd !== undefined && hoursToSessionEnd <= mandate.timeExitHours) {
        reasonCodes.push("time_exit_session_near_end");
      }

      const shouldExit = reasonCodes.length > 0 && blockers.length === 0;
      const market = {
        marketKey: position.marketKey,
        title: position.title,
        eventKey: position.metadata.eventKey,
        endDate: position.metadata.endDate,
        currentPrice,
        averagePrice: position.averagePrice,
        shares: position.shares,
        unrealizedPnlPct,
        unrealizedPnlUsdc: position.unrealizedPnlUsdc
      };
      const decision = {
        marketKey: position.marketKey,
        title: position.title,
        action: shouldExit ? exitActionForMode(mandate.mode) : "monitor",
        status: shouldExit ? "proposed" : "watch",
        score: shouldExit ? 100 : 0,
        allocatedBudgetUsdc: shouldExit ? roundMoney(currentValueUsdc as number) : undefined,
        targetPrice: shouldExit ? currentPrice : undefined,
        shares: shouldExit ? position.shares : undefined,
        tokenId: typeof position.metadata.tokenId === "string" ? position.metadata.tokenId : undefined,
        reasonCodes: shouldExit ? reasonCodes : ["position_monitor"],
        blockers,
        market
      } satisfies AutoTradingDecision;
      return {
        ...decision,
        nextCheckAt: nextCheckForDecision(decision, mandate, now)
      };
    })
    .filter((decision) => isExitAction(decision.action));
}

function recentPaperReentryBlocker(
  market: Record<string, unknown>,
  ledger: StoredPaperTradingLedger,
  mandate: AutoTradingMandate,
  now: Date
): string | undefined {
  if (mandate.mode !== "paper" || mandate.paperReentryCooldownMinutes <= 0) {
    return undefined;
  }
  const marketKey = typeof market.marketKey === "string" ? market.marketKey : undefined;
  if (!marketKey) {
    return undefined;
  }
  const recentExit = ledger.positions
    .filter((position) => position.status === "closed" && position.marketKey === marketKey && position.closedAt)
    .sort((left, right) => Date.parse(right.closedAt ?? "") - Date.parse(left.closedAt ?? ""))
    .at(0);
  if (!recentExit?.closedAt) {
    return undefined;
  }
  const minutesSinceExit = (hoursSince(now, recentExit.closedAt) ?? Number.POSITIVE_INFINITY) * 60;
  if (minutesSinceExit > mandate.paperReentryCooldownMinutes) {
    return undefined;
  }
  const exitReasonCodes = asStringArray(recentExit.metadata.exitReasonCodes);
  return exitReasonCodes.includes("position_stop_loss")
    ? "paper_recent_stop_loss_reentry_cooldown"
    : "paper_recent_exit_reentry_cooldown";
}

function budgetRotationEdgeThreshold(riskProfile: AutoTradingRiskProfile): number {
  switch (riskProfile) {
    case "aggressive":
      return 8;
    case "balanced":
      return 12;
    case "conservative":
      return 18;
  }
}

function eventRotationEdgeThreshold(riskProfile: AutoTradingRiskProfile): number {
  switch (riskProfile) {
    case "aggressive":
      return 5;
    case "balanced":
      return 8;
    case "conservative":
      return 12;
  }
}

function paperPositionEntryScore(position: StoredPaperTradingLedger["positions"][number]): number {
  return asNumber(position.metadata.score) ?? 0;
}

function paperPositionRotationRank(position: StoredPaperTradingLedger["positions"][number]): number {
  const pnlPct = position.unrealizedPnlPct ?? 0;
  return paperPositionEntryScore(position) + pnlPct * 0.25;
}

function buildPaperRotationExitDecision(
  position: StoredPaperTradingLedger["positions"][number],
  mandate: AutoTradingMandate,
  now: Date,
  rotationReasonCode: string,
  rotationCandidate: AutoTradingDecision,
  entryScore: number,
  scoreEdge: number
): AutoTradingDecision {
  const market = {
    marketKey: position.marketKey,
    title: position.title,
    eventKey: position.metadata.eventKey,
    endDate: position.metadata.endDate,
    currentPrice: position.currentPrice,
    averagePrice: position.averagePrice,
    shares: position.shares,
    unrealizedPnlPct: position.unrealizedPnlPct,
    unrealizedPnlUsdc: position.unrealizedPnlUsdc,
    rotationCandidate: {
      marketKey: rotationCandidate.marketKey,
      title: rotationCandidate.title,
      score: rotationCandidate.score,
      targetPrice: rotationCandidate.targetPrice,
      eventSlug: rotationCandidate.market.eventSlug
    }
  };
  const decision = {
    marketKey: position.marketKey,
    title: position.title,
    action: exitActionForMode(mandate.mode),
    status: "proposed" as const,
    score: clampScore(80 + scoreEdge),
    allocatedBudgetUsdc: roundMoney(position.currentValueUsdc as number),
    targetPrice: position.currentPrice,
    shares: position.shares,
    tokenId: typeof position.metadata.tokenId === "string" ? position.metadata.tokenId : undefined,
    reasonCodes: [
      rotationReasonCode,
      `candidate_score:${rotationCandidate.score}`,
      `position_score:${Number(entryScore.toFixed(2))}`
    ],
    blockers: [],
    market
  } satisfies AutoTradingDecision;

  return {
    ...decision,
    nextCheckAt: nextCheckForDecision(decision, mandate, now)
  };
}

function weakPositionScoreSlack(riskProfile: AutoTradingRiskProfile): number {
  switch (riskProfile) {
    case "aggressive":
      return 6;
    case "balanced":
      return 10;
    case "conservative":
      return 14;
  }
}

function buildPaperHygieneExitDecisions(
  ledger: StoredPaperTradingLedger,
  mandate: AutoTradingMandate,
  now: Date,
  candidates: AutoTradingDecision[],
  existingExitMarketKeys: Set<string>
): AutoTradingDecision[] {
  if (mandate.mode !== "paper") {
    return [];
  }

  const capitalConstrained =
    ledger.summary.remainingBudgetUsdc < mandate.minOrderUsdc ||
    ledger.summary.openPositionCount >= mandate.maxOpenPositions ||
    candidates.some((candidate) => candidate.blockers.includes("budget_exhausted"));
  const proposalThreshold = RISK_DEFAULTS[mandate.riskProfile].proposalThreshold;
  const weakScoreCutoff = proposalThreshold - weakPositionScoreSlack(mandate.riskProfile);

  return ledger.positions
    .filter((position) =>
      position.status === "open" &&
      !existingExitMarketKeys.has(position.marketKey) &&
      position.currentPrice !== undefined &&
      position.currentValueUsdc !== undefined &&
      position.shares > 0
    )
    .map((position) => {
      const entryScore = paperPositionEntryScore(position);
      const currentValueUsdc = position.currentValueUsdc as number;
      const reasonCodes: string[] = [];
      if (currentValueUsdc < mandate.minOrderUsdc) {
        reasonCodes.push("paper_hygiene_dust_position");
      } else if (
        capitalConstrained &&
        entryScore < weakScoreCutoff &&
        (position.unrealizedPnlPct ?? 0) <= 0
      ) {
        reasonCodes.push("paper_hygiene_weak_losing_position");
      }
      return { position, entryScore, reasonCodes };
    })
    .filter((entry) => entry.reasonCodes.length > 0)
    .sort((left, right) => {
      const dustDelta = (left.position.currentValueUsdc as number) - (right.position.currentValueUsdc as number);
      if (left.reasonCodes.includes("paper_hygiene_dust_position") || right.reasonCodes.includes("paper_hygiene_dust_position")) {
        return dustDelta;
      }
      const rankDelta = paperPositionRotationRank(left.position) - paperPositionRotationRank(right.position);
      return rankDelta !== 0 ? rankDelta : dustDelta;
    })
    .slice(0, 2)
    .map(({ position, entryScore, reasonCodes }) => {
      const market = {
        marketKey: position.marketKey,
        title: position.title,
        eventKey: position.metadata.eventKey,
        endDate: position.metadata.endDate,
        currentPrice: position.currentPrice,
        averagePrice: position.averagePrice,
        shares: position.shares,
        currentValueUsdc: position.currentValueUsdc,
        unrealizedPnlPct: position.unrealizedPnlPct,
        unrealizedPnlUsdc: position.unrealizedPnlUsdc
      };
      const decision = {
        marketKey: position.marketKey,
        title: position.title,
        action: exitActionForMode(mandate.mode),
        status: "proposed" as const,
        score: reasonCodes.includes("paper_hygiene_dust_position") ? 95 : 70,
        allocatedBudgetUsdc: roundMoney(position.currentValueUsdc as number),
        targetPrice: position.currentPrice,
        shares: position.shares,
        tokenId: typeof position.metadata.tokenId === "string" ? position.metadata.tokenId : undefined,
        reasonCodes: [
          "paper_position_hygiene",
          ...reasonCodes,
          `position_score:${Number(entryScore.toFixed(2))}`
        ],
        blockers: [],
        market
      } satisfies AutoTradingDecision;

      return {
        ...decision,
        nextCheckAt: nextCheckForDecision(decision, mandate, now)
      };
    });
}

function buildBudgetRotationExitDecisions(
  ledger: StoredPaperTradingLedger,
  mandate: AutoTradingMandate,
  session: StoredAutoTradingSessionRecord,
  now: Date,
  candidates: AutoTradingDecision[],
  existingExitMarketKeys: Set<string>
): AutoTradingDecision[] {
  if (mandate.mode !== "paper" || ledger.summary.remainingBudgetUsdc > 0.01) {
    return [];
  }

  const strongestBudgetBlockedCandidate = candidates
    .filter((candidate) =>
      candidate.status === "watch" &&
      candidate.blockers.includes("budget_exhausted") &&
      candidate.score >= RISK_DEFAULTS[mandate.riskProfile].proposalThreshold
    )
    .sort((left, right) => right.score - left.score)[0];
  if (!strongestBudgetBlockedCandidate) {
    return [];
  }

  const threshold = budgetRotationEdgeThreshold(mandate.riskProfile);
  const weakestPosition = ledger.positions
    .filter((position) =>
      position.status === "open" &&
      !existingExitMarketKeys.has(position.marketKey) &&
      position.currentPrice !== undefined &&
      position.currentValueUsdc !== undefined &&
      position.shares > 0
    )
    .map((position) => {
      const entryScore = paperPositionEntryScore(position);
      const scoreEdge = strongestBudgetBlockedCandidate.score - entryScore;
      const lossAssistedThreshold = (position.unrealizedPnlPct ?? 0) < 0 ? threshold / 2 : threshold;
      return { position, entryScore, scoreEdge, lossAssistedThreshold };
    })
    .filter((entry) => entry.scoreEdge >= entry.lossAssistedThreshold)
    .sort((left, right) => {
      const rankDelta = paperPositionRotationRank(left.position) - paperPositionRotationRank(right.position);
      return rankDelta !== 0 ? rankDelta : right.scoreEdge - left.scoreEdge;
    })[0];
  if (!weakestPosition) {
    return [];
  }

  return [buildPaperRotationExitDecision(
    weakestPosition.position,
    mandate,
    now,
    "budget_rotation",
    strongestBudgetBlockedCandidate,
    weakestPosition.entryScore,
    weakestPosition.scoreEdge
  )];
}

function buildEventRotationExitDecisions(
  ledger: StoredPaperTradingLedger,
  mandate: AutoTradingMandate,
  session: StoredAutoTradingSessionRecord,
  now: Date,
  candidates: AutoTradingDecision[],
  existingExitMarketKeys: Set<string>
): AutoTradingDecision[] {
  if (mandate.mode !== "paper") {
    return [];
  }

  const threshold = eventRotationEdgeThreshold(mandate.riskProfile);
  for (const candidate of candidates
    .filter((entry) =>
      entry.status === "watch" &&
      (entry.blockers.includes("event_position_cap_reached") || entry.blockers.includes("event_exposure_cap_reached")) &&
      entry.score >= RISK_DEFAULTS[mandate.riskProfile].proposalThreshold
    )
    .sort((left, right) => right.score - left.score)) {
    const candidateEventKey = eventIdentity(candidate.market);
    const weakestSameEventPosition = ledger.positions
      .filter((position) =>
        position.status === "open" &&
        position.marketKey !== candidate.marketKey &&
        positionEventIdentity(position) === candidateEventKey &&
        !existingExitMarketKeys.has(position.marketKey) &&
        position.currentPrice !== undefined &&
        position.currentValueUsdc !== undefined &&
        position.shares > 0
      )
      .map((position) => {
        const entryScore = paperPositionEntryScore(position);
        const scoreEdge = candidate.score - entryScore;
        return { position, entryScore, scoreEdge };
      })
      .filter((entry) => entry.scoreEdge >= threshold)
      .sort((left, right) => {
        const rankDelta = paperPositionRotationRank(left.position) - paperPositionRotationRank(right.position);
        return rankDelta !== 0 ? rankDelta : right.scoreEdge - left.scoreEdge;
      })[0];

    if (weakestSameEventPosition) {
      return [buildPaperRotationExitDecision(
        weakestSameEventPosition.position,
        mandate,
        now,
        "event_rotation",
        candidate,
        weakestSameEventPosition.entryScore,
        weakestSameEventPosition.scoreEdge
      )];
    }
  }

  return [];
}

function marketIdentity(market: Record<string, unknown>): string {
  for (const key of ["marketKey", "conditionId", "slug", "title"]) {
    const value = market[key];
    if (typeof value === "string" && value.trim()) {
      return `${key}:${value}`;
    }
  }
  return JSON.stringify(market);
}

function mergeMarketPools(pools: Array<Array<Record<string, unknown>>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const pool of pools) {
    for (const market of pool) {
      const identity = marketIdentity(market);
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      merged.push(market);
    }
  }
  return merged;
}

function listUniverseMarketsPaged(
  store: StateStore,
  filters: Parameters<StateStore["listUniverseMarkets"]>[0],
  totalLimit: number
): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  const pageSize = 500;
  const maxRows = Math.max(1, Math.min(5_000, totalLimit));
  for (let offset = 0; output.length < maxRows; offset += pageSize) {
    const page = store.listUniverseMarkets({
      ...filters,
      limit: Math.min(pageSize, maxRows - output.length),
      offset
    }).markets;
    output.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }
  return output;
}

function createSession(store: StateStore, mandate: AutoTradingMandate, now: Date): StoredAutoTradingSessionRecord {
  return store.createAutoTradingSession({
    name: mandate.name,
    status: "active",
    mode: mandate.mode,
    riskProfile: mandate.riskProfile,
    budgetUsdc: mandate.budgetUsdc,
    timeframeHours: mandate.timeframeHours,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + mandate.timeframeHours * 60 * 60 * 1000).toISOString(),
    heartbeatMinutes: mandate.heartbeatMinutes,
    mandate: { ...mandate },
    constraints: {
      maxSingleOrderUsdc: mandate.maxSingleOrderUsdc,
      minOrderUsdc: mandate.minOrderUsdc,
      maxOpenPositions: mandate.maxOpenPositions,
      maxEventPositions: mandate.maxEventPositions,
      maxEventExposureUsdc: mandate.maxEventExposureUsdc,
      maxMarketHorizonHours: mandate.maxMarketHorizonHours,
      minLiquidityUsdc: mandate.minLiquidityUsdc,
      maxSpreadCents: mandate.maxSpreadCents,
      stopLossUsdc: mandate.stopLossUsdc,
      takeProfitPct: mandate.takeProfitPct,
      positionStopLossPct: mandate.positionStopLossPct,
      positionStopLossGraceMinutes: mandate.positionStopLossGraceMinutes,
      paperReentryCooldownMinutes: mandate.paperReentryCooldownMinutes,
      timeExitHours: mandate.timeExitHours
    },
    metadata: {
      implementationStage: "paper-planner",
      liveSubmissionEnabled: false
    }
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function blockerCounts(decisions: AutoTradingDecision[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    for (const blocker of decision.blockers) {
      counts[blocker] = (counts[blocker] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  );
}

export function compactAutoTradingDecision(decision: AutoTradingDecision): CompactAutoTradingDecision {
  return {
    marketKey: decision.marketKey,
    title: decision.title,
    action: decision.action,
    status: decision.status,
    score: decision.score,
    allocatedBudgetUsdc: decision.allocatedBudgetUsdc,
    targetPrice: decision.targetPrice,
    shares: decision.shares,
    tokenId: decision.tokenId,
    nextCheckAt: decision.nextCheckAt,
    reasonCodes: decision.reasonCodes,
    blockers: decision.blockers,
    forecastEdge: decision.forecastEdge,
    market: Object.keys(decision.market).length > 0
      ? {
        eventTitle: optionalString(decision.market.eventTitle),
        eventSlug: optionalString(decision.market.eventSlug),
        categoryGroup: optionalString(decision.market.categoryGroup),
        structuralType: optionalString(decision.market.structuralType),
        opportunityMode: optionalString(decision.market.opportunityMode),
        horizonBucket: optionalString(decision.market.horizonBucket),
        priceBucket: optionalString(decision.market.priceBucket),
        liquidityUsd: asNumber(decision.market.liquidityUsd),
        volume24hUsd: asNumber(decision.market.volume24hUsd),
        impliedProb: asNumber(decision.market.impliedProb),
        bestBid: asNumber(decision.market.bestBid),
        bestAsk: asNumber(decision.market.bestAsk),
        spreadCents: asNumber(decision.market.spreadCents),
        endDate: optionalString(decision.market.endDate),
        active: optionalBoolean(decision.market.active),
        closed: optionalBoolean(decision.market.closed),
        restricted: optionalBoolean(decision.market.restricted),
        acceptingOrders: optionalBoolean(decision.market.acceptingOrders),
        disqualifiers: asStringArray(decision.market.disqualifiers)
      }
      : undefined
  };
}

export function compactAutoTradingIterationResult(
  result: AutoTradingIterationResult
): CompactAutoTradingIterationResult {
  return {
    session: {
      sessionId: result.session.sessionId,
      status: result.session.status,
      mode: result.session.mode,
      riskProfile: result.session.riskProfile,
      budgetUsdc: result.session.budgetUsdc,
      timeframeHours: result.session.timeframeHours,
      startedAt: result.session.startedAt,
      endsAt: result.session.endsAt,
      heartbeatMinutes: result.session.heartbeatMinutes
    },
    iterationId: result.iterationId,
    generatedAt: result.generatedAt,
    runId: result.runId,
    summary: result.summary,
    mandate: {
      riskProfile: result.mandate.riskProfile,
      mode: result.mandate.mode,
      budgetUsdc: result.mandate.budgetUsdc,
      timeframeHours: result.mandate.timeframeHours,
      maxSingleOrderUsdc: result.mandate.maxSingleOrderUsdc,
      minOrderUsdc: result.mandate.minOrderUsdc,
      maxOpenPositions: result.mandate.maxOpenPositions,
      maxEventPositions: result.mandate.maxEventPositions,
      maxEventExposureUsdc: result.mandate.maxEventExposureUsdc,
      maxMarketHorizonHours: result.mandate.maxMarketHorizonHours,
      minLiquidityUsdc: result.mandate.minLiquidityUsdc,
      maxSpreadCents: result.mandate.maxSpreadCents,
      takeProfitPct: result.mandate.takeProfitPct,
      positionStopLossPct: result.mandate.positionStopLossPct,
      positionStopLossGraceMinutes: result.mandate.positionStopLossGraceMinutes,
      paperReentryCooldownMinutes: result.mandate.paperReentryCooldownMinutes,
      timeExitHours: result.mandate.timeExitHours,
      heartbeatMinutes: result.mandate.heartbeatMinutes
    },
    candidates: result.candidates.map(compactAutoTradingDecision)
  };
}

export function buildAutoTradingExecutionGate(
  session: StoredAutoTradingSessionRecord,
  decision: StoredAutoTradingDecisionRecord
): AutoTradingExecutionGate {
  const mode = session.mode as AutoTradingMode;
  const action = decision.action as AutoTradingAction;
  const blockers: string[] = [];
  const side = actionSide(action);
  const tokenId = typeof decision.payload.tokenId === "string" ? decision.payload.tokenId : undefined;
  const shares = asNumber(decision.payload.shares);
  const price = decision.targetPrice;

  if (mode === "paper") {
    blockers.push("paper_session_no_live_execution");
  }
  if (!side) {
    blockers.push("decision_not_executable");
  }
  if (decision.status !== "proposed") {
    blockers.push("decision_not_proposed");
  }
  if (!tokenId) {
    blockers.push("missing_token_id");
  }
  if (price === undefined || price <= 0 || price > 1) {
    blockers.push("missing_or_invalid_price");
  }
  if (shares === undefined || shares <= 0) {
    blockers.push("missing_or_invalid_shares");
  }
  if (decision.blockers.length > 0) {
    blockers.push("decision_has_blockers");
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  const canPreview = uniqueBlockers.length === 0;
  const previewRequest = canPreview
    ? {
      sessionId: session.sessionId,
      decisionId: decision.decisionId,
      mode,
      action,
      tokenId: tokenId as string,
      side: side as "BUY" | "SELL",
      price: price as number,
      size: shares as number,
      orderType: "GTC" as const,
      postOnly: true,
      clientOrderId: `autotrader:${session.sessionId}:${decision.decisionId}`.slice(0, 128),
      notionalUsdc: roundMoney((price as number) * (shares as number))
    }
    : undefined;

  return {
    decisionId: decision.decisionId,
    mode,
    canPreview,
    canSubmitAutonomously: canPreview && mode === "live_autonomous",
    requiresApproval: canPreview && mode === "live_guarded",
    blockers: uniqueBlockers,
    previewRequest
  };
}

export function runAutoTradingIteration(
  store: StateStore,
  args: {
    sessionId?: string;
    mandate?: AutoTradingMandateInput;
    now?: Date;
    limit?: number;
    persist?: boolean;
  }
): AutoTradingIterationResult {
  const now = args.now ?? new Date();
  const existing = args.sessionId ? store.getAutoTradingSession(args.sessionId) : undefined;
  if (!existing && !args.mandate) {
    throw new Error("Either sessionId or mandate is required.");
  }

  const mandate = existing
    ? normalizeAutoTradingMandate(existing.mandate as unknown as AutoTradingMandateInput)
    : normalizeAutoTradingMandate(args.mandate as AutoTradingMandateInput);
  const session = existing ?? createSession(store, mandate, now);
  store.markPaperTradingPositions(session.sessionId, undefined, now.toISOString());
  let ledger = store.getPaperTradingLedger(session.sessionId);
  let exitDecisions = mandate.mode === "paper"
    ? buildPaperExitDecisions(ledger, mandate, session, now)
    : [];
  const riskBlockedNewBuys = ledger.summary.totalPnlUsdc <= -mandate.stopLossUsdc;
  const iterationId = randomUUID();
  const latestRun = store.getLatestUniverseRun();
  const runId = typeof latestRun?.runId === "string" ? latestRun.runId : "";
  const persist = args.persist ?? true;
  const limit = Math.max(1, Math.min(100, args.limit ?? mandate.maxOpenPositions * 4));

  if (!runId) {
    const decision = {
      action: "skip" as const,
      status: "blocked" as const,
      score: 0,
      reasonCodes: [],
      blockers: ["missing_universe_run"],
      market: {}
    } satisfies AutoTradingDecision;
    const stored = persist
      ? [store.recordAutoTradingDecision({
        sessionId: session.sessionId,
        iterationId,
        action: decision.action,
        status: decision.status,
        score: decision.score,
        reasonCodes: decision.reasonCodes,
        blockers: decision.blockers,
        payload: { decision }
      })]
      : [];
    return {
      session,
      iterationId,
      generatedAt: now.toISOString(),
      runId,
      mandate,
      summary: {
        mode: mandate.mode,
        riskProfile: mandate.riskProfile,
        budgetUsdc: mandate.budgetUsdc,
        spentUsdc: ledger.summary.spentUsdc,
        positionValueUsdc: ledger.summary.positionValueUsdc,
        unrealizedPnlUsdc: ledger.summary.unrealizedPnlUsdc,
        realizedPnlUsdc: ledger.summary.realizedPnlUsdc,
        totalPnlUsdc: ledger.summary.totalPnlUsdc,
        portfolioValueUsdc: ledger.summary.portfolioValueUsdc,
        openPositions: ledger.summary.openPositionCount,
        proposedBudgetUsdc: 0,
        remainingBudgetUsdc: ledger.summary.remainingBudgetUsdc,
        eligibleMarkets: 0,
        proposedOrders: 0,
        exitOrders: 0,
        researchRequired: 0,
        blocked: 1,
        blockerCounts: blockerCounts([decision]),
        riskBlockedNewBuys,
        nextRunAt: addMinutes(now, mandate.heartbeatMinutes)
      },
      decisions: stored,
      ledger,
      candidates: [decision]
    };
  }

  const candidatePoolLimit = Math.max(250, limit * 20);
  const horizonPoolLimit = Math.max(1_000, limit * 80);
  const baseUniverseFilters = {
    runId,
    minLiquidityUsdc: Math.max(0, mandate.minLiquidityUsdc * 0.5),
    maxSpreadCents: Math.max(mandate.maxSpreadCents, mandate.maxSpreadCents + 2),
    limit: candidatePoolLimit
  } as const;
  const rawMarkets = mergeMarketPools([
    listUniverseMarketsPaged(store, {
      ...baseUniverseFilters,
      sort: "trade_opportunity_desc"
    }, candidatePoolLimit),
    listUniverseMarketsPaged(store, {
      ...baseUniverseFilters,
      sort: "ending_soon"
    }, horizonPoolLimit),
    listUniverseMarketsPaged(store, {
      ...baseUniverseFilters,
      sort: "volume_24h_desc"
    }, candidatePoolLimit)
  ]);

  let remainingBudget = ledger.summary.remainingBudgetUsdc;
  const eventExposureUsdc = new Map<string, number>();
  const eventPositionCount = new Map<string, number>();
  for (const position of ledger.positions.filter((entry) => entry.status === "open")) {
    const eventKey = positionEventIdentity(position);
    eventExposureUsdc.set(eventKey, (eventExposureUsdc.get(eventKey) ?? 0) + position.costUsdc);
    eventPositionCount.set(eventKey, (eventPositionCount.get(eventKey) ?? 0) + 1);
  }
  const scoredRawMarkets = rawMarkets
    .map((market) => ({ market, score: scoreMarket(market, mandate, now) }))
    .sort((left, right) => right.score - left.score);
  const decisions: AutoTradingDecision[] = scoredRawMarkets
    .map(({ market, score }) => {
      const blockers = marketBlockers(market, mandate, now);
      const targetPrice = targetPriceForPassiveBuy(market);
      const tokenId = typeof market.yesTokenId === "string" ? market.yesTokenId : asStringArray(market.clobTokenIds).at(0);
      const eventKey = eventIdentity(market);
      const reentryBlocker = recentPaperReentryBlocker(market, ledger, mandate, now);
      const forecastGate = targetPrice === undefined
        ? { blockers: [] as string[], reasonCodes: [] as string[], edge: undefined }
        : evaluateIndependentForecastEdge(market, targetPrice, mandate, now);
      const reasonCodes = [
        ...asStringArray(market.reasonCodes),
        ...forecastGate.reasonCodes,
        `risk_profile:${mandate.riskProfile}`,
        `mode:${mandate.mode}`
      ];
      let action: AutoTradingAction = "monitor";
      let status: AutoTradingDecision["status"] = "watch";
      let allocatedBudgetUsdc: number | undefined;
      let shares: number | undefined;

      if (blockers.length > 0) {
        action = "skip";
        status = "blocked";
      } else if (score >= RISK_DEFAULTS[mandate.riskProfile].proposalThreshold && targetPrice !== undefined && tokenId) {
        if (forecastGate.blockers.length > 0) {
          action = "research_required";
          status = "research";
          blockers.push(...forecastGate.blockers);
        } else if (reentryBlocker) {
          action = "monitor";
          status = "watch";
          blockers.push(reentryBlocker);
        } else if (riskBlockedNewBuys) {
          action = "monitor";
          status = "watch";
          blockers.push("session_stop_loss_reached");
        } else if ((eventPositionCount.get(eventKey) ?? 0) >= mandate.maxEventPositions) {
          action = "monitor";
          status = "watch";
          blockers.push("event_position_cap_reached");
        } else if ((eventExposureUsdc.get(eventKey) ?? 0) >= mandate.maxEventExposureUsdc) {
          action = "monitor";
          status = "watch";
          blockers.push("event_exposure_cap_reached");
        } else if (remainingBudget <= 0) {
          action = "monitor";
          status = "watch";
          blockers.push("budget_exhausted");
        } else {
          action = entryActionForMode(mandate.mode);
          status = "proposed";
          const remainingEventBudget = Math.max(0, mandate.maxEventExposureUsdc - (eventExposureUsdc.get(eventKey) ?? 0));
          allocatedBudgetUsdc = Math.min(mandate.maxSingleOrderUsdc, remainingBudget, remainingEventBudget);
          if (remainingBudget < mandate.minOrderUsdc) {
            action = "monitor";
            status = "watch";
            allocatedBudgetUsdc = undefined;
            blockers.push("remaining_budget_below_min_order");
          } else if (allocatedBudgetUsdc < mandate.minOrderUsdc) {
            action = "monitor";
            status = "watch";
            allocatedBudgetUsdc = undefined;
            blockers.push(remainingEventBudget < mandate.minOrderUsdc ? "event_exposure_cap_reached" : "allocation_below_min_order");
          } else {
            shares = Number((allocatedBudgetUsdc / Math.max(0.001, targetPrice)).toFixed(4));
            remainingBudget = Math.max(0, remainingBudget - allocatedBudgetUsdc);
            eventExposureUsdc.set(eventKey, (eventExposureUsdc.get(eventKey) ?? 0) + allocatedBudgetUsdc);
            eventPositionCount.set(eventKey, (eventPositionCount.get(eventKey) ?? 0) + 1);
          }
        }
      } else {
        action = "research_required";
        status = "research";
      }

      const decision = {
        marketKey: typeof market.marketKey === "string" ? market.marketKey : undefined,
        title: typeof market.title === "string" ? market.title : undefined,
        action,
        status,
        score,
        allocatedBudgetUsdc,
        targetPrice,
        shares,
        tokenId,
        reasonCodes,
        blockers,
        market,
        forecastEdge: forecastGate.edge
      } satisfies AutoTradingDecision;
      return {
        ...decision,
        nextCheckAt: nextCheckForDecision(decision, mandate, now)
      };
    })
    .filter((decision) => decision.status !== "blocked" || decision.score > 0)
    .sort((left, right) => {
      if (left.status === "proposed" && right.status !== "proposed") return -1;
      if (right.status === "proposed" && left.status !== "proposed") return 1;
      const statusRankDelta = decisionStatusRank(left) - decisionStatusRank(right);
      if (statusRankDelta !== 0) return statusRankDelta;
      return right.score - left.score;
    })
    .slice(0, limit);

  const rotationExitMarketKeys = new Set(exitDecisions.map((decision) => decision.marketKey).filter((value): value is string => Boolean(value)));
  const hygieneExitDecisions = mandate.mode === "paper"
    ? buildPaperHygieneExitDecisions(
      ledger,
      mandate,
      now,
      decisions,
      rotationExitMarketKeys
    )
    : [];
  for (const decision of hygieneExitDecisions) {
    if (decision.marketKey) {
      rotationExitMarketKeys.add(decision.marketKey);
    }
  }
  const eventRotationExitDecisions = mandate.mode === "paper"
    ? buildEventRotationExitDecisions(
      ledger,
      mandate,
      session,
      now,
      decisions,
      rotationExitMarketKeys
    )
    : [];
  for (const decision of eventRotationExitDecisions) {
    if (decision.marketKey) {
      rotationExitMarketKeys.add(decision.marketKey);
    }
  }
  const budgetRotationExitDecisions = mandate.mode === "paper"
    ? buildBudgetRotationExitDecisions(
      ledger,
      mandate,
      session,
      now,
      decisions,
      rotationExitMarketKeys
    )
    : [];
  exitDecisions = [
    ...exitDecisions,
    ...hygieneExitDecisions,
    ...eventRotationExitDecisions,
    ...budgetRotationExitDecisions
  ];
  const openPositionsAfterExits = Math.max(0, ledger.summary.openPositionCount - exitDecisions.length);
  const allowedNewBuys = Math.max(0, mandate.maxOpenPositions - openPositionsAfterExits);
  let proposedBuyCount = 0;
  const cappedDecisions = [...exitDecisions, ...decisions].map((decision) => {
    if (isEntryAction(decision.action)) {
      proposedBuyCount += 1;
    }
    if (isEntryAction(decision.action) && proposedBuyCount > allowedNewBuys) {
      return {
        ...decision,
        action: "monitor" as const,
        status: "watch" as const,
        allocatedBudgetUsdc: undefined,
        shares: undefined,
        blockers: [...decision.blockers, "max_open_positions_reached"]
      };
    }
    return decision;
  });

  const stored = persist
    ? cappedDecisions.map((decision) => store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId,
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
        tokenId: decision.tokenId,
        shares: decision.shares,
        mode: mandate.mode,
        liveSubmissionEnabled: false,
        forecastEdge: decision.forecastEdge,
        market: decision.market
      }
    }))
    : [];

  const remainingBudgetBeforePaperFills = ledger.summary.remainingBudgetUsdc;
  const hadPaperExitDecision = cappedDecisions.some((decision) => decision.action === "paper_sell_yes");

  if (persist && mandate.mode === "paper") {
    cappedDecisions.forEach((decision, index) => {
      const storedDecision = stored[index];
      if (!decision.marketKey || decision.targetPrice === undefined || !decision.shares || !storedDecision) {
        return;
      }
      const paperSide = paperTradingSideForAction(decision.action);
      if (!paperSide) {
        return;
      }
      const execution = simulatePaperExecution(decision, now);
      const paperOrder = store.recordPaperTradingOrder({
        sessionId: session.sessionId,
        iterationId,
        decisionId: storedDecision.decisionId,
        marketKey: decision.marketKey,
        title: decision.title,
        side: paperSide,
        limitPrice: execution.limitPrice,
        requestedShares: execution.requestedShares,
        requestedNotionalUsdc: execution.requestedNotionalUsdc,
        filledShares: execution.filledShares,
        filledNotionalUsdc: execution.filledNotionalUsdc,
        status: execution.status,
        createdAt: now.toISOString(),
        expiresAt: decision.nextCheckAt,
        metadata: {
          ...execution.metadata,
          reasonCodes: execution.reasonCodes,
          warnings: execution.warnings,
          score: decision.score,
          forecastEdge: decision.forecastEdge,
          tokenId: decision.tokenId,
          endDate: decision.market.endDate
        }
      });
      if (execution.filledShares <= 0 || execution.filledNotionalUsdc <= 0 || execution.fillPrice === undefined) {
        return;
      }
      if (decision.action === "paper_buy_yes") {
        store.recordPaperTradingFill({
          sessionId: session.sessionId,
          iterationId,
          decisionId: storedDecision.decisionId,
          marketKey: decision.marketKey,
          title: decision.title,
          side: "buy_yes",
          price: execution.fillPrice,
          shares: execution.filledShares,
          costUsdc: execution.filledNotionalUsdc,
          filledAt: now.toISOString(),
          metadata: {
            eventKey: eventIdentity(decision.market),
            tokenId: decision.tokenId,
            score: decision.score,
            mode: mandate.mode,
            forecastEdge: decision.forecastEdge,
            endDate: decision.market.endDate,
            paperOrderId: paperOrder.paperOrderId,
            paperExecution: execution.metadata,
            paperExecutionReasonCodes: execution.reasonCodes,
            paperExecutionWarnings: execution.warnings
          }
        });
      }
      if (decision.action === "paper_sell_yes") {
        store.recordPaperTradingFill({
          sessionId: session.sessionId,
          iterationId,
          decisionId: storedDecision.decisionId,
          marketKey: decision.marketKey,
          title: decision.title,
          side: "sell_yes",
          price: execution.fillPrice,
          shares: execution.filledShares,
          costUsdc: execution.filledNotionalUsdc,
          filledAt: now.toISOString(),
          metadata: {
            eventKey: decision.market.eventKey ?? eventIdentity(decision.market),
            tokenId: decision.tokenId,
            score: decision.score,
            mode: mandate.mode,
            exitReasonCodes: decision.reasonCodes,
            endDate: decision.market.endDate,
            paperOrderId: paperOrder.paperOrderId,
            paperExecution: execution.metadata,
            paperExecutionReasonCodes: execution.reasonCodes,
            paperExecutionWarnings: execution.warnings
          }
        });
      }
    });
    store.markPaperTradingPositions(session.sessionId, undefined, now.toISOString());
    ledger = store.getPaperTradingLedger(session.sessionId);
    exitDecisions = mandate.mode === "paper"
      ? buildPaperExitDecisions(ledger, mandate, session, now)
      : [];
  }

  const proposedBudgetUsdc = cappedDecisions
    .filter((decision) => isEntryAction(decision.action))
    .reduce((sum, decision) => sum + (decision.allocatedBudgetUsdc ?? 0), 0);
  const paperExitFreedUsableCapital =
    mandate.mode === "paper" &&
    persist &&
    hadPaperExitDecision &&
    ledger.summary.remainingBudgetUsdc >= mandate.minOrderUsdc &&
    ledger.summary.remainingBudgetUsdc > remainingBudgetBeforePaperFills;
  const decisionNextRunAt = cappedDecisions
    .map((decision) => decision.nextCheckAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0) ?? addMinutes(now, mandate.heartbeatMinutes);
  const nextRunAt = paperExitFreedUsableCapital
    ? [addMinutes(now, redeployAfterExitMinutes(mandate)), decisionNextRunAt].sort()[0]
    : decisionNextRunAt;

  return {
    session,
    iterationId,
    generatedAt: now.toISOString(),
    runId,
    mandate,
    summary: {
      mode: mandate.mode,
      riskProfile: mandate.riskProfile,
      budgetUsdc: mandate.budgetUsdc,
      spentUsdc: ledger.summary.spentUsdc,
      positionValueUsdc: ledger.summary.positionValueUsdc,
      unrealizedPnlUsdc: ledger.summary.unrealizedPnlUsdc,
      realizedPnlUsdc: ledger.summary.realizedPnlUsdc,
      totalPnlUsdc: ledger.summary.totalPnlUsdc,
      portfolioValueUsdc: ledger.summary.portfolioValueUsdc,
      openPositions: ledger.summary.openPositionCount,
      proposedBudgetUsdc: Number(proposedBudgetUsdc.toFixed(4)),
      remainingBudgetUsdc: ledger.summary.remainingBudgetUsdc,
      eligibleMarkets: cappedDecisions.filter((decision) => decision.status !== "blocked").length,
      proposedOrders: cappedDecisions.filter((decision) => isEntryAction(decision.action)).length,
      exitOrders: cappedDecisions.filter((decision) => isExitAction(decision.action)).length,
      researchRequired: cappedDecisions.filter((decision) => decision.action === "research_required").length,
      blocked: cappedDecisions.filter((decision) => decision.status === "blocked").length,
      blockerCounts: blockerCounts(cappedDecisions),
      riskBlockedNewBuys,
      nextRunAt
    },
    decisions: stored,
    ledger,
    candidates: cappedDecisions
  };
}

function simulationPrice(market: AutoTradingSimulationMarket, tick: number): number {
  const price = market.prices[Math.min(tick, market.prices.length - 1)];
  return clampProbability(price ?? market.prices.at(-1) ?? 0.5);
}

function simulationMarketToStoredInput(
  runId: string,
  market: AutoTradingSimulationMarket,
  tick: number,
  now: Date,
  startAt: Date
): StoredUniverseMarketInput {
  const price = simulationPrice(market, tick);
  const spreadCents = market.spreadCents ?? 1;
  const halfSpread = spreadCents / 200;
  const endHoursFromStart = market.endHoursFromStart ?? 24;
  const endDate = new Date(startAt.getTime() + endHoursFromStart * 60 * 60 * 1000).toISOString();
  const marketKeySuffix = market.marketKey.replace(/^condition:/, "");
  return {
    runId,
    marketKey: market.marketKey,
    conditionId: marketKeySuffix,
    slug: marketKeySuffix,
    eventTitle: market.eventTitle ?? "Synthetic simulation event",
    eventSlug: market.eventSlug ?? "synthetic-simulation-event",
    title: market.title,
    tags: [market.categoryGroup ?? "simulation"],
    outcomes: ["Yes", "No"],
    outcomePrices: [price, roundMoney(1 - price)],
    clobTokenIds: [`${market.marketKey}:yes`, `${market.marketKey}:no`],
    yesTokenId: `${market.marketKey}:yes`,
    noTokenId: `${market.marketKey}:no`,
    active: true,
    closed: false,
    archived: false,
    restricted: false,
    acceptingOrders: true,
    enableOrderBook: true,
    startDate: startAt.toISOString(),
    endDate,
    createdAt: startAt.toISOString(),
    updatedAt: now.toISOString(),
    liquidityUsd: market.liquidityUsd ?? 50_000,
    liquidityClobUsd: market.liquidityUsd ?? 50_000,
    volume24hUsd: market.volume24hUsd ?? 10_000,
    impliedProb: price,
    lastTradePrice: price,
    bestBid: clampProbability(price - halfSpread),
    bestAsk: clampProbability(price + halfSpread),
    midpoint: price,
    spreadCents,
    orderPriceMinTickSize: 0.001,
    orderMinSize: 5,
    negRisk: false,
    structuralType: market.structuralType ?? "single-binary",
    categoryGroup: market.categoryGroup ?? "simulation",
    horizonBucket: endHoursFromStart <= 24 * 7 ? "short-0-7d" : "medium-31-120d",
    priceBucket: price < 0.1 ? "longshot-0-10c" : price < 0.3 ? "cheap-10-30c" : "balanced-30-70c",
    liquidityBucket: "tradable",
    spreadBucket: spreadCents <= 1 ? "tight-0-1c" : "normal-1-3c",
    opportunityMode: market.opportunityMode ?? "execution-ready",
    modelabilityScore: 80,
    tradabilityScore: market.tradabilityScore ?? 82,
    catalystScore: market.catalystScore ?? 85,
    resolutionAmbiguityScore: market.resolutionAmbiguityScore ?? 20,
    attentionGapScore: 55,
    crossMarketScore: 30,
    researchPriorityScore: market.researchPriorityScore ?? 82,
    tradeOpportunityScore: market.tradeOpportunityScore ?? 84,
    makerScore: 55,
    riskScore: market.riskScore ?? 18,
    reasonCodes: market.reasonCodes ?? ["simulation_market", "defined_catalyst_window"],
    disqualifiers: market.disqualifiers ?? [],
    rawJson: {
      simulation: true,
      tick,
      pricePath: market.prices,
      independentForecast: {
        sealed: true,
        probability: clampProbability(price + 0.12),
        uncertainty: 0.02,
        forecastedAt: now.toISOString(),
        expiresAt: endDate,
        numericalChecks: ["synthetic_simulation_fixture"],
        usesVenuePrice: false
      }
    },
    capturedAt: now.toISOString()
  };
}

function markSimulationPositions(
  positions: Map<string, { title?: string; shares: number; costUsdc: number }>,
  markets: AutoTradingSimulationMarket[],
  tick: number
): AutoTradingSimulationPosition[] {
  return Array.from(positions.entries()).map(([marketKey, position]) => {
    const market = markets.find((candidate) => candidate.marketKey === marketKey);
    const currentPrice = market ? simulationPrice(market, tick) : 0;
    const currentValueUsdc = position.shares * currentPrice;
    const averagePrice = position.costUsdc / Math.max(0.000001, position.shares);
    const unrealizedPnlUsdc = currentValueUsdc - position.costUsdc;
    return {
      marketKey,
      title: position.title,
      shares: roundShares(position.shares),
      averagePrice: roundMoney(averagePrice),
      costUsdc: roundMoney(position.costUsdc),
      currentPrice,
      currentValueUsdc: roundMoney(currentValueUsdc),
      unrealizedPnlUsdc: roundMoney(unrealizedPnlUsdc),
      unrealizedPnlPct: roundMoney((unrealizedPnlUsdc / Math.max(0.000001, position.costUsdc)) * 100)
    };
  });
}

export function runAutoTradingSimulation(
  store: StateStore,
  input: AutoTradingSimulationInput
): AutoTradingSimulationResult {
  const simulationId = randomUUID();
  const startAt = input.startAt ?? new Date();
  const ticks = Math.max(1, Math.min(96, input.ticks ?? 4));
  const tickMinutes = Math.max(1, Math.min(24 * 60, input.tickMinutes ?? 60));
  const mandate = normalizeAutoTradingMandate(input.mandate);
  const positions = new Map<string, { title?: string; shares: number; costUsdc: number }>();
  const fills: AutoTradingSimulationFill[] = [];
  const tickResults: AutoTradingSimulationTick[] = [];
  let sessionId = "";
  let cashUsdc = mandate.budgetUsdc;

  for (let tick = 0; tick < ticks; tick += 1) {
    const now = new Date(startAt.getTime() + tick * tickMinutes * 60 * 1000);
    const runId = `simulation:${simulationId}:${tick}`;
    store.startUniverseRun({
      runId,
      source: "simulation",
      activeOnly: true,
      closedIncluded: false,
      status: "running",
      startedAt: now.toISOString(),
      metadata: {
        simulationId,
        tick
      }
    });
    store.recordUniverseMarkets(
      runId,
      input.markets.map((market) => simulationMarketToStoredInput(runId, market, tick, now, startAt))
    );
    store.completeUniverseRun(runId, {
      status: "completed",
      completedAt: now.toISOString(),
      totalEvents: 1,
      totalMarkets: input.markets.length,
      enrichedMarkets: 0
    });

    const iteration = runAutoTradingIteration(store, {
      sessionId: sessionId || undefined,
      mandate: sessionId ? undefined : mandate,
      now,
      limit: input.limit ?? mandate.maxOpenPositions * 2
    });
    sessionId = iteration.session.sessionId;

    const tickFills: AutoTradingSimulationFill[] = [];
    for (const decision of iteration.candidates) {
      if (decision.action !== "paper_buy_yes" || !decision.marketKey || !decision.targetPrice || cashUsdc <= 0) {
        continue;
      }
      const requestedCost = decision.allocatedBudgetUsdc ?? 0;
      const costUsdc = Math.min(cashUsdc, requestedCost);
      if (costUsdc <= 0) {
        continue;
      }
      const shares = costUsdc / decision.targetPrice;
      const existing = positions.get(decision.marketKey) ?? {
        title: decision.title,
        shares: 0,
        costUsdc: 0
      };
      existing.shares += shares;
      existing.costUsdc += costUsdc;
      positions.set(decision.marketKey, existing);
      cashUsdc = Math.max(0, cashUsdc - costUsdc);
      const fill = {
        tick,
        filledAt: now.toISOString(),
        marketKey: decision.marketKey,
        title: decision.title,
        price: decision.targetPrice,
        shares: roundShares(shares),
        costUsdc: roundMoney(costUsdc),
        decisionScore: decision.score
      } satisfies AutoTradingSimulationFill;
      fills.push(fill);
      tickFills.push(fill);
    }

    const markedPositions = markSimulationPositions(positions, input.markets, tick);
    const positionValueUsdc = markedPositions.reduce((sum, position) => sum + position.currentValueUsdc, 0);
    tickResults.push({
      tick,
      now: now.toISOString(),
      runId,
      sessionId,
      proposedOrders: iteration.summary.proposedOrders,
      blocked: iteration.summary.blocked,
      researchRequired: iteration.summary.researchRequired,
      fills: tickFills,
      cashUsdc: roundMoney(cashUsdc),
      positionValueUsdc: roundMoney(positionValueUsdc),
      portfolioValueUsdc: roundMoney(cashUsdc + positionValueUsdc)
    });
  }

  const positionsList = markSimulationPositions(positions, input.markets, ticks - 1);
  const positionValueUsdc = positionsList.reduce((sum, position) => sum + position.currentValueUsdc, 0);
  const totalSpentUsdc = fills.reduce((sum, fill) => sum + fill.costUsdc, 0);
  const finalPortfolioValueUsdc = cashUsdc + positionValueUsdc;
  const unrealizedPnlUsdc = finalPortfolioValueUsdc - mandate.budgetUsdc;
  return {
    simulationId,
    startedAt: startAt.toISOString(),
    completedAt: new Date(startAt.getTime() + (ticks - 1) * tickMinutes * 60 * 1000).toISOString(),
    mandate,
    sessionId,
    summary: {
      initialCashUsdc: roundMoney(mandate.budgetUsdc),
      finalCashUsdc: roundMoney(cashUsdc),
      positionValueUsdc: roundMoney(positionValueUsdc),
      finalPortfolioValueUsdc: roundMoney(finalPortfolioValueUsdc),
      totalSpentUsdc: roundMoney(totalSpentUsdc),
      unrealizedPnlUsdc: roundMoney(unrealizedPnlUsdc),
      returnPct: roundMoney((unrealizedPnlUsdc / Math.max(0.000001, mandate.budgetUsdc)) * 100),
      fillCount: fills.length,
      positionCount: positionsList.length,
      ticks
    },
    ticks: tickResults,
    fills,
    positions: positionsList
  };
}
