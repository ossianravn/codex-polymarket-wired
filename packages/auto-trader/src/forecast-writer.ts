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

function clampProbability(value: number): number {
  return Math.max(0.03, Math.min(0.97, Number(value.toFixed(4))));
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
    case "multi-outcome":
    case "participant-field":
      return -0.015;
    default:
      return 0;
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

function marketEligibleForForecast(market: Record<string, unknown>): boolean {
  if (market.active === false || market.closed === true || market.acceptingOrders === false) {
    return false;
  }
  if (asStringArray(market.disqualifiers).length > 0) {
    return false;
  }
  const endDate = typeof market.endDate === "string" ? Date.parse(market.endDate) : Number.NaN;
  return Number.isFinite(endDate) && endDate > Date.now() - 60 * 1000;
}

export function buildIndependentForecastArtifact(
  market: Record<string, unknown>,
  now = new Date()
): IndependentForecastArtifact {
  const baseRate = 0.5;
  const structural = structuralAdjustment(market);
  const catalyst = scoreAdjustment(market.catalystScore, 0.055);
  const modelability = scoreAdjustment(market.modelabilityScore, 0.045);
  const ambiguity = -scoreAdjustment(market.resolutionAmbiguityScore, 0.045);
  const risk = -scoreAdjustment(market.riskScore, 0.035);
  const probability = clampProbability(baseRate + structural + catalyst + modelability + ambiguity + risk);
  const uncertainty = clampUncertainty(
    0.06 +
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
      `adjustments_sum:${Number((probability - baseRate).toFixed(4))}`
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
      sourceFields: [
        "structuralType",
        "catalystScore",
        "modelabilityScore",
        "resolutionAmbiguityScore",
        "riskScore",
        "reasonCodes",
        "resolutionText",
        "resolutionSource"
      ],
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

  const limit = Math.max(1, Math.min(1_000, input.limit ?? 100));
  const markets = store.listUniverseMarkets({
    runId,
    minLiquidityUsdc: input.minLiquidityUsdc,
    maxSpreadCents: input.maxSpreadCents,
    sort: "trade_opportunity_desc",
    limit
  }).markets;
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
    if (!marketKey || !marketEligibleForForecast(market)) {
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
