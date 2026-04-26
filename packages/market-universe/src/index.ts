import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import YAML from "yaml";

import {
  getOrderbook,
  type OrderbookSnapshot,
  type RuntimeConfig
} from "../../polymarket-core/src/index.js";

export type UniverseSource = "markets_keyset" | "events_keyset" | "gamma_markets" | "gamma_events" | "composite" | "both";
export type EnrichmentProfile = "none" | "microstructure" | "microstructure_and_history";

export type StructuralType =
  | "single-binary"
  | "multi-outcome-exclusive"
  | "threshold-range"
  | "multi-yes"
  | "open-ended-process"
  | "live-sports"
  | "novelty"
  | "unknown";

export type CategoryGroup =
  | "politics"
  | "economics"
  | "finance"
  | "crypto"
  | "tech"
  | "sports"
  | "culture"
  | "other";

export type HorizonBucket =
  | "resolves-today"
  | "short-0-7d"
  | "near-8-30d"
  | "medium-31-120d"
  | "long-120d-plus"
  | "unknown";

export type PriceBucket =
  | "longshot-0-10c"
  | "cheap-10-30c"
  | "balanced-30-70c"
  | "favorite-70-90c"
  | "heavy-favorite-90c-plus"
  | "unknown";

export type LiquidityBucket = "deep" | "tradable" | "thin" | "dead" | "unknown";
export type SpreadBucket =
  | "tight-0-1c"
  | "normal-1-3c"
  | "wide-3-6c"
  | "very-wide-6c-plus"
  | "unknown";

export type OpportunityMode =
  | "deep-research"
  | "execution-ready"
  | "market-making"
  | "cross-market-check"
  | "resolution-watch"
  | "avoid";

export type UniverseView =
  | "best_research_candidates"
  | "clean_catalyst_bets"
  | "execution_ready"
  | "market_making_candidates"
  | "cross_market_dislocations"
  | "resolution_watch"
  | "low_attention_modelable"
  | "avoid_or_blocked";

export type CandidateProfile =
  | "clean-short-term"
  | "liquid-politics"
  | "macro-catalyst"
  | "market-making"
  | "longshot-research"
  | "resolution-watch"
  | "cross-market";

export interface UniverseMarket {
  marketKey: string;
  source: UniverseSource;

  marketId?: string;
  conditionId?: string;
  questionId?: string;
  eventId?: string;
  eventSlug?: string;
  eventTitle?: string;
  seriesSlug?: string;
  seriesTitle?: string;

  slug?: string;
  title: string;
  description?: string;
  resolutionSource?: string;
  resolutionText?: string;

  category?: string;
  subcategory?: string;
  tags: string[];

  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  yesTokenId?: string;
  noTokenId?: string;

  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  restricted?: boolean;
  acceptingOrders?: boolean;
  enableOrderBook?: boolean;
  ready?: boolean;
  funded?: boolean;

  startDate?: string;
  endDate?: string;
  endDateIso?: string;
  eventStartTime?: string;
  createdAt?: string;
  updatedAt?: string;

  liquidityUsd?: number;
  liquidityClobUsd?: number;
  volumeUsd?: number;
  volume24hUsd?: number;
  volume7dUsd?: number;
  volume30dUsd?: number;
  openInterestUsd?: number;

  impliedProb?: number;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
  spreadCents?: number;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;

  negRisk?: boolean;
  sportsMarketType?: string;
  line?: number;

  depthUsdWithin2c?: number;
  depthUsdWithin5c?: number;
  slippageCentsAt50Usd?: number;
  slippageCentsAt250Usd?: number;

  structuralType: StructuralType;
  categoryGroup: CategoryGroup;
  horizonBucket: HorizonBucket;
  priceBucket: PriceBucket;
  liquidityBucket: LiquidityBucket;
  spreadBucket: SpreadBucket;
  opportunityMode: OpportunityMode;

  modelabilityScore: number;
  tradabilityScore: number;
  catalystScore: number;
  resolutionAmbiguityScore: number;
  attentionGapScore: number;
  crossMarketScore: number;
  researchPriorityScore: number;
  tradeOpportunityScore: number;
  makerScore: number;
  riskScore: number;

  reasonCodes: string[];
  disqualifiers: string[];

  rawGammaMarket: unknown;
  rawGammaEvent?: unknown;
}

export interface IngestMarketUniverseArgs {
  activeOnly?: boolean;
  includeClosed?: boolean;
  source?: UniverseSource;
  pageSize?: number;
  limitPages?: number;
  minLiquidityUsdc?: number;
  includeTags?: boolean;
  order?: string;
  ascending?: boolean;
  enrichTopN?: number;
  enrichmentProfile?: EnrichmentProfile;
  now?: Date;
}

export interface ListUniverseFilters {
  runId?: string;
  view?: UniverseView;
  categoryGroups?: CategoryGroup[];
  structuralTypes?: StructuralType[];
  horizonBuckets?: HorizonBucket[];
  priceBuckets?: PriceBucket[];
  opportunityModes?: OpportunityMode[];
  minLiquidityUsdc?: number;
  minVolume24hUsdc?: number;
  maxSpreadCents?: number;
  minTradabilityScore?: number;
  minResearchPriorityScore?: number;
  maxResolutionAmbiguityScore?: number;
  excludeTags?: string[];
  includeTags?: string[];
  search?: string;
  sort?:
    | "research_priority_desc"
    | "trade_opportunity_desc"
    | "maker_score_desc"
    | "liquidity_desc"
    | "volume_24h_desc"
    | "ending_soon"
    | "attention_gap_desc"
    | "spread_asc"
    | "risk_desc";
  limit?: number;
  offset?: number;
}

export interface DiscoveryPolicies {
  version: number;
  defaults: {
    pageSize: number;
    source: UniverseSource;
    includeTags: boolean;
    activeOnly: boolean;
    includeClosed: boolean;
    order: string;
    ascending: boolean;
    enrichTopN: number;
    enrichmentProfile: EnrichmentProfile;
    minLiquidityUsdc: number;
  };
  thresholds: {
    deepLiquidityUsdc: number;
    tradableLiquidityUsdc: number;
    thinLiquidityUsdc: number;
    tightSpreadCents: number;
    normalSpreadCents: number;
    wideSpreadCents: number;
    maxGoodResolutionAmbiguityScore: number;
    minGoodTradabilityScore: number;
    minGoodResearchPriorityScore: number;
  };
  preferences: {
    categoryGroups: Record<CategoryGroup, number>;
    blockedTags: string[];
    blockedCategoryGroups: CategoryGroup[];
  };
  profiles: Partial<Record<CandidateProfile, ListUniverseFilters>>;
}

export interface IngestUniverseResult {
  source: UniverseSource;
  rawMarkets: unknown[];
  rawEvents: unknown[];
  rawPages: unknown[];
  pageCount: number;
  markets: UniverseMarket[];
  enrichedCount: number;
}

export interface FetchMarketsKeysetPageArgs {
  limit?: number;
  afterCursor?: string;
  closed?: boolean;
  includeTag?: boolean;
  liquidityNumMin?: number;
  volumeNumMin?: number;
  order?: string;
  ascending?: boolean;
  offset?: number;
}

const DEFAULT_DISCOVERY_POLICIES: DiscoveryPolicies = {
  version: 1,
  defaults: {
    pageSize: 1000,
    source: "composite",
    includeTags: true,
    activeOnly: true,
    includeClosed: false,
    order: "volume_num,liquidity_num",
    ascending: false,
    enrichTopN: 250,
    enrichmentProfile: "microstructure",
    minLiquidityUsdc: 0
  },
  thresholds: {
    deepLiquidityUsdc: 100_000,
    tradableLiquidityUsdc: 10_000,
    thinLiquidityUsdc: 1_000,
    tightSpreadCents: 1,
    normalSpreadCents: 3,
    wideSpreadCents: 6,
    maxGoodResolutionAmbiguityScore: 35,
    minGoodTradabilityScore: 65,
    minGoodResearchPriorityScore: 65
  },
  preferences: {
    categoryGroups: {
      politics: 85,
      economics: 85,
      finance: 80,
      crypto: 75,
      tech: 75,
      sports: 55,
      culture: 50,
      other: 55
    },
    blockedTags: [],
    blockedCategoryGroups: []
  },
  profiles: {
    "clean-short-term": {
      view: "clean_catalyst_bets",
      horizonBuckets: ["short-0-7d", "near-8-30d"],
      minTradabilityScore: 65,
      maxResolutionAmbiguityScore: 35,
      sort: "research_priority_desc"
    },
    "liquid-politics": {
      view: "best_research_candidates",
      categoryGroups: ["politics"],
      minLiquidityUsdc: 25_000,
      maxSpreadCents: 3,
      sort: "research_priority_desc"
    },
    "macro-catalyst": {
      view: "clean_catalyst_bets",
      categoryGroups: ["economics", "finance", "crypto"],
      horizonBuckets: ["short-0-7d", "near-8-30d", "medium-31-120d"],
      sort: "research_priority_desc"
    },
    "market-making": {
      view: "market_making_candidates",
      minLiquidityUsdc: 10_000,
      sort: "maker_score_desc"
    },
    "longshot-research": {
      view: "low_attention_modelable",
      priceBuckets: ["longshot-0-10c", "cheap-10-30c"],
      minTradabilityScore: 45,
      sort: "attention_gap_desc"
    },
    "resolution-watch": {
      view: "resolution_watch",
      horizonBuckets: ["resolves-today", "short-0-7d"],
      sort: "ending_soon"
    },
    "cross-market": {
      view: "cross_market_dislocations",
      sort: "research_priority_desc"
    }
  }
};

const DEFAULT_CATEGORY_KEYWORDS: Record<CategoryGroup, string[]> = {
  politics: [
    "election",
    "president",
    "senate",
    "congress",
    "parliament",
    "minister",
    "trump",
    "biden",
    "government",
    "poll",
    "vote",
    "party"
  ],
  economics: [
    "inflation",
    "cpi",
    "fed",
    "rates",
    "unemployment",
    "gdp",
    "jobs",
    "recession",
    "central bank"
  ],
  finance: [
    "earnings",
    "ipo",
    "nasdaq",
    "s&p",
    "stock",
    "equity",
    "shares",
    "tesla",
    "nvidia",
    "dow"
  ],
  crypto: [
    "bitcoin",
    "btc",
    "eth",
    "ethereum",
    "solana",
    "crypto",
    "blockchain",
    "etf"
  ],
  tech: [
    "ai",
    "openai",
    "apple",
    "google",
    "microsoft",
    "software",
    "launch",
    "product",
    "antitrust"
  ],
  sports: [
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "uefa",
    "premier league",
    "champions league",
    "game",
    "match",
    "goal",
    "score"
  ],
  culture: [
    "oscar",
    "grammy",
    "celebrity",
    "entertainment",
    "tv",
    "movie",
    "music",
    "social media",
    "tiktok"
  ],
  other: []
};

const CATEGORY_ALIAS_MAP: Record<string, CategoryGroup> = {
  election: "politics",
  elections: "politics",
  politics: "politics",
  government: "politics",
  macro: "economics",
  economics: "economics",
  economy: "economics",
  finance: "finance",
  financials: "finance",
  equities: "finance",
  stocks: "finance",
  crypto: "crypto",
  cryptocurrency: "crypto",
  cryptocurrencies: "crypto",
  technology: "tech",
  tech: "tech",
  ai: "tech",
  sports: "sports",
  sport: "sports",
  baseball: "sports",
  basketball: "sports",
  cricket: "sports",
  football: "sports",
  mma: "sports",
  soccer: "sports",
  tennis: "sports",
  ufc: "sports",
  entertainment: "culture",
  culture: "culture",
  movies: "culture",
  music: "culture"
};

const SPORTS_CONTEXT_KEYWORDS = [
  ...DEFAULT_CATEGORY_KEYWORDS.sports,
  "baseball",
  "basketball",
  "cricket",
  "football",
  "mma",
  "soccer",
  "tennis",
  "ufc",
  "mlb",
  "ncaab",
  "ncaaf",
  "wnba",
  "atp",
  "wta",
  "fc"
];

const CATALYST_KEYWORDS = [
  "cpi",
  "fed",
  "earnings",
  "election",
  "debate",
  "court",
  "decision",
  "deadline",
  "meeting",
  "game",
  "release",
  "launch"
];

const BINARY_OUTCOMES = new Set(["YES", "NO"]);

function unknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stableSort<T>(items: T[], compare: (left: T, right: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const result = compare(left.item, right.item);
      return result !== 0 ? result : left.index - right.index;
    })
    .map((entry) => entry.item);
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

export function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return fallback;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function uniqueCompactStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const stringValue = asString(value);
    if (!stringValue) {
      continue;
    }
    const normalized = stringValue.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueCompactStrings(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    const parsed = parseMaybeJson<unknown>(trimmed, trimmed);
    if (Array.isArray(parsed)) {
      return uniqueCompactStrings(parsed);
    }
    if (trimmed.includes(",")) {
      return uniqueCompactStrings(trimmed.split(","));
    }
    return uniqueCompactStrings([trimmed]);
  }
  return [];
}

export function parseNumberArray(value: unknown): number[] {
  const source = Array.isArray(value) ? value : Array.isArray(parseMaybeJson<unknown>(value, [])) ? (parseMaybeJson<unknown>(value, []) as unknown[]) : parseStringArray(value);
  const numbers = (source as unknown[]).map((entry) => asNumber(entry)).filter((entry): entry is number => entry !== undefined);
  return numbers;
}

function normalizeSingleTag(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized || undefined;
  }
  const record = unknownRecord(value);
  return (
    asString(record.slug)?.toLowerCase() ??
    asString(record.label)?.toLowerCase() ??
    asString(record.name)?.toLowerCase() ??
    asString(record.tag)?.toLowerCase()
  );
}

export function normalizeTagList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return uniqueCompactStrings(raw.map((entry) => normalizeSingleTag(entry)).filter(Boolean)).map((entry) => entry.toLowerCase());
  }
  if (typeof raw === "string") {
    const parsed = parseMaybeJson<unknown>(raw, raw);
    if (Array.isArray(parsed)) {
      return normalizeTagList(parsed);
    }
    return parseStringArray(raw).map((entry) => entry.toLowerCase());
  }
  return [];
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Number(score.toFixed(2))));
}

export function safeDate(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) {
    return undefined;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function textBlob(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTokenAwareKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalizedKeyword) {
    return false;
  }
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`, "i");
  return pattern.test(text);
}

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => hasTokenAwareKeyword(text, keyword));
}

function normalizeCategoryToken(value: string): string {
  return value.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function directCategoryGroup(values: Array<string | undefined>): CategoryGroup | undefined {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = normalizeCategoryToken(value);
    const exact = CATEGORY_ALIAS_MAP[normalized];
    if (exact) {
      return exact;
    }
    for (const token of normalized.split(/[^a-z0-9&]+/).filter(Boolean)) {
      const tokenMatch = CATEGORY_ALIAS_MAP[token];
      if (tokenMatch) {
        return tokenMatch;
      }
    }
  }
  return undefined;
}

function hasSportsEventSignal(text: string): boolean {
  return (
    hasKeyword(text, SPORTS_CONTEXT_KEYWORDS) ||
    /\b[a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){0,3}\s+vs\.?\s+[a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){0,3}\b/i.test(text) ||
    /\bwill\s+[a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){0,4}\s+(?:fc\s+)?win\s+on\s+\d{4}-\d{2}-\d{2}\b/i.test(text) ||
    /\bcompleted\s+match\b/i.test(text)
  );
}

function mergeFilters(base: ListUniverseFilters, override?: ListUniverseFilters): ListUniverseFilters {
  return {
    ...base,
    ...override,
    categoryGroups: override?.categoryGroups ?? base.categoryGroups,
    structuralTypes: override?.structuralTypes ?? base.structuralTypes,
    horizonBuckets: override?.horizonBuckets ?? base.horizonBuckets,
    priceBuckets: override?.priceBuckets ?? base.priceBuckets,
    opportunityModes: override?.opportunityModes ?? base.opportunityModes,
    includeTags: override?.includeTags ?? base.includeTags,
    excludeTags: override?.excludeTags ?? base.excludeTags
  };
}

function parseTokenRecords(rawMarket: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(rawMarket.tokens)) {
    return rawMarket.tokens.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
  }
  const parsed = parseMaybeJson<unknown>(rawMarket.tokens, []);
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function parseCLOBTokenIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueCompactStrings(value);
  }
  if (typeof value === "string") {
    const parsed = parseMaybeJson<unknown>(value, value);
    if (Array.isArray(parsed)) {
      return uniqueCompactStrings(parsed);
    }
    if (value.includes(",")) {
      return uniqueCompactStrings(value.split(","));
    }
  }
  return [];
}

function parseOutcomeStrings(rawMarket: Record<string, unknown>): string[] {
  const direct = parseStringArray(rawMarket.outcomes);
  if (direct.length > 0) {
    return direct;
  }
  const short = parseStringArray(rawMarket.shortOutcomes);
  if (short.length > 0) {
    return short;
  }
  return parseTokenRecords(rawMarket)
    .map((token) => asString(token.outcome))
    .filter((value): value is string => Boolean(value));
}

function parseOutcomePrices(rawMarket: Record<string, unknown>): number[] {
  const direct = parseNumberArray(rawMarket.outcomePrices);
  if (direct.length > 0) {
    return direct;
  }
  return parseTokenRecords(rawMarket)
    .map((token) => asNumber(token.price ?? token.lastPrice))
    .filter((value): value is number => value !== undefined);
}

function inferOutcomeTokenIds(
  rawMarket: Record<string, unknown>,
  outcomes: string[],
  clobTokenIds: string[]
): { yesTokenId?: string; noTokenId?: string } {
  const tokens = parseTokenRecords(rawMarket);
  const fromTokens = tokens.reduce<{ yesTokenId?: string; noTokenId?: string }>((acc, token) => {
    const tokenId = asString(token.token_id ?? token.tokenId);
    const outcome = asString(token.outcome)?.toUpperCase();
    if (!tokenId || !outcome) {
      return acc;
    }
    if (outcome === "YES") {
      acc.yesTokenId = tokenId;
    }
    if (outcome === "NO") {
      acc.noTokenId = tokenId;
    }
    return acc;
  }, {});

  if (fromTokens.yesTokenId || fromTokens.noTokenId) {
    return fromTokens;
  }

  if (outcomes.length >= 2 && clobTokenIds.length >= 2) {
    const normalized = outcomes.map((outcome) => outcome.toUpperCase());
    const yesIndex = normalized.indexOf("YES");
    const noIndex = normalized.indexOf("NO");
    return {
      yesTokenId: yesIndex >= 0 ? clobTokenIds[yesIndex] : undefined,
      noTokenId: noIndex >= 0 ? clobTokenIds[noIndex] : undefined
    };
  }

  return {};
}

export function makeUniverseMarketKey(input: {
  conditionId?: string;
  marketId?: string;
  slug?: string;
  title?: string;
}): string {
  if (input.conditionId) {
    return `condition:${input.conditionId}`;
  }
  if (input.marketId) {
    return `market:${input.marketId}`;
  }
  if (input.slug) {
    return `slug:${input.slug}`;
  }
  const title = input.title?.trim().toLowerCase();
  const hash = createHash("sha256").update(title || "unknown-market").digest("hex").slice(0, 16);
  return `title:${hash}`;
}

function resolveEventRelation(
  rawMarket: Record<string, unknown>,
  rawEvent?: unknown
): Record<string, unknown> | undefined {
  if (rawEvent && typeof rawEvent === "object" && !Array.isArray(rawEvent)) {
    return rawEvent as Record<string, unknown>;
  }
  if (Array.isArray(rawMarket.events) && rawMarket.events[0] && typeof rawMarket.events[0] === "object") {
    return rawMarket.events[0] as Record<string, unknown>;
  }
  return undefined;
}

function categoryFromEvent(eventRecord?: Record<string, unknown>): string | undefined {
  if (!eventRecord) {
    return undefined;
  }
  const category = asString(eventRecord.category);
  if (category) {
    return category;
  }
  const nested = unknownRecord(eventRecord.categoryObj ?? eventRecord.category_obj);
  return asString(nested.name ?? nested.label ?? nested.slug);
}

function computeImpliedProbability(args: {
  midpoint?: number;
  bestBid?: number;
  bestAsk?: number;
  outcomePrices: number[];
  lastTradePrice?: number;
}): number | undefined {
  if (args.midpoint !== undefined) {
    return clampUnitPrice(args.midpoint);
  }
  if (args.bestBid !== undefined && args.bestAsk !== undefined) {
    return clampUnitPrice((args.bestBid + args.bestAsk) / 2);
  }
  if (args.outcomePrices[0] !== undefined) {
    return clampUnitPrice(args.outcomePrices[0]);
  }
  if (args.lastTradePrice !== undefined) {
    return clampUnitPrice(args.lastTradePrice);
  }
  return undefined;
}

function clampUnitPrice(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function asNormalizedOutcome(outcome: string): string {
  return outcome.trim();
}

export function classifyStructuralType(market: Partial<UniverseMarket>): StructuralType {
  const text = textBlob([
    market.title,
    market.description,
    market.eventTitle,
    market.category,
    market.subcategory,
    ...(market.tags ?? [])
  ]);
  const outcomes = (market.outcomes ?? []).map((entry) => entry.toUpperCase());

  const sportsSignal =
    market.categoryGroup === "sports" ||
    hasSportsEventSignal(text) ||
    Boolean(market.sportsMarketType);
  if (sportsSignal) {
    return "live-sports";
  }

  if (hasKeyword(text, ["oscars", "grammy", "celebrity", "meme", "viral", "box office"])) {
    return "novelty";
  }

  const thresholdSignal =
    typeof market.line === "number" ||
    hasKeyword(text, [
      "over",
      "under",
      "above",
      "below",
      "at least",
      "more than",
      "less than",
      "up or down",
      "hit",
      "reach",
      "dip to",
      "range",
      "between",
      "by how much"
    ]) ||
    /[$%]\s*\d|\d+\s*(points|goals|seats|bps|percent|%|\$)/i.test(text);
  if (thresholdSignal) {
    return "threshold-range";
  }

  const isBinary =
    outcomes.length === 2 &&
    outcomes.every((entry) => BINARY_OUTCOMES.has(entry));
  if (isBinary) {
    return "single-binary";
  }

  if (outcomes.length > 2) {
    return "multi-outcome-exclusive";
  }

  if (hasKeyword(text, ["will ", "which of these", "who will"]) && outcomes.length <= 2) {
    return "multi-yes";
  }

  if (
    hasKeyword(text, [
      "lawsuit",
      "case",
      "indict",
      "settlement",
      "process",
      "appointment",
      "nomination",
      "formation"
    ])
  ) {
    return "open-ended-process";
  }

  return "unknown";
}

export function classifyCategoryGroup(market: Partial<UniverseMarket>): CategoryGroup {
  const directGroup = directCategoryGroup([
    market.category,
    market.subcategory,
    ...(market.tags ?? [])
  ]);
  if (directGroup) {
    return directGroup;
  }

  const text = textBlob([
    market.category,
    market.subcategory,
    market.title,
    market.description,
    market.eventTitle,
    ...(market.tags ?? [])
  ]);

  if (hasSportsEventSignal(text)) {
    return "sports";
  }

  for (const [group, keywords] of Object.entries(DEFAULT_CATEGORY_KEYWORDS) as Array<[CategoryGroup, string[]]>) {
    if (group === "other") {
      continue;
    }
    if (hasKeyword(text, keywords)) {
      return group;
    }
  }

  return "other";
}

export function classifyHorizonBucket(endDate: string | undefined, now: Date): HorizonBucket {
  const timestamp = endDate ? Date.parse(endDate) : NaN;
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }
  const diffDays = (timestamp - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1 && diffDays >= -1) {
    return "resolves-today";
  }
  if (diffDays < -1) {
    return "unknown";
  }
  if (diffDays <= 7) {
    return "short-0-7d";
  }
  if (diffDays <= 30) {
    return "near-8-30d";
  }
  if (diffDays <= 120) {
    return "medium-31-120d";
  }
  return "long-120d-plus";
}

export function classifyPriceBucket(impliedProb?: number): PriceBucket {
  if (impliedProb === undefined) {
    return "unknown";
  }
  if (impliedProb < 0.10) {
    return "longshot-0-10c";
  }
  if (impliedProb < 0.30) {
    return "cheap-10-30c";
  }
  if (impliedProb <= 0.70) {
    return "balanced-30-70c";
  }
  if (impliedProb <= 0.90) {
    return "favorite-70-90c";
  }
  return "heavy-favorite-90c-plus";
}

export function classifyLiquidityBucket(liquidityUsd?: number): LiquidityBucket {
  if (liquidityUsd === undefined) {
    return "unknown";
  }
  if (liquidityUsd >= DEFAULT_DISCOVERY_POLICIES.thresholds.deepLiquidityUsdc) {
    return "deep";
  }
  if (liquidityUsd >= DEFAULT_DISCOVERY_POLICIES.thresholds.tradableLiquidityUsdc) {
    return "tradable";
  }
  if (liquidityUsd >= DEFAULT_DISCOVERY_POLICIES.thresholds.thinLiquidityUsdc) {
    return "thin";
  }
  return "dead";
}

export function classifySpreadBucket(spreadCents?: number): SpreadBucket {
  if (spreadCents === undefined) {
    return "unknown";
  }
  if (spreadCents <= DEFAULT_DISCOVERY_POLICIES.thresholds.tightSpreadCents) {
    return "tight-0-1c";
  }
  if (spreadCents <= DEFAULT_DISCOVERY_POLICIES.thresholds.normalSpreadCents) {
    return "normal-1-3c";
  }
  if (spreadCents <= DEFAULT_DISCOVERY_POLICIES.thresholds.wideSpreadCents) {
    return "wide-3-6c";
  }
  return "very-wide-6c-plus";
}

export function scoreLog(value: number | undefined, min: number, max: number): number {
  if (value === undefined || value <= 0 || max <= min || min <= 0) {
    return 0;
  }
  const bounded = Math.max(min, Math.min(max, value));
  const result = ((Math.log(bounded) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 100;
  return clampScore(result);
}

export function scoreLinear(value: number | undefined, min: number, max: number): number {
  if (value === undefined || max <= min) {
    return 0;
  }
  const bounded = Math.max(min, Math.min(max, value));
  return clampScore(((bounded - min) / (max - min)) * 100);
}

export function scoreInverseLinear(value: number | undefined, min: number, max: number): number {
  if (value === undefined || max <= min) {
    return 0;
  }
  const bounded = Math.max(min, Math.min(max, value));
  return clampScore(((max - bounded) / (max - min)) * 100);
}

export function weighted(parts: Array<[number, number]>): number {
  const denominator = parts.reduce((sum, [, weight]) => sum + weight, 0);
  if (denominator <= 0) {
    return 0;
  }
  const numerator = parts.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return clampScore(numerator / denominator);
}

function spreadScore(spreadCents?: number): number {
  return scoreInverseLinear(spreadCents, 0, 10);
}

function liquidityScore(liquidityUsd?: number): number {
  return scoreLog(liquidityUsd, 1_000, 100_000);
}

function volume24hScore(volumeUsd?: number): number {
  return scoreLog(volumeUsd, 100, 50_000);
}

function acceptingOrdersScore(market: Partial<UniverseMarket>): number {
  if (market.acceptingOrders && market.enableOrderBook && market.active && !market.closed) {
    return 100;
  }
  if (market.active && market.closed === false) {
    return 40;
  }
  return 0;
}

function structureScore(structuralType: StructuralType): number {
  switch (structuralType) {
    case "single-binary":
      return 90;
    case "threshold-range":
      return 80;
    case "multi-outcome-exclusive":
      return 70;
    case "live-sports":
      return 65;
    case "multi-yes":
      return 55;
    case "open-ended-process":
    case "novelty":
      return 35;
    default:
      return 45;
  }
}

function resolutionTextScore(market: Partial<UniverseMarket>): number {
  const hasResolutionSource = Boolean(market.resolutionSource);
  const resolutionText = textBlob([market.resolutionText, market.description]);
  if (hasResolutionSource && resolutionText.length > 30) {
    return 100;
  }
  if (hasResolutionSource || resolutionText.length > 30) {
    return 75;
  }
  if (resolutionText.length > 10) {
    return 40;
  }
  return 20;
}

function horizonScore(horizonBucket: HorizonBucket, opportunityMode?: OpportunityMode): number {
  switch (horizonBucket) {
    case "resolves-today":
      return opportunityMode === "resolution-watch" ? 85 : 45;
    case "short-0-7d":
      return 80;
    case "near-8-30d":
      return 90;
    case "medium-31-120d":
      return 70;
    case "long-120d-plus":
      return 45;
    default:
      return 35;
  }
}

function dataAvailabilityScore(market: Partial<UniverseMarket>): number {
  const components = [
    market.clobTokenIds?.length ? 25 : 0,
    market.bestBid !== undefined || market.bestAsk !== undefined ? 25 : 0,
    market.volume24hUsd !== undefined ? 20 : 0,
    market.liquidityUsd !== undefined ? 20 : 0,
    market.endDate ? 10 : 0
  ];
  return clampScore(components.reduce((sum, value) => sum + value, 0));
}

function catalystProxyScore(market: Partial<UniverseMarket>, horizonBucket: HorizonBucket): number {
  const text = textBlob([market.title, market.description, market.eventTitle, market.category, ...(market.tags ?? [])]);
  let score = weighted([
    [horizonScore(horizonBucket), 0.55],
    [acceptingOrdersScore(market), 0.25],
    [market.endDate ? 100 : 20, 0.20]
  ]);
  if (hasKeyword(text, CATALYST_KEYWORDS)) {
    score = clampScore(score + 15);
  }
  return score;
}

function crossMarketProxyScore(market: Partial<UniverseMarket>): number {
  let score = 0;
  if (market.negRisk) {
    score += 35;
  }
  if (market.structuralType === "multi-outcome-exclusive") {
    score += 30;
  }
  if (market.structuralType === "multi-yes" || market.structuralType === "threshold-range") {
    score += 20;
  }
  if (market.eventId || market.seriesSlug || market.seriesTitle) {
    score += 15;
  }
  return clampScore(score);
}

function resolutionAmbiguityProxy(market: Partial<UniverseMarket>, horizonBucket: HorizonBucket): number {
  let score = 0;
  if (!market.resolutionSource) {
    score += 25;
  }
  if (!market.resolutionText && !market.description) {
    score += 20;
  }
  if (market.structuralType === "open-ended-process") {
    score += 25;
  }
  if (market.structuralType === "unknown") {
    score += 15;
  }
  if (horizonBucket === "long-120d-plus" || horizonBucket === "unknown") {
    score += 10;
  }
  if (!market.endDate) {
    score += 10;
  }
  return clampScore(score);
}

function riskScoreFromParts(market: Partial<UniverseMarket>, resolutionAmbiguityScore: number): number {
  const illiquidityPenalty = scoreInverseLinear(market.liquidityUsd, 0, 10_000);
  const wideSpreadPenalty = scoreLinear(market.spreadCents, 0, 10);
  const nearResolutionPenalty = market.horizonBucket === "resolves-today" ? 80 : market.horizonBucket === "short-0-7d" ? 35 : 0;
  const blockedCategoryPenalty = market.categoryGroup === "culture" ? 15 : 0;
  return weighted([
    [resolutionAmbiguityScore, 0.35],
    [illiquidityPenalty, 0.25],
    [wideSpreadPenalty, 0.15],
    [nearResolutionPenalty, 0.15],
    [blockedCategoryPenalty, 0.10]
  ]);
}

function reasonCodesForMarket(market: Partial<UniverseMarket>): string[] {
  const reasons: string[] = [];
  if (market.structuralType === "single-binary") {
    reasons.push("binary_market");
  }
  if ((market.resolutionText?.length ?? 0) > 0 || (market.resolutionSource?.length ?? 0) > 0) {
    reasons.push("clear_resolution_text");
  }
  if ((market.liquidityUsd ?? 0) >= 10_000) {
    reasons.push("tradable_liquidity");
  }
  if ((market.spreadCents ?? 100) <= 3) {
    reasons.push("acceptable_spread");
  }
  if ((market.volume24hUsd ?? 0) > 0 && (market.liquidityUsd ?? 0) > (market.volume24hUsd ?? 0) * 3) {
    reasons.push("low_attention_relative_to_liquidity");
  }
  if (market.horizonBucket === "short-0-7d" || market.horizonBucket === "near-8-30d") {
    reasons.push("defined_catalyst_window");
  }
  if (market.negRisk) {
    reasons.push("neg_risk_cluster");
  }
  if (market.restricted) {
    reasons.push("restricted_flag_present");
  }
  return uniqueCompactStrings(reasons);
}

function disqualifiersForMarket(
  market: Partial<UniverseMarket>,
  policies: DiscoveryPolicies,
  resolutionAmbiguityScore: number,
  now: Date
): string[] {
  const disqualifiers: string[] = [];
  if (market.closed || market.archived || market.active === false || market.acceptingOrders === false) {
    disqualifiers.push("inactive_or_not_accepting_orders");
  }
  if (market.endDate) {
    const endTimestamp = Date.parse(market.endDate);
    if (Number.isFinite(endTimestamp) && endTimestamp < now.getTime() - 60 * 60 * 1000) {
      disqualifiers.push("market_already_ended");
    }
  }
  if ((market.clobTokenIds?.length ?? 0) === 0) {
    disqualifiers.push("missing_clob_tokens");
  }
  if ((market.liquidityUsd ?? 0) < policies.thresholds.thinLiquidityUsdc) {
    disqualifiers.push("dead_liquidity");
  }
  if (resolutionAmbiguityScore > 75) {
    disqualifiers.push("severe_resolution_ambiguity");
  }
  const blockedTags = (market.tags ?? []).filter((tag) =>
    policies.preferences.blockedTags.includes(tag.toLowerCase())
  );
  if (blockedTags.length > 0) {
    disqualifiers.push(`blocked_tags:${blockedTags.join(",")}`);
  }
  if (market.categoryGroup && policies.preferences.blockedCategoryGroups.includes(market.categoryGroup)) {
    disqualifiers.push(`blocked_category:${market.categoryGroup}`);
  }
  return uniqueCompactStrings(disqualifiers);
}

export function chooseOpportunityMode(market: UniverseMarket): OpportunityMode {
  if (
    market.closed ||
    market.archived ||
    (market.acceptingOrders === false && market.active === false) ||
    market.disqualifiers.some((entry) => entry.startsWith("blocked_")) ||
    market.disqualifiers.includes("market_already_ended") ||
    market.disqualifiers.includes("missing_clob_tokens") ||
    market.disqualifiers.includes("dead_liquidity") ||
    market.resolutionAmbiguityScore >= 80
  ) {
    return "avoid";
  }

  const nearResolution =
    market.horizonBucket === "resolves-today" ||
    (market.endDate ? Date.parse(market.endDate) - Date.now() <= 72 * 60 * 60 * 1000 : false);
  if (nearResolution && Boolean(market.resolutionText || market.resolutionSource)) {
    return "resolution-watch";
  }

  if (
    market.makerScore >= 60 &&
    (market.liquidityBucket === "tradable" || market.liquidityBucket === "deep") &&
    (market.spreadBucket === "normal-1-3c" || market.spreadBucket === "wide-3-6c") &&
    market.acceptingOrders !== false &&
    market.enableOrderBook !== false
  ) {
    return "market-making";
  }

  if (market.crossMarketScore >= 45) {
    return "cross-market-check";
  }

  if (
    market.tradabilityScore >= 70 &&
    market.modelabilityScore >= 70 &&
    market.resolutionAmbiguityScore <= 35 &&
    market.acceptingOrders !== false
  ) {
    return "execution-ready";
  }

  return "deep-research";
}

function computeUniverseScores(
  market: UniverseMarket,
  policies: DiscoveryPolicies,
  now = new Date()
): UniverseMarket {
  const structure = structureScore(market.structuralType);
  const resolution = resolutionTextScore(market);
  const categoryPrior = policies.preferences.categoryGroups[market.categoryGroup];
  const dataAvailability = dataAvailabilityScore(market);

  const tradability = weighted([
    [spreadScore(market.spreadCents), 0.35],
    [liquidityScore(market.liquidityUsd), 0.30],
    [volume24hScore(market.volume24hUsd), 0.20],
    [acceptingOrdersScore(market), 0.15]
  ]);

  const provisionalOpportunityMode = market.opportunityMode;
  const modelability = weighted([
    [structure, 0.30],
    [resolution, 0.25],
    [categoryPrior, 0.20],
    [horizonScore(market.horizonBucket, provisionalOpportunityMode), 0.15],
    [dataAvailability, 0.10]
  ]);

  const resolutionAmbiguity = resolutionAmbiguityProxy(market, market.horizonBucket);
  const attentionGap = weighted([
    [modelability, 0.50],
    [liquidityScore(market.liquidityUsd), 0.30],
    [scoreInverseLinear(volume24hScore(market.volume24hUsd), 0, 100), 0.20]
  ]);
  const catalyst = catalystProxyScore(market, market.horizonBucket);
  const crossMarket = crossMarketProxyScore(market);
  const risk = riskScoreFromParts(market, resolutionAmbiguity);
  const riskPenalty = risk * 0.25;

  const researchPriority = clampScore(
    weighted([
      [modelability, 0.35],
      [tradability, 0.25],
      [catalyst, 0.15],
      [attentionGap, 0.15],
      [categoryPrior, 0.10]
    ]) - riskPenalty
  );

  const tradeOpportunity = clampScore(
    weighted([
      [tradability, 0.45],
      [modelability, 0.30],
      [catalyst, 0.15],
      [attentionGap, 0.10]
    ]) - riskPenalty
  );

  const maker = clampScore(
    weighted([
      [scoreLinear(market.spreadCents, 1, 6), 0.40],
      [liquidityScore(market.liquidityUsd), 0.30],
      [acceptingOrdersScore(market), 0.20],
      [market.enableOrderBook ? 60 : 0, 0.10]
    ]) - riskPenalty
  );

  const reasonCodes = reasonCodesForMarket({
    ...market,
    modelabilityScore: modelability,
    tradabilityScore: tradability
  });
  const disqualifiers = disqualifiersForMarket(market, policies, resolutionAmbiguity, now);

  const withScores: UniverseMarket = {
    ...market,
    modelabilityScore: modelability,
    tradabilityScore: tradability,
    catalystScore: catalyst,
    resolutionAmbiguityScore: resolutionAmbiguity,
    attentionGapScore: attentionGap,
    crossMarketScore: crossMarket,
    researchPriorityScore: researchPriority,
    tradeOpportunityScore: tradeOpportunity,
    makerScore: maker,
    riskScore: risk,
    reasonCodes,
    disqualifiers
  };

  return {
    ...withScores,
    opportunityMode: chooseOpportunityMode(withScores)
  };
}

export function normalizeUniverseMarketFromGammaMarket(
  rawMarket: unknown,
  options?: {
    rawEvent?: unknown;
    source?: UniverseSource;
    now?: Date;
    policies?: DiscoveryPolicies;
  }
): UniverseMarket {
  const source = options?.source ?? "markets_keyset";
  const now = options?.now ?? new Date();
  const policies = options?.policies ?? DEFAULT_DISCOVERY_POLICIES;
  const marketRecord = unknownRecord(rawMarket);
  const eventRecord = resolveEventRelation(marketRecord, options?.rawEvent);

  const title =
    asString(marketRecord.question) ??
    asString(marketRecord.title) ??
    asString(marketRecord.marketTitle) ??
    asString(eventRecord?.title) ??
    "Untitled market";
  const marketId = asString(marketRecord.id ?? marketRecord.market ?? marketRecord.marketId);
  const conditionId = asString(marketRecord.conditionId ?? marketRecord.condition_id);
  const slug = asString(marketRecord.slug);

  const outcomes = parseOutcomeStrings(marketRecord).map(asNormalizedOutcome);
  const outcomePrices = parseOutcomePrices(marketRecord);
  const clobTokenIds = [
    ...parseCLOBTokenIds(marketRecord.clobTokenIds ?? marketRecord.clob_token_ids),
    ...parseTokenRecords(marketRecord)
      .map((token) => asString(token.token_id ?? token.tokenId))
      .filter((value): value is string => Boolean(value))
  ];
  const uniqueTokenIds = uniqueCompactStrings(clobTokenIds);
  const { yesTokenId, noTokenId } = inferOutcomeTokenIds(marketRecord, outcomes, uniqueTokenIds);

  const eventTags = normalizeTagList(eventRecord?.tags);
  const marketTags = normalizeTagList(marketRecord.tags);
  const tags = uniqueCompactStrings([...marketTags, ...eventTags]).map((entry) => entry.toLowerCase());

  const bestBid = asNumber(marketRecord.bestBid);
  const bestAsk = asNumber(marketRecord.bestAsk);
  const midpoint = asNumber(marketRecord.midpoint) ??
    (bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestBid + bestAsk) / 2).toFixed(6))
      : undefined);
  const lastTradePrice = asNumber(marketRecord.lastTradePrice);
  const spreadCents = asNumber(marketRecord.spread) ??
    (bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestAsk - bestBid) * 100).toFixed(2))
      : undefined);

  const endDateIso = safeDate(
    marketRecord.endDateIso ??
    marketRecord.endDate ??
    marketRecord.umaEndDateIso ??
    eventRecord?.endDateIso ??
    eventRecord?.endDate
  );
  const endDate = endDateIso ?? safeDate(marketRecord.endDate ?? eventRecord?.endDate);

  const market: UniverseMarket = {
    marketKey: makeUniverseMarketKey({ conditionId, marketId, slug, title }),
    source,
    marketId,
    conditionId,
    questionId: asString(marketRecord.questionId ?? marketRecord.question_id),
    eventId: asString(eventRecord?.id ?? marketRecord.eventId ?? marketRecord.event_id),
    eventSlug: asString(eventRecord?.slug),
    eventTitle: asString(eventRecord?.title),
    seriesSlug: asString(eventRecord?.seriesSlug ?? eventRecord?.series_slug),
    seriesTitle: asString(eventRecord?.seriesTitle ?? eventRecord?.series_title),
    slug,
    title,
    description:
      asString(marketRecord.description) ??
      asString(eventRecord?.description),
    resolutionSource: asString(marketRecord.resolutionSource ?? marketRecord.resolution_source),
    resolutionText:
      asString(marketRecord.resolutionSource ?? marketRecord.resolution_source) ??
      asString(marketRecord.resolutionText ?? marketRecord.description) ??
      asString(eventRecord?.description),
    category: asString(marketRecord.category) ?? categoryFromEvent(eventRecord),
    subcategory: asString(marketRecord.subcategory ?? marketRecord.subCategory),
    tags,
    outcomes,
    outcomePrices,
    clobTokenIds: uniqueTokenIds,
    yesTokenId,
    noTokenId,
    active: asBoolean(marketRecord.active),
    closed: asBoolean(marketRecord.closed),
    archived: asBoolean(marketRecord.archived),
    restricted: asBoolean(marketRecord.restricted),
    acceptingOrders: asBoolean(marketRecord.acceptingOrders ?? marketRecord.accepting_orders),
    enableOrderBook: asBoolean(marketRecord.enableOrderBook ?? marketRecord.enable_order_book),
    ready: asBoolean(marketRecord.ready),
    funded: asBoolean(marketRecord.funded),
    startDate: safeDate(
      marketRecord.startDateIso ??
      marketRecord.startDate ??
      eventRecord?.startDateIso ??
      eventRecord?.startDate
    ),
    endDate,
    endDateIso,
    eventStartTime: safeDate(
      marketRecord.eventStartTime ??
      marketRecord.gameStartTime ??
      eventRecord?.eventStartTime
    ),
    createdAt: safeDate(marketRecord.createdAt),
    updatedAt: safeDate(marketRecord.updatedAt),
    liquidityUsd: firstDefined(
      asNumber(marketRecord.liquidityNum),
      asNumber(marketRecord.liquidityClob),
      asNumber(marketRecord.liquidity),
      asNumber(eventRecord?.liquidityNum),
      asNumber(eventRecord?.liquidity)
    ),
    liquidityClobUsd: asNumber(marketRecord.liquidityClob),
    volumeUsd: firstDefined(
      asNumber(marketRecord.volumeNum),
      asNumber(marketRecord.volumeClob),
      asNumber(marketRecord.volume),
      asNumber(eventRecord?.volumeNum),
      asNumber(eventRecord?.volume)
    ),
    volume24hUsd: firstDefined(
      asNumber(marketRecord.volume24hr),
      asNumber(marketRecord.volume24hrClob)
    ),
    volume7dUsd: asNumber(marketRecord.volume1wk),
    volume30dUsd: asNumber(marketRecord.volume1mo),
    openInterestUsd: asNumber(marketRecord.openInterest ?? marketRecord.open_interest),
    impliedProb: computeImpliedProbability({
      midpoint,
      bestBid,
      bestAsk,
      outcomePrices,
      lastTradePrice
    }),
    lastTradePrice,
    bestBid,
    bestAsk,
    midpoint,
    spreadCents,
    orderPriceMinTickSize: asNumber(marketRecord.orderPriceMinTickSize),
    orderMinSize: asNumber(marketRecord.orderMinSize),
    negRisk: asBoolean(marketRecord.negRisk ?? marketRecord.negRiskOther ?? eventRecord?.negRisk),
    sportsMarketType: asString(marketRecord.sportsMarketType),
    line: asNumber(marketRecord.line),
    depthUsdWithin2c: undefined,
    depthUsdWithin5c: undefined,
    slippageCentsAt50Usd: undefined,
    slippageCentsAt250Usd: undefined,
    structuralType: "unknown",
    categoryGroup: "other",
    horizonBucket: "unknown",
    priceBucket: "unknown",
    liquidityBucket: "unknown",
    spreadBucket: "unknown",
    opportunityMode: "deep-research",
    modelabilityScore: 0,
    tradabilityScore: 0,
    catalystScore: 0,
    resolutionAmbiguityScore: 0,
    attentionGapScore: 0,
    crossMarketScore: 0,
    researchPriorityScore: 0,
    tradeOpportunityScore: 0,
    makerScore: 0,
    riskScore: 0,
    reasonCodes: [],
    disqualifiers: [],
    rawGammaMarket: rawMarket,
    rawGammaEvent: options?.rawEvent
  };

  const categoryGroup = classifyCategoryGroup(market);
  const structuralType = classifyStructuralType({ ...market, categoryGroup });
  const horizonBucket = classifyHorizonBucket(market.endDate, now);
  const priceBucket = classifyPriceBucket(market.impliedProb);
  const liquidityBucket =
    market.closed || market.acceptingOrders === false
      ? "dead"
      : classifyLiquidityBucket(market.liquidityUsd);
  const spreadBucket = classifySpreadBucket(market.spreadCents);

  return computeUniverseScores(
    {
      ...market,
      structuralType,
      categoryGroup,
      horizonBucket,
      priceBucket,
      liquidityBucket,
      spreadBucket
    },
    policies,
    now
  );
}

function buildEndpointUrl(baseUrl: string, endpointPath: string): URL {
  const base = new URL(baseUrl);
  if (base.pathname && base.pathname !== "/") {
    const normalizedBasePath = base.pathname.endsWith("/")
      ? base.pathname.slice(0, -1)
      : base.pathname;
    return new URL(`${normalizedBasePath}${endpointPath}`, `${base.protocol}//${base.host}`);
  }
  return new URL(endpointPath, base);
}

async function requestJson<T>(url: URL): Promise<T> {
  const configuredTimeoutMs = Number(process.env.POLYMARKET_UNIVERSE_REQUEST_TIMEOUT_MS ?? "20000");
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 20_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "codex-polymarket/market-universe"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} for ${url.toString()}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms for ${url.toString()}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseKeysetPayload(raw: unknown): { items: unknown[]; nextCursor?: string } {
  if (Array.isArray(raw)) {
    return { items: raw };
  }
  const record = unknownRecord(raw);
  const items =
    Array.isArray(record.markets) ? record.markets :
    Array.isArray(record.events) ? record.events :
    Array.isArray(record.data) ? record.data :
    Array.isArray(record.results) ? record.results :
    [];
  return {
    items,
    nextCursor: asString(record.next_cursor ?? record.nextCursor)
  };
}

export async function fetchMarketsKeysetPage(
  config: RuntimeConfig,
  args: FetchMarketsKeysetPageArgs
): Promise<{ markets: unknown[]; nextCursor?: string; raw: unknown }> {
  const url = buildEndpointUrl(config.gammaUrl, "/markets/keyset");
  url.searchParams.set("limit", String(Math.max(1, Math.min(1000, args.limit ?? 1000))));
  url.searchParams.set("closed", String(args.closed ?? false));
  url.searchParams.set("include_tag", String(args.includeTag ?? true));
  url.searchParams.set("order", args.order ?? "volume_num,liquidity_num");
  url.searchParams.set("ascending", String(args.ascending ?? false));
  if (args.afterCursor) {
    url.searchParams.set("after_cursor", args.afterCursor);
  }
  if (args.liquidityNumMin !== undefined) {
    url.searchParams.set("liquidity_num_min", String(args.liquidityNumMin));
  }
  if (args.volumeNumMin !== undefined) {
    url.searchParams.set("volume_num_min", String(args.volumeNumMin));
  }

  const raw = await requestJson<unknown>(url);
  const payload = parseKeysetPayload(raw);
  return {
    markets: payload.items,
    nextCursor: payload.nextCursor,
    raw
  };
}

export async function fetchAllMarketsKeyset(
  config: RuntimeConfig,
  args: IngestMarketUniverseArgs
): Promise<{ markets: unknown[]; pageCount: number; rawPages: unknown[] }> {
  const rawPages: unknown[] = [];
  const markets: unknown[] = [];
  const seenCursors = new Set<string>();
  const limitPages = Math.max(1, args.limitPages ?? Number.MAX_SAFE_INTEGER);

  let afterCursor: string | undefined;
  let pageCount = 0;
  while (pageCount < limitPages) {
    if (afterCursor && seenCursors.has(afterCursor)) {
      break;
    }
    if (afterCursor) {
      seenCursors.add(afterCursor);
    }
    const page = await fetchMarketsKeysetPage(config, {
      limit: args.pageSize,
      afterCursor,
      closed: args.includeClosed ? undefined : false,
      includeTag: args.includeTags,
      liquidityNumMin: args.minLiquidityUsdc,
      order: args.order,
      ascending: args.ascending
    });
    rawPages.push(page.raw);
    markets.push(...page.markets);
    pageCount += 1;
    if (!page.nextCursor) {
      break;
    }
    afterCursor = page.nextCursor;
  }

  return { markets, pageCount, rawPages };
}

export async function fetchMarketsListPage(
  config: RuntimeConfig,
  args: FetchMarketsKeysetPageArgs
): Promise<{ markets: unknown[]; raw: unknown }> {
  const url = buildEndpointUrl(config.gammaUrl, "/markets");
  url.searchParams.set("limit", String(Math.max(1, Math.min(1000, args.limit ?? 1000))));
  url.searchParams.set("closed", String(args.closed ?? false));
  url.searchParams.set("active", String(!(args.closed ?? false)));
  url.searchParams.set("include_tag", String(args.includeTag ?? true));
  url.searchParams.set("order", args.order ?? "volume24hr");
  url.searchParams.set("ascending", String(args.ascending ?? false));
  url.searchParams.set("offset", String(Math.max(0, args.offset ?? 0)));
  if (args.liquidityNumMin !== undefined) {
    url.searchParams.set("liquidity_num_min", String(args.liquidityNumMin));
  }
  if (args.volumeNumMin !== undefined) {
    url.searchParams.set("volume_num_min", String(args.volumeNumMin));
  }

  const raw = await requestJson<unknown>(url);
  const payload = parseKeysetPayload(raw);
  return {
    markets: payload.items,
    raw
  };
}

export async function fetchAllMarketsList(
  config: RuntimeConfig,
  args: IngestMarketUniverseArgs,
  pools: Array<Pick<FetchMarketsKeysetPageArgs, "order" | "ascending" | "volumeNumMin">> = [
    { order: "volume24hr", ascending: false },
    { order: "createdAt", ascending: false },
    { order: "endDate", ascending: true }
  ]
): Promise<{ markets: unknown[]; pageCount: number; rawPages: unknown[] }> {
  const rawPages: unknown[] = [];
  const markets: unknown[] = [];
  const pageSize = Math.max(1, Math.min(1000, args.pageSize ?? 1000));
  const limitPages = Math.max(1, args.limitPages ?? 1);

  for (const pool of pools) {
    for (let page = 0; page < limitPages; page += 1) {
      const result = await fetchMarketsListPage(config, {
        limit: pageSize,
        offset: page * pageSize,
        closed: args.includeClosed ? undefined : false,
        includeTag: args.includeTags,
        liquidityNumMin: args.minLiquidityUsdc,
        order: pool.order,
        ascending: pool.ascending,
        volumeNumMin: pool.volumeNumMin
      });
      rawPages.push(result.raw);
      markets.push(...result.markets);
      if (result.markets.length < pageSize) {
        break;
      }
    }
  }

  return { markets, pageCount: rawPages.length, rawPages };
}

export async function fetchEventsKeysetPage(
  config: RuntimeConfig,
  args: FetchMarketsKeysetPageArgs
): Promise<{ events: unknown[]; nextCursor?: string; raw: unknown }> {
  const url = buildEndpointUrl(config.gammaUrl, "/events/keyset");
  url.searchParams.set("limit", String(Math.max(1, Math.min(1000, args.limit ?? 1000))));
  url.searchParams.set("closed", String(args.closed ?? false));
  url.searchParams.set("include_tag", String(args.includeTag ?? true));
  url.searchParams.set("order", args.order ?? "volume_num,liquidity_num");
  url.searchParams.set("ascending", String(args.ascending ?? false));
  if (args.afterCursor) {
    url.searchParams.set("after_cursor", args.afterCursor);
  }
  if (args.liquidityNumMin !== undefined) {
    url.searchParams.set("liquidity_num_min", String(args.liquidityNumMin));
  }
  if (args.volumeNumMin !== undefined) {
    url.searchParams.set("volume_num_min", String(args.volumeNumMin));
  }

  const raw = await requestJson<unknown>(url);
  const payload = parseKeysetPayload(raw);
  return {
    events: payload.items,
    nextCursor: payload.nextCursor,
    raw
  };
}

export async function fetchEventsListPage(
  config: RuntimeConfig,
  args: FetchMarketsKeysetPageArgs
): Promise<{ events: unknown[]; raw: unknown }> {
  const url = buildEndpointUrl(config.gammaUrl, "/events");
  url.searchParams.set("limit", String(Math.max(1, Math.min(1000, args.limit ?? 1000))));
  url.searchParams.set("closed", String(args.closed ?? false));
  url.searchParams.set("active", String(!(args.closed ?? false)));
  url.searchParams.set("include_tag", String(args.includeTag ?? true));
  url.searchParams.set("order", args.order ?? "volume24hr");
  url.searchParams.set("ascending", String(args.ascending ?? false));
  url.searchParams.set("offset", String(Math.max(0, args.offset ?? 0)));
  if (args.liquidityNumMin !== undefined) {
    url.searchParams.set("liquidity_num_min", String(args.liquidityNumMin));
  }
  if (args.volumeNumMin !== undefined) {
    url.searchParams.set("volume_num_min", String(args.volumeNumMin));
  }

  const raw = await requestJson<unknown>(url);
  const payload = parseKeysetPayload(raw);
  return {
    events: payload.items,
    raw
  };
}

export async function fetchAllEventsList(
  config: RuntimeConfig,
  args: IngestMarketUniverseArgs,
  pools: Array<Pick<FetchMarketsKeysetPageArgs, "order" | "ascending" | "volumeNumMin">> = [
    { order: "volume24hr", ascending: false },
    { order: "createdAt", ascending: false },
    { order: "endDate", ascending: true }
  ]
): Promise<{ events: unknown[]; pageCount: number; rawPages: unknown[] }> {
  const rawPages: unknown[] = [];
  const events: unknown[] = [];
  const pageSize = Math.max(1, Math.min(1000, args.pageSize ?? 1000));
  const limitPages = Math.max(1, args.limitPages ?? 1);

  for (const pool of pools) {
    for (let page = 0; page < limitPages; page += 1) {
      const result = await fetchEventsListPage(config, {
        limit: pageSize,
        offset: page * pageSize,
        closed: args.includeClosed ? undefined : false,
        includeTag: args.includeTags,
        liquidityNumMin: args.minLiquidityUsdc,
        order: pool.order,
        ascending: pool.ascending,
        volumeNumMin: pool.volumeNumMin
      });
      rawPages.push(result.raw);
      events.push(...result.events);
      if (result.events.length < pageSize) {
        break;
      }
    }
  }

  return { events, pageCount: rawPages.length, rawPages };
}

export function flattenEventsToUniverseMarkets(
  events: unknown[],
  options?: { now?: Date; policies?: DiscoveryPolicies }
): UniverseMarket[] {
  return events.flatMap((event) => {
    const eventRecord = unknownRecord(event);
    const nestedMarkets = Array.isArray(eventRecord.markets) ? eventRecord.markets : [];
    return nestedMarkets.map((market) =>
      normalizeUniverseMarketFromGammaMarket(market, {
        rawEvent: event,
        source: "events_keyset",
        now: options?.now,
        policies: options?.policies
      })
    );
  });
}

function mergeUniverseMarkets(markets: UniverseMarket[]): UniverseMarket[] {
  const byKey = new Map<string, UniverseMarket>();
  for (const market of markets) {
    const existing = byKey.get(market.marketKey);
    if (!existing) {
      byKey.set(market.marketKey, market);
      continue;
    }
    byKey.set(market.marketKey, computeUniverseScores({
      ...existing,
      ...market,
      tags: uniqueCompactStrings([...(existing.tags ?? []), ...(market.tags ?? [])]),
      outcomes: existing.outcomes.length >= market.outcomes.length ? existing.outcomes : market.outcomes,
      outcomePrices: existing.outcomePrices.length >= market.outcomePrices.length ? existing.outcomePrices : market.outcomePrices,
      clobTokenIds: uniqueCompactStrings([...(existing.clobTokenIds ?? []), ...(market.clobTokenIds ?? [])]),
      reasonCodes: uniqueCompactStrings([...(existing.reasonCodes ?? []), ...(market.reasonCodes ?? [])]),
      disqualifiers: uniqueCompactStrings([...(existing.disqualifiers ?? []), ...(market.disqualifiers ?? [])])
    }, DEFAULT_DISCOVERY_POLICIES));
  }
  return Array.from(byKey.values());
}

export async function loadDiscoveryPolicies(configPath: string): Promise<DiscoveryPolicies> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = (YAML.parse(raw) ?? {}) as Record<string, unknown>;
    const defaultsRecord = unknownRecord(parsed.defaults);
    const thresholdsRecord = unknownRecord(parsed.thresholds);
    const preferencesRecord = unknownRecord(parsed.preferences);
    const rawProfiles = unknownRecord(parsed.profiles);

    const categoryGroups = { ...DEFAULT_DISCOVERY_POLICIES.preferences.categoryGroups };
    for (const group of Object.keys(categoryGroups) as CategoryGroup[]) {
      const candidate = asNumber(unknownRecord(preferencesRecord.category_groups)[group]);
      if (candidate !== undefined) {
        categoryGroups[group] = candidate;
      }
    }

    const profiles = { ...DEFAULT_DISCOVERY_POLICIES.profiles };
    for (const [profile, value] of Object.entries(rawProfiles)) {
      if (
        profile === "clean-short-term" ||
        profile === "liquid-politics" ||
        profile === "macro-catalyst" ||
        profile === "market-making" ||
        profile === "longshot-research" ||
        profile === "resolution-watch" ||
        profile === "cross-market"
      ) {
        const record = unknownRecord(value);
        profiles[profile] = {
          view: record.view as UniverseView | undefined,
          categoryGroups: Array.isArray(record.category_groups) ? record.category_groups.map(String) as CategoryGroup[] : undefined,
          horizonBuckets: Array.isArray(record.horizon_buckets) ? record.horizon_buckets.map(String) as HorizonBucket[] : undefined,
          priceBuckets: Array.isArray(record.price_buckets) ? record.price_buckets.map(String) as PriceBucket[] : undefined,
          minLiquidityUsdc: asNumber(record.min_liquidity_usdc),
          minTradabilityScore: asNumber(record.min_tradability_score),
          maxResolutionAmbiguityScore: asNumber(record.max_resolution_ambiguity_score),
          maxSpreadCents: asNumber(record.max_spread_cents),
          sort: asString(record.sort) as ListUniverseFilters["sort"] | undefined
        };
      }
    }

    return {
      version: asNumber(parsed.version) ?? DEFAULT_DISCOVERY_POLICIES.version,
      defaults: {
        pageSize: asNumber(defaultsRecord.page_size) ?? DEFAULT_DISCOVERY_POLICIES.defaults.pageSize,
        source: (asString(defaultsRecord.source) as UniverseSource | undefined) ?? DEFAULT_DISCOVERY_POLICIES.defaults.source,
        includeTags: asBoolean(defaultsRecord.include_tags) ?? DEFAULT_DISCOVERY_POLICIES.defaults.includeTags,
        activeOnly: asBoolean(defaultsRecord.active_only) ?? DEFAULT_DISCOVERY_POLICIES.defaults.activeOnly,
        includeClosed: asBoolean(defaultsRecord.include_closed) ?? DEFAULT_DISCOVERY_POLICIES.defaults.includeClosed,
        order: asString(defaultsRecord.order) ?? DEFAULT_DISCOVERY_POLICIES.defaults.order,
        ascending: asBoolean(defaultsRecord.ascending) ?? DEFAULT_DISCOVERY_POLICIES.defaults.ascending,
        enrichTopN: asNumber(defaultsRecord.enrich_top_n) ?? DEFAULT_DISCOVERY_POLICIES.defaults.enrichTopN,
        enrichmentProfile:
          (asString(defaultsRecord.enrichment_profile) as EnrichmentProfile | undefined) ??
          DEFAULT_DISCOVERY_POLICIES.defaults.enrichmentProfile,
        minLiquidityUsdc:
          asNumber(defaultsRecord.min_liquidity_usdc) ??
          DEFAULT_DISCOVERY_POLICIES.defaults.minLiquidityUsdc
      },
      thresholds: {
        deepLiquidityUsdc:
          asNumber(thresholdsRecord.deep_liquidity_usdc) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.deepLiquidityUsdc,
        tradableLiquidityUsdc:
          asNumber(thresholdsRecord.tradable_liquidity_usdc) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.tradableLiquidityUsdc,
        thinLiquidityUsdc:
          asNumber(thresholdsRecord.thin_liquidity_usdc) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.thinLiquidityUsdc,
        tightSpreadCents:
          asNumber(thresholdsRecord.tight_spread_cents) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.tightSpreadCents,
        normalSpreadCents:
          asNumber(thresholdsRecord.normal_spread_cents) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.normalSpreadCents,
        wideSpreadCents:
          asNumber(thresholdsRecord.wide_spread_cents) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.wideSpreadCents,
        maxGoodResolutionAmbiguityScore:
          asNumber(thresholdsRecord.max_good_resolution_ambiguity_score) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.maxGoodResolutionAmbiguityScore,
        minGoodTradabilityScore:
          asNumber(thresholdsRecord.min_good_tradability_score) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.minGoodTradabilityScore,
        minGoodResearchPriorityScore:
          asNumber(thresholdsRecord.min_good_research_priority_score) ??
          DEFAULT_DISCOVERY_POLICIES.thresholds.minGoodResearchPriorityScore
      },
      preferences: {
        categoryGroups,
        blockedTags: parseStringArray(preferencesRecord.blocked_tags).map((entry) => entry.toLowerCase()),
        blockedCategoryGroups:
          parseStringArray(preferencesRecord.blocked_category_groups) as CategoryGroup[]
      },
      profiles
    };
  } catch {
    return DEFAULT_DISCOVERY_POLICIES;
  }
}

export function filtersForCandidateProfile(
  profile: CandidateProfile,
  policies: DiscoveryPolicies = DEFAULT_DISCOVERY_POLICIES
): ListUniverseFilters {
  const defaults: Record<CandidateProfile, ListUniverseFilters> = {
    "clean-short-term": {
      view: "clean_catalyst_bets",
      horizonBuckets: ["short-0-7d", "near-8-30d"],
      minTradabilityScore: 65,
      maxResolutionAmbiguityScore: 35,
      sort: "research_priority_desc"
    },
    "liquid-politics": {
      view: "best_research_candidates",
      categoryGroups: ["politics"],
      minLiquidityUsdc: 25_000,
      maxSpreadCents: 3,
      sort: "research_priority_desc"
    },
    "macro-catalyst": {
      view: "clean_catalyst_bets",
      categoryGroups: ["economics", "finance", "crypto"],
      horizonBuckets: ["short-0-7d", "near-8-30d", "medium-31-120d"],
      sort: "research_priority_desc"
    },
    "market-making": {
      view: "market_making_candidates",
      minLiquidityUsdc: 10_000,
      sort: "maker_score_desc"
    },
    "longshot-research": {
      view: "low_attention_modelable",
      priceBuckets: ["longshot-0-10c", "cheap-10-30c"],
      minTradabilityScore: 45,
      sort: "attention_gap_desc"
    },
    "resolution-watch": {
      view: "resolution_watch",
      horizonBuckets: ["resolves-today", "short-0-7d"],
      sort: "ending_soon"
    },
    "cross-market": {
      view: "cross_market_dislocations",
      sort: "research_priority_desc"
    }
  };

  return mergeFilters(defaults[profile], policies.profiles[profile]);
}

export function applyUniverseViewDefaults(
  filters: ListUniverseFilters,
  policies: DiscoveryPolicies = DEFAULT_DISCOVERY_POLICIES
): ListUniverseFilters {
  const base = { ...filters };
  switch (filters.view) {
    case "best_research_candidates":
      return mergeFilters(
        {
          opportunityModes: ["deep-research", "execution-ready", "market-making", "cross-market-check", "resolution-watch"],
          maxResolutionAmbiguityScore: 60,
          sort: "research_priority_desc"
        },
        base
      );
    case "clean_catalyst_bets":
      return mergeFilters(
        {
          horizonBuckets: ["short-0-7d", "near-8-30d", "medium-31-120d"],
          opportunityModes: ["deep-research", "execution-ready", "resolution-watch"],
          minTradabilityScore: 50,
          maxResolutionAmbiguityScore: 45,
          sort: "research_priority_desc"
        },
        base
      );
    case "execution_ready":
      return mergeFilters(
        {
          opportunityModes: ["execution-ready"],
          minTradabilityScore: policies.thresholds.minGoodTradabilityScore,
          minResearchPriorityScore: policies.thresholds.minGoodResearchPriorityScore,
          maxResolutionAmbiguityScore: policies.thresholds.maxGoodResolutionAmbiguityScore,
          sort: "trade_opportunity_desc"
        },
        base
      );
    case "market_making_candidates":
      return mergeFilters(
        {
          opportunityModes: ["market-making"],
          minLiquidityUsdc: policies.thresholds.tradableLiquidityUsdc,
          maxSpreadCents: policies.thresholds.wideSpreadCents,
          sort: "maker_score_desc"
        },
        base
      );
    case "cross_market_dislocations":
      return mergeFilters(
        {
          opportunityModes: ["cross-market-check"],
          sort: "research_priority_desc"
        },
        base
      );
    case "resolution_watch":
      return mergeFilters(
        {
          horizonBuckets: ["resolves-today", "short-0-7d"],
          opportunityModes: ["resolution-watch"],
          sort: "ending_soon"
        },
        base
      );
    case "low_attention_modelable":
      return mergeFilters(
        {
          opportunityModes: ["deep-research", "execution-ready"],
          minTradabilityScore: 45,
          maxResolutionAmbiguityScore: 55,
          sort: "attention_gap_desc"
        },
        base
      );
    case "avoid_or_blocked":
      return mergeFilters(
        {
          opportunityModes: ["avoid"],
          sort: "risk_desc"
        },
        base
      );
    default:
      return base;
  }
}

function depthWithinCents(levels: Array<{ price: number; size: number }>, bestPrice: number | undefined, cents: number): number | undefined {
  if (bestPrice === undefined || levels.length === 0) {
    return undefined;
  }
  const maxDelta = cents / 100;
  const total = levels
    .filter((level) => Math.abs(level.price - bestPrice) <= maxDelta)
    .reduce((sum, level) => sum + level.price * level.size, 0);
  return total > 0 ? Number(total.toFixed(6)) : undefined;
}

function executionSlippageCents(levels: Array<{ price: number; size: number }>, notionalUsd: number): number | undefined {
  if (levels.length === 0 || notionalUsd <= 0) {
    return undefined;
  }
  const bestPrice = levels[0]?.price;
  if (bestPrice === undefined || bestPrice <= 0) {
    return undefined;
  }

  let remaining = notionalUsd;
  let shares = 0;
  let spent = 0;
  for (const level of levels) {
    if (remaining <= 1e-9) {
      break;
    }
    const maxSharesAtLevel = remaining / level.price;
    const taken = Math.min(level.size, maxSharesAtLevel);
    if (taken <= 0) {
      continue;
    }
    const cost = taken * level.price;
    remaining -= cost;
    shares += taken;
    spent += cost;
  }

  if (shares <= 0) {
    return undefined;
  }
  const averagePrice = spent / shares;
  return Number(((averagePrice - bestPrice) * 100).toFixed(4));
}

function applyOrderbookEnrichment(market: UniverseMarket, book: OrderbookSnapshot): UniverseMarket {
  const bestBid = book.bestBid ?? market.bestBid;
  const bestAsk = book.bestAsk ?? market.bestAsk;
  const midpoint =
    book.midpoint ??
    (bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestBid + bestAsk) / 2).toFixed(6))
      : market.midpoint);
  const spreadCents =
    bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestAsk - bestBid) * 100).toFixed(2))
      : market.spreadCents;
  const impliedProb = computeImpliedProbability({
    midpoint,
    bestBid,
    bestAsk,
    outcomePrices: market.outcomePrices,
    lastTradePrice: market.lastTradePrice
  });

  return computeUniverseScores(
    {
      ...market,
      bestBid,
      bestAsk,
      midpoint,
      spreadCents,
      impliedProb,
      orderPriceMinTickSize: book.tickSize ?? market.orderPriceMinTickSize,
      orderMinSize: book.minOrderSize ?? market.orderMinSize,
      negRisk: book.negRisk ?? market.negRisk,
      depthUsdWithin2c: depthWithinCents(book.asks, bestAsk, 2),
      depthUsdWithin5c: depthWithinCents(book.asks, bestAsk, 5),
      slippageCentsAt50Usd: executionSlippageCents(book.asks, 50),
      slippageCentsAt250Usd: executionSlippageCents(book.asks, 250),
      priceBucket: classifyPriceBucket(impliedProb),
      spreadBucket: classifySpreadBucket(spreadCents)
    },
    DEFAULT_DISCOVERY_POLICIES
  );
}

export async function enrichUniverseMarkets(
  config: RuntimeConfig,
  markets: UniverseMarket[],
  args: {
    topN: number;
    profile: EnrichmentProfile;
    batchSize?: number;
  }
): Promise<{ markets: UniverseMarket[]; enrichedCount: number }> {
  if (args.topN <= 0 || args.profile === "none") {
    return { markets, enrichedCount: 0 };
  }

  const candidates = stableSort(
    markets.filter((market) =>
      market.active !== false &&
      market.closed !== true &&
      market.archived !== true &&
      market.acceptingOrders !== false &&
      market.clobTokenIds.length > 0
    ),
    (left, right) =>
      (right.researchPriorityScore + right.tradabilityScore) -
      (left.researchPriorityScore + left.tradabilityScore)
  ).slice(0, Math.max(0, Math.min(args.topN, 1000)));

  const updates = new Map<string, UniverseMarket>();
  let enrichedCount = 0;

  for (const market of candidates) {
    const tokenId = market.yesTokenId ?? market.clobTokenIds[0];
    if (!tokenId) {
      continue;
    }
    try {
      const book = await getOrderbook(config, tokenId, 50);
      updates.set(market.marketKey, applyOrderbookEnrichment(market, book));
      enrichedCount += 1;
    } catch {
      // keep the cheap-scan record if live enrichment fails
    }
  }

  return {
    markets: markets.map((market) => updates.get(market.marketKey) ?? market),
    enrichedCount
  };
}

export async function ingestUniverseMarkets(
  config: RuntimeConfig,
  args: IngestMarketUniverseArgs,
  policies: DiscoveryPolicies = DEFAULT_DISCOVERY_POLICIES
): Promise<IngestUniverseResult> {
  const now = args.now ?? new Date();
  const source = args.source ?? policies.defaults.source;
  const includeClosed = args.includeClosed ?? policies.defaults.includeClosed;
  const pageSize = args.pageSize ?? policies.defaults.pageSize;
  const limitPages = args.limitPages;
  const includeTags = args.includeTags ?? policies.defaults.includeTags;
  const order = args.order ?? policies.defaults.order;
  const ascending = args.ascending ?? policies.defaults.ascending;
  const minLiquidityUsdc = args.minLiquidityUsdc ?? policies.defaults.minLiquidityUsdc;

  const allRawPages: unknown[] = [];
  const rawEvents: unknown[] = [];
  let rawMarkets: unknown[] = [];
  let pageCount = 0;

  if (source === "markets_keyset" || source === "both" || source === "composite") {
    const result = await fetchAllMarketsKeyset(config, {
      ...args,
      includeClosed,
      pageSize,
      limitPages,
      includeTags,
      order,
      ascending,
      minLiquidityUsdc
    });
    rawMarkets = rawMarkets.concat(result.markets);
    allRawPages.push(...result.rawPages);
    pageCount += result.pageCount;
  }

  if (source === "gamma_markets" || source === "composite") {
    const result = await fetchAllMarketsList(config, {
      ...args,
      includeClosed,
      pageSize,
      limitPages,
      includeTags,
      minLiquidityUsdc
    });
    rawMarkets = rawMarkets.concat(result.markets);
    allRawPages.push(...result.rawPages);
    pageCount += result.pageCount;
  }

  if (source === "events_keyset" || source === "both" || source === "composite") {
    const seenCursors = new Set<string>();
    const maxPages = Math.max(1, limitPages ?? Number.MAX_SAFE_INTEGER);
    let afterCursor: string | undefined;
    let eventPages = 0;
    while (eventPages < maxPages) {
      if (afterCursor && seenCursors.has(afterCursor)) {
        break;
      }
      if (afterCursor) {
        seenCursors.add(afterCursor);
      }
      const page = await fetchEventsKeysetPage(config, {
        limit: pageSize,
        afterCursor,
        closed: includeClosed ? undefined : false,
        includeTag: includeTags,
        liquidityNumMin: minLiquidityUsdc,
        order,
        ascending
      });
      rawEvents.push(...page.events);
      allRawPages.push(page.raw);
      eventPages += 1;
      if (!page.nextCursor) {
        break;
      }
      afterCursor = page.nextCursor;
    }
    pageCount += eventPages;
  }

  if (source === "gamma_events" || source === "composite") {
    const result = await fetchAllEventsList(config, {
      ...args,
      includeClosed,
      pageSize,
      limitPages,
      includeTags,
      minLiquidityUsdc
    });
    rawEvents.push(...result.events);
    allRawPages.push(...result.rawPages);
    pageCount += result.pageCount;
  }

  const normalizedFromMarkets = rawMarkets.map((market) =>
    normalizeUniverseMarketFromGammaMarket(market, {
      source: source === "gamma_markets" ? "gamma_markets" : source === "composite" ? "composite" : "markets_keyset",
      now,
      policies
    })
  );
  const normalizedFromEvents =
    source === "events_keyset" || source === "gamma_events" || source === "both" || source === "composite"
      ? flattenEventsToUniverseMarkets(rawEvents, { now, policies })
      : [];

  const merged = mergeUniverseMarkets([...normalizedFromMarkets, ...normalizedFromEvents]);
  const enriched = await enrichUniverseMarkets(config, merged, {
    topN: args.enrichTopN ?? policies.defaults.enrichTopN,
    profile: args.enrichmentProfile ?? policies.defaults.enrichmentProfile
  });

  return {
    source,
    rawMarkets,
    rawEvents,
    rawPages: allRawPages,
    pageCount,
    markets: enriched.markets,
    enrichedCount: enriched.enrichedCount
  };
}

export function normalizeUniverseMarketForStorage(market: UniverseMarket): Record<string, unknown> {
  return {
    marketKey: market.marketKey,
    marketId: market.marketId,
    conditionId: market.conditionId,
    questionId: market.questionId,
    eventId: market.eventId,
    eventSlug: market.eventSlug,
    eventTitle: market.eventTitle,
    seriesSlug: market.seriesSlug,
    seriesTitle: market.seriesTitle,
    slug: market.slug,
    title: market.title,
    description: market.description,
    resolutionSource: market.resolutionSource,
    resolutionText: market.resolutionText,
    category: market.category,
    subcategory: market.subcategory,
    tags: market.tags,
    outcomes: market.outcomes,
    outcomePrices: market.outcomePrices,
    clobTokenIds: market.clobTokenIds,
    yesTokenId: market.yesTokenId,
    noTokenId: market.noTokenId,
    active: market.active,
    closed: market.closed,
    archived: market.archived,
    restricted: market.restricted,
    acceptingOrders: market.acceptingOrders,
    enableOrderBook: market.enableOrderBook,
    startDate: market.startDate,
    endDate: market.endDate,
    createdAt: market.createdAt,
    updatedAt: market.updatedAt,
    liquidityUsd: market.liquidityUsd,
    liquidityClobUsd: market.liquidityClobUsd,
    volumeUsd: market.volumeUsd,
    volume24hUsd: market.volume24hUsd,
    volume7dUsd: market.volume7dUsd,
    volume30dUsd: market.volume30dUsd,
    impliedProb: market.impliedProb,
    lastTradePrice: market.lastTradePrice,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    midpoint: market.midpoint,
    spreadCents: market.spreadCents,
    orderPriceMinTickSize: market.orderPriceMinTickSize,
    orderMinSize: market.orderMinSize,
    negRisk: market.negRisk,
    depthUsdWithin2c: market.depthUsdWithin2c,
    depthUsdWithin5c: market.depthUsdWithin5c,
    slippageCentsAt50Usd: market.slippageCentsAt50Usd,
    slippageCentsAt250Usd: market.slippageCentsAt250Usd,
    structuralType: market.structuralType,
    categoryGroup: market.categoryGroup,
    horizonBucket: market.horizonBucket,
    priceBucket: market.priceBucket,
    liquidityBucket: market.liquidityBucket,
    spreadBucket: market.spreadBucket,
    opportunityMode: market.opportunityMode,
    modelabilityScore: market.modelabilityScore,
    tradabilityScore: market.tradabilityScore,
    catalystScore: market.catalystScore,
    resolutionAmbiguityScore: market.resolutionAmbiguityScore,
    attentionGapScore: market.attentionGapScore,
    crossMarketScore: market.crossMarketScore,
    researchPriorityScore: market.researchPriorityScore,
    tradeOpportunityScore: market.tradeOpportunityScore,
    makerScore: market.makerScore,
    riskScore: market.riskScore,
    reasonCodes: market.reasonCodes,
    disqualifiers: market.disqualifiers,
    rawJson: {
      rawGammaMarket: market.rawGammaMarket,
      rawGammaEvent: market.rawGammaEvent
    }
  };
}
