import type { StateStore } from "../../state-store/src/index.js";

export interface IndependentForecastArtifact {
  sealed: true;
  probability: number;
  uncertainty: number;
  forecastedAt: string;
  expiresAt: string;
  numericalChecks: string[];
  usesVenuePrice: false;
  method: "screening_forecast_v0";
  evidence: {
    baseRate: number;
    structuralAdjustment: number;
    catalystAdjustment: number;
    modelabilityAdjustment: number;
    ambiguityAdjustment: number;
    riskAdjustment: number;
    exclusiveGroupSize?: number;
    baseRateReason: string;
    probabilityCap?: number;
    confidenceTier: "screening-low" | "screening-medium";
    sourceFields: string[];
    evidenceNotes: string[];
  };
  counterCase: string;
}

export interface ForecastWriterInput {
  runId?: string;
  now?: Date;
  limit?: number;
  minLiquidityUsdc?: number;
  maxSpreadCents?: number;
  overwrite?: boolean;
}

export interface ForecastWriterResult {
  runId: string;
  generatedAt: string;
  scanned: number;
  written: number;
  skippedExisting: number;
  skippedIneligible: number;
  forecasts: Array<{
    marketKey: string;
    title?: string;
    probability: number;
    uncertainty: number;
    expiresAt: string;
  }>;
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

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function clampProbability(value: number, min = 0.03, max = 0.97): number {
  return Math.max(min, Math.min(max, Number(value.toFixed(4))));
}

function clampUncertainty(value: number): number {
  return Math.max(0.03, Math.min(0.25, Number(value.toFixed(4))));
}

function scoreAdjustment(score: unknown, weight: number): number {
  const numeric = asNumber(score);
  if (numeric === undefined) {
    return 0;
  }
  return ((Math.max(0, Math.min(100, numeric)) - 50) / 50) * weight;
}

function structuralAdjustment(market: Record<string, unknown>): number {
  switch (market.structuralType) {
    case "threshold-range":
    case "single-binary":
      return 0.02;
    case "live-sports":
      return 0.015;
    case "multi-outcome-exclusive":
    case "multi-yes":
      return -0.015;
    default:
      return 0;
  }
}

function rawGammaEventMarkets(market: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawJson = asRecord(market.rawJson);
  const rawGammaEvent = asRecord(rawJson?.rawGammaEvent);
  const markets = rawGammaEvent?.markets;
  return Array.isArray(markets)
    ? markets.filter((value): value is Record<string, unknown> => Boolean(asRecord(value)))
    : [];
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

function activeExclusiveGroupSize(market: Record<string, unknown>): number | undefined {
  if (!hasExclusiveFieldSignal(market)) {
    return undefined;
  }

  const eventMarkets = rawGammaEventMarkets(market);
  const activeEventMarkets = eventMarkets.filter(marketLooksActive);
  if (activeEventMarkets.length >= 3) {
    return activeEventMarkets.length;
  }

  if (market.structuralType === "multi-outcome-exclusive") {
    const outcomes = asStringArray(market.outcomes);
    if (outcomes.length >= 3) {
      return outcomes.length;
    }
  }

  return undefined;
}

function forecastSourceFields(base: { exclusiveGroupSize?: number }): string[] {
  return [
    "structuralType",
    ...(base.exclusiveGroupSize === undefined ? [] : ["rawGammaEvent.markets"]),
    "catalystScore",
    "modelabilityScore",
    "resolutionAmbiguityScore",
    "riskScore",
    "reasonCodes",
    "resolutionText",
    "resolutionSource"
  ];
}

function baseRateForMarket(market: Record<string, unknown>): {
  baseRate: number;
  reason: string;
  exclusiveGroupSize?: number;
  probabilityCap?: number;
} {
  const exclusiveGroupSize = activeExclusiveGroupSize(market);
  if (exclusiveGroupSize !== undefined) {
    const baseRate = Number((1 / exclusiveGroupSize).toFixed(4));
    return {
      baseRate,
      reason: "exclusive_field_uniform_prior",
      exclusiveGroupSize,
      probabilityCap: Number(Math.min(0.45, Math.max(baseRate + 0.1, baseRate * 2.5)).toFixed(4))
    };
  }

  switch (market.structuralType) {
    case "multi-yes":
      return { baseRate: 0.25, reason: "multi_yes_conservative_prior", probabilityCap: 0.55 };
    case "threshold-range":
      return { baseRate: 0.35, reason: "threshold_range_conservative_prior", probabilityCap: 0.65 };
    default:
      return { baseRate: 0.5, reason: "binary_balanced_prior" };
  }
}

function forecastExpiry(market: Record<string, unknown>, now: Date): string {
  const endDate = typeof market.endDate === "string" ? Date.parse(market.endDate) : Number.NaN;
  const defaultExpiry = now.getTime() + 6 * 60 * 60 * 1000;
  const expiry = Number.isFinite(endDate)
    ? Math.min(endDate, defaultExpiry)
    : defaultExpiry;
  return new Date(Math.max(now.getTime() + 5 * 60 * 1000, expiry)).toISOString();
}

function hasExistingForecast(market: Record<string, unknown>): boolean {
  return Boolean(asRecord(asRecord(market.rawJson)?.independentForecast));
}

function marketEligibleForForecast(market: Record<string, unknown>, now: Date): boolean {
  if (market.active === false || market.closed === true || market.acceptingOrders === false) {
    return false;
  }
  if (asStringArray(market.disqualifiers).length > 0) {
    return false;
  }
  const endDate = typeof market.endDate === "string" ? Date.parse(market.endDate) : Number.NaN;
  return Number.isFinite(endDate) && endDate > now.getTime() - 60 * 1000;
}

export function buildIndependentForecastArtifact(
  market: Record<string, unknown>,
  now = new Date()
): IndependentForecastArtifact {
  const base = baseRateForMarket(market);
  const baseRate = base.baseRate;
  const structural = structuralAdjustment(market);
  const adjustmentScale = base.exclusiveGroupSize === undefined ? 1 : 0.35;
  const catalyst = scoreAdjustment(market.catalystScore, 0.055 * adjustmentScale);
  const modelability = scoreAdjustment(market.modelabilityScore, 0.045 * adjustmentScale);
  const ambiguity = -scoreAdjustment(market.resolutionAmbiguityScore, 0.045 * adjustmentScale);
  const risk = -scoreAdjustment(market.riskScore, 0.035 * adjustmentScale);
  const probability = clampProbability(
    baseRate + structural + catalyst + modelability + ambiguity + risk,
    0.005,
    base.probabilityCap ?? 0.97
  );
  const uncertainty = clampUncertainty(
    0.06 +
    (base.exclusiveGroupSize === undefined ? 0 : 0.04) +
    Math.max(0, ((asNumber(market.resolutionAmbiguityScore) ?? 50) - 25) / 1000) +
    Math.max(0, (50 - (asNumber(market.modelabilityScore) ?? 50)) / 1000)
  );
  const notes = [
    typeof market.resolutionText === "string" && market.resolutionText.trim()
      ? "resolution_text_present"
      : "resolution_text_missing",
    typeof market.resolutionSource === "string" && market.resolutionSource.trim()
      ? "resolution_source_present"
      : "resolution_source_missing",
    ...asStringArray(market.reasonCodes).slice(0, 5)
  ];

  return {
    sealed: true,
    probability,
    uncertainty,
    forecastedAt: now.toISOString(),
    expiresAt: forecastExpiry(market, now),
    numericalChecks: [
      `base_rate:${baseRate}`,
      `probability:${probability}`,
      `uncertainty:${uncertainty}`,
      `adjustments_sum:${Number((probability - baseRate).toFixed(4))}`,
      `base_rate_reason:${base.reason}`,
      ...(base.exclusiveGroupSize === undefined ? [] : [`exclusive_group_size:${base.exclusiveGroupSize}`]),
      ...(base.probabilityCap === undefined ? [] : [`probability_cap:${base.probabilityCap}`])
    ],
    usesVenuePrice: false,
    method: "screening_forecast_v0",
    evidence: {
      baseRate,
      structuralAdjustment: Number(structural.toFixed(4)),
      catalystAdjustment: Number(catalyst.toFixed(4)),
      modelabilityAdjustment: Number(modelability.toFixed(4)),
      ambiguityAdjustment: Number(ambiguity.toFixed(4)),
      riskAdjustment: Number(risk.toFixed(4)),
      exclusiveGroupSize: base.exclusiveGroupSize,
      baseRateReason: base.reason,
      probabilityCap: base.probabilityCap,
      confidenceTier: base.exclusiveGroupSize === undefined ? "screening-medium" : "screening-low",
      sourceFields: forecastSourceFields(base),
      evidenceNotes: notes
    },
    counterCase: "Screening forecast uses classifier and resolution-quality evidence only; deeper source research may overturn it."
  };
}

export function runIndependentForecastWriter(
  store: StateStore,
  input: ForecastWriterInput = {}
): ForecastWriterResult {
  const now = input.now ?? new Date();
  const latestRun = input.runId ? store.getUniverseRun(input.runId) : store.getLatestUniverseRun();
  const runId = typeof latestRun?.runId === "string" ? latestRun.runId : "";
  if (!runId) {
    return {
      runId: "",
      generatedAt: now.toISOString(),
      scanned: 0,
      written: 0,
      skippedExisting: 0,
      skippedIneligible: 0,
      forecasts: []
    };
  }

  const limit = Math.max(1, Math.min(5_000, input.limit ?? 100));
  const perPoolLimit = Math.max(500, limit);
  const baseFilters = {
    runId,
    minLiquidityUsdc: input.minLiquidityUsdc,
    maxSpreadCents: input.maxSpreadCents,
    limit: 500
  } as const;
  const markets = mergeMarketPools([
    listUniverseMarketsPaged(store, { ...baseFilters, sort: "trade_opportunity_desc" }, perPoolLimit),
    listUniverseMarketsPaged(store, { ...baseFilters, sort: "ending_soon" }, perPoolLimit),
    listUniverseMarketsPaged(store, { ...baseFilters, sort: "volume_24h_desc" }, perPoolLimit)
  ]);
  const result: ForecastWriterResult = {
    runId,
    generatedAt: now.toISOString(),
    scanned: markets.length,
    written: 0,
    skippedExisting: 0,
    skippedIneligible: 0,
    forecasts: []
  };

  for (const market of markets) {
    const marketKey = typeof market.marketKey === "string" ? market.marketKey : undefined;
    if (!marketKey || !marketEligibleForForecast(market, now)) {
      result.skippedIneligible += 1;
      continue;
    }
    if (!input.overwrite && hasExistingForecast(market)) {
      result.skippedExisting += 1;
      continue;
    }

    const artifact = buildIndependentForecastArtifact(market, now);
    const rawJson = {
      ...(asRecord(market.rawJson) ?? {}),
      independentForecast: artifact
    };
    store.updateUniverseMarketRawJson(runId, marketKey, rawJson, now.toISOString());
    result.written += 1;
    result.forecasts.push({
      marketKey,
      title: typeof market.title === "string" ? market.title : undefined,
      probability: artifact.probability,
      uncertainty: artifact.uncertainty,
      expiresAt: artifact.expiresAt
    });
  }

  return result;
}
