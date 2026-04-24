import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { openStateStore, type StoredAlertRecord, type StoredPreviewRecord } from "../../state-store/src/index.js";

export type Side = "BUY" | "SELL";
export type RestingOrderType = "GTC" | "GTD";
export type MarketableOrderType = "FOK" | "FAK";
export type IdentifierType = "slug" | "condition_id" | "token_id" | "market_id";

export interface MarketRef {
  identifierType: IdentifierType;
  identifier: string;
}

export interface PriceLevel {
  price: number;
  size: number;
}

export interface OrderbookSnapshot {
  tokenId: string;
  marketId?: string;
  conditionId?: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
  tickSize?: number;
  minOrderSize?: number;
  negRisk?: boolean;
  timestamp?: string;
  hash?: string;
}

export interface MarketSnapshot {
  title: string;
  slug?: string;
  marketId?: string;
  eventId?: string;
  conditionId?: string;
  tokenIds: string[];
  yesTokenId?: string;
  noTokenId?: string;
  price?: number;
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
  spreadCents?: number;
  liquidityUsd?: number;
  volumeUsd?: number;
  minimumTickSize?: number;
  minimumOrderSize?: number;
  negRisk?: boolean;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  category?: string;
  tags?: string[];
  resolutionText?: string;
  commentsSummary?: string[];
  relatedMarkets?: Array<{ title: string; identifier: string; price?: number }>;
  rawGammaMarket?: unknown;
  rawClobMarket?: unknown;
}

export interface PolicyWarning {
  code: string;
  severity: "info" | "warn" | "block";
  message: string;
}

export interface OrderPreview {
  previewId: string;
  createdAt: string;
  orderKind: "limit" | "marketable";
  normalizedParams: Record<string, unknown>;
  warnings: PolicyWarning[];
  canSubmit: boolean;
  policyHash: string;
}

export interface PreviewRecord extends OrderPreview {
  submissionPayload: Record<string, unknown>;
  marketSnapshot?: MarketSnapshot;
}

export interface RuntimeConfig {
  cwd: string;
  clobUrl: string;
  gammaUrl: string;
  dataUrl: string;
  chainId: number;
  privateKey?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
  funder?: string;
  proxyAddress?: string;
  signatureType: number;
  enableTrading: boolean;
  requirePreview: boolean;
  requireGeoblockCheck: boolean;
  autoDeriveApiCreds: boolean;
  pythonBin: string;
  pythonHelperPath: string;
  alertCachePath: string;
  stateDbPath: string;
}

const previewStore = new Map<string, PreviewRecord>();
let dotenvLoaded = false;

function resolvePluginRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(path.resolve(current, ".codex-plugin", "plugin.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd);
    }
    current = parent;
  }
}

function resolveInstalledPluginRootFromCache(cwd: string): string | undefined {
  const resolvedCwd = path.resolve(cwd);
  const match = resolvedCwd.match(
    /^(?<codexHome>.+[\\\/]\.codex)[\\\/]plugins[\\\/]cache[\\\/][^\\\/]+[\\\/](?<pluginName>[^\\\/]+)[\\\/]local(?:[\\\/].*)?$/
  );
  if (!match?.groups?.codexHome || !match.groups.pluginName) {
    return undefined;
  }
  return path.resolve(match.groups.codexHome, "plugins", match.groups.pluginName);
}

export function resolveRuntimeDotenvPath(cwd: string): string | undefined {
  const pluginRoot = resolvePluginRoot(cwd);
  const candidates: string[] = [];

  let current = path.resolve(cwd);
  while (true) {
    candidates.push(path.resolve(current, ".env"));
    if (current === pluginRoot) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const installedPluginRoot = resolveInstalledPluginRootFromCache(pluginRoot);
  if (installedPluginRoot) {
    candidates.push(path.resolve(installedPluginRoot, ".env"));
  }

  return candidates.find((candidate) => existsSync(candidate));
}

function ensureDotenv(cwd: string): void {
  if (dotenvLoaded) {
    return;
  }
  const dotenvPath = resolveRuntimeDotenvPath(cwd);
  if (dotenvPath) {
    dotenv.config({ path: dotenvPath, quiet: true, override: true });
  }
  dotenvLoaded = true;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}

function absoluteFromCwd(cwd: string, target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(cwd, target);
}

export function loadRuntimeConfig(cwd = process.cwd()): RuntimeConfig {
  ensureDotenv(cwd);
  return {
    cwd,
    clobUrl: process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com",
    gammaUrl: process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com",
    dataUrl: process.env.POLYMARKET_DATA_URL ?? "https://data-api.polymarket.com",
    chainId: Number(process.env.POLYMARKET_CHAIN_ID ?? "137"),
    privateKey: process.env.POLYMARKET_PRIVATE_KEY || undefined,
    apiKey: process.env.POLYMARKET_API_KEY || undefined,
    apiSecret: process.env.POLYMARKET_API_SECRET || undefined,
    apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE || undefined,
    funder: process.env.POLYMARKET_FUNDER || undefined,
    proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS || undefined,
    signatureType: Number(process.env.POLYMARKET_SIGNATURE_TYPE ?? "0"),
    enableTrading: envBoolean("POLYMARKET_ENABLE_TRADING", false),
    requirePreview: envBoolean("POLYMARKET_REQUIRE_PREVIEW", true),
    requireGeoblockCheck: envBoolean("POLYMARKET_REQUIRE_GEOBLOCK_CHECK", true),
    autoDeriveApiCreds: envBoolean("POLYMARKET_AUTO_DERIVE_API_CREDS", true),
    pythonBin: process.env.POLYMARKET_PYTHON_BIN || "python3",
    pythonHelperPath: absoluteFromCwd(
      cwd,
      process.env.POLYMARKET_PY_HELPER_PATH || "servers/polymarket-mcp/helpers/trading_helper.py"
    ),
    alertCachePath: absoluteFromCwd(
      cwd,
      process.env.POLYMARKET_ALERT_CACHE_PATH || ".cache/polymarket-alerts.json"
    ),
    stateDbPath: absoluteFromCwd(
      cwd,
      process.env.POLYMARKET_STATE_DB_PATH || "state/polymarket.sqlite"
    )
  };
}

export function clampUnitPrice(price: number): number {
  return Math.max(0.0001, Math.min(0.9999, price));
}

export function roundToTick(price: number, tickSize: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(tickSize) || tickSize <= 0) {
    throw new Error("invalid price or tick size");
  }
  return Number((Math.round(price / tickSize) * tickSize).toFixed(decimalPlaces(tickSize)));
}

function decimalPlaces(value: number): number {
  const text = value.toString();
  if (text.includes("e-")) {
    return Number(text.split("e-")[1]);
  }
  const fraction = text.split(".")[1];
  return fraction ? fraction.length : 0;
}

function quantizeToTick(price: number, tickSize: number, mode: "floor" | "ceil" | "round"): number {
  const scaled = price / tickSize;
  const adjusted =
    mode === "floor"
      ? Math.floor(scaled + 1e-9)
      : mode === "ceil"
        ? Math.ceil(scaled - 1e-9)
        : Math.round(scaled);
  return Number((adjusted * tickSize).toFixed(decimalPlaces(tickSize)));
}

export function normalizeLimitPrice(side: Side, price: number, tickSize: number): number {
  return clampUnitPrice(quantizeToTick(price, tickSize, side === "BUY" ? "floor" : "ceil"));
}

export function normalizeMarketablePrice(side: Side, price: number, tickSize: number): number {
  return clampUnitPrice(quantizeToTick(price, tickSize, side === "BUY" ? "ceil" : "floor"));
}

export function deriveWorstPrice(args: {
  side: Side;
  topOfBookPrice: number;
  maxSlippageBps: number;
}): number {
  const multiplier =
    args.side === "BUY"
      ? 1 + args.maxSlippageBps / 10_000
      : 1 - args.maxSlippageBps / 10_000;
  return clampUnitPrice(args.topOfBookPrice * multiplier);
}

export function summarizeWarnings(warnings: PolicyWarning[]): string {
  return warnings.map((warning) => `[${warning.severity}] ${warning.code}: ${warning.message}`).join("; ");
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parsePossiblyJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseOutcomes(value: unknown): string[] {
  return parsePossiblyJsonArray(value).map((entry) => entry.toUpperCase());
}

function extractGammaTokenIds(market: Record<string, unknown>): string[] {
  const direct = parsePossiblyJsonArray(
    market.clobTokenIds ?? market.clob_token_ids ?? market.tokenIds ?? market.token_ids
  );
  if (direct.length > 0) {
    return direct;
  }
  const tokens = safeArray<Record<string, unknown>>(market.tokens);
  return tokens
    .map((token) => String(token.token_id ?? token.tokenId ?? ""))
    .filter(Boolean);
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          return String(record.slug ?? record.label ?? "");
        }
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

function trimText(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function summarizeComments(comments: unknown[]): string[] {
  return comments
    .map((comment) => {
      const record = (comment ?? {}) as Record<string, unknown>;
      const profile = (record.profile ?? {}) as Record<string, unknown>;
      const author = String(profile.pseudonym ?? profile.name ?? record.userAddress ?? "anon");
      const body = String(record.body ?? "").trim();
      return body ? `${author}: ${trimText(body, 180)}` : "";
    })
    .filter(Boolean)
    .slice(0, 5);
}

function parseOrderbookSide(levels: unknown[], side: "bids" | "asks"): PriceLevel[] {
  return levels
    .map((level) => {
      const entry = level as Record<string, unknown>;
      return {
        price: Number(entry.price),
        size: Number(entry.size)
      };
    })
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0)
    .sort((left, right) => (side === "bids" ? right.price - left.price : left.price - right.price));
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function requestJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "codex-polymarket/0.1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function withQuery(baseUrl: string, params: Record<string, unknown>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.join(","));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function chooseYesNoTokenIds(tokens: Array<{ outcome?: string; tokenId?: string; token_id?: string }>): {
  yesTokenId?: string;
  noTokenId?: string;
} {
  const result: { yesTokenId?: string; noTokenId?: string } = {};
  for (const token of tokens) {
    const tokenId = token.tokenId ?? token.token_id;
    const outcome = (token.outcome ?? "").toUpperCase();
    if (!tokenId) {
      continue;
    }
    if (outcome === "YES") {
      result.yesTokenId = tokenId;
    }
    if (outcome === "NO") {
      result.noTokenId = tokenId;
    }
  }
  return result;
}

function previewRuntimeConfig(): RuntimeConfig {
  return loadRuntimeConfig();
}

function stateStoreForConfig(config: RuntimeConfig) {
  return openStateStore(config.stateDbPath);
}

function asStoredPreviewRecord(record: PreviewRecord): StoredPreviewRecord {
  return {
    previewId: record.previewId,
    createdAt: record.createdAt,
    orderKind: record.orderKind,
    normalizedParams: record.normalizedParams,
    warnings: record.warnings,
    canSubmit: record.canSubmit,
    policyHash: record.policyHash,
    submissionPayload: record.submissionPayload,
    marketSnapshot: record.marketSnapshot
  } satisfies StoredPreviewRecord;
}

function fromStoredPreviewRecord(record: StoredPreviewRecord): PreviewRecord {
  return {
    previewId: record.previewId,
    createdAt: record.createdAt,
    orderKind: record.orderKind,
    normalizedParams: record.normalizedParams,
    warnings: record.warnings,
    canSubmit: record.canSubmit,
    policyHash: record.policyHash,
    submissionPayload: record.submissionPayload,
    marketSnapshot: record.marketSnapshot as MarketSnapshot | undefined
  } satisfies PreviewRecord;
}

export function getPreview(previewId: string): PreviewRecord | undefined {
  const cached = previewStore.get(previewId);
  if (cached) {
    return cached;
  }
  try {
    const stored = stateStoreForConfig(previewRuntimeConfig()).getPreview(previewId);
    if (!stored) {
      return undefined;
    }
    const preview = fromStoredPreviewRecord(stored);
    previewStore.set(preview.previewId, preview);
    return preview;
  } catch {
    return undefined;
  }
}

export function storePreview(record: Omit<PreviewRecord, "previewId" | "createdAt">): PreviewRecord {
  const created = {
    ...record,
    previewId: randomUUID(),
    createdAt: new Date().toISOString()
  } satisfies PreviewRecord;
  previewStore.set(created.previewId, created);
  try {
    stateStoreForConfig(previewRuntimeConfig()).storePreview(asStoredPreviewRecord(created));
  } catch {
    // keep in-memory fallback even if SQLite state is unavailable
  }
  return created;
}

export function deletePreview(previewId: string): void {
  previewStore.delete(previewId);
  try {
    stateStoreForConfig(previewRuntimeConfig()).deletePreview(previewId);
  } catch {
    // ignore state-store delete failures in the in-memory fallback path
  }
}

export async function invokePythonHelper<T>(
  config: RuntimeConfig,
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  await access(config.pythonHelperPath).catch(() => {
    throw new Error(
      `Python helper not found at ${config.pythonHelperPath}. Install the plugin dependencies and keep the helper in place.`
    );
  });

  return await new Promise<T>((resolve, reject) => {
    const child = spawn(config.pythonBin, [config.pythonHelperPath], {
      cwd: config.cwd,
      env: {
        ...process.env,
        POLYMARKET_CLOB_URL: config.clobUrl,
        POLYMARKET_CHAIN_ID: String(config.chainId),
        POLYMARKET_PRIVATE_KEY: config.privateKey ?? "",
        POLYMARKET_API_KEY: config.apiKey ?? "",
        POLYMARKET_API_SECRET: config.apiSecret ?? "",
        POLYMARKET_API_PASSPHRASE: config.apiPassphrase ?? "",
        POLYMARKET_FUNDER: config.funder ?? "",
        POLYMARKET_PROXY_ADDRESS: config.proxyAddress ?? "",
        POLYMARKET_SIGNATURE_TYPE: String(config.signatureType),
        POLYMARKET_AUTO_DERIVE_API_CREDS: String(config.autoDeriveApiCreds)
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Python helper exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        if (parsed.ok === false) {
          reject(new Error(parsed.error ?? parsed.message ?? "Python helper returned an error"));
          return;
        }
        resolve(parsed.result as T);
      } catch (error) {
        reject(new Error(`Failed to parse helper response: ${String(error)} :: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify({ action, payload }));
    child.stdin.end();
  });
}

export function hasTradingCredentials(config: RuntimeConfig): boolean {
  return Boolean(config.privateKey && (config.autoDeriveApiCreds || (config.apiKey && config.apiSecret && config.apiPassphrase)));
}

export function resolveDefaultUserAddress(config: RuntimeConfig): string | undefined {
  return config.proxyAddress ?? config.funder;
}

export async function getGeoblockStatus(): Promise<Record<string, unknown>> {
  return await requestJson<Record<string, unknown>>("https://polymarket.com/api/geoblock");
}

function mapSearchMarketResult(market: Record<string, unknown>): Record<string, unknown> {
  const tags = normalizeTags(market.tags);
  return {
    id: market.id,
    title: market.question ?? market.title,
    slug: market.slug,
    conditionId: market.conditionId ?? market.condition_id,
    category: market.category,
    liquidityUsd:
      toNumber(market.liquidityNum) ??
      toNumber(market.liquidityClob) ??
      toNumber(market.liquidity) ??
      0,
    volumeUsd:
      toNumber(market.volumeNum) ??
      toNumber(market.volumeClob) ??
      toNumber(market.volume) ??
      0,
    bestBid: toNumber(market.bestBid),
    bestAsk: toNumber(market.bestAsk),
    lastTradePrice: toNumber(market.lastTradePrice),
    active: Boolean(market.active),
    closed: Boolean(market.closed),
    archived: Boolean(market.archived),
    endDate: market.endDateIso ?? market.endDate,
    createdAt: market.createdAt ?? market.created_at,
    updatedAt: market.updatedAt ?? market.updated_at,
    tags,
    image: market.image,
    icon: market.icon
  };
}

export async function searchMarkets(
  config: RuntimeConfig,
  args: {
    query: string;
    limit: number;
    activeOnly: boolean;
    includeClosed: boolean;
    minLiquidityUsd?: number;
    sortBy?: string;
    tagFilters?: string[];
  }
): Promise<Record<string, unknown>[]> {
  const response = await requestJson<Record<string, unknown>>(
    withQuery(`${config.gammaUrl}/public-search`, {
      q: args.query,
      limit_per_type: args.limit,
      keep_closed_markets: args.includeClosed ? 1 : 0,
      search_profiles: false,
      search_tags: false,
      optimized: true
    })
  );

  const directMarkets = safeArray<Record<string, unknown>>(response.markets).map(mapSearchMarketResult);
  const eventMarkets = safeArray<Record<string, unknown>>(response.events)
    .flatMap((event) => safeArray<Record<string, unknown>>(event.markets))
    .map(mapSearchMarketResult);

  let markets = dedupeByKey([...directMarkets, ...eventMarkets], (market) =>
    String(market.slug ?? market.conditionId ?? market.id ?? "")
  );

  if (args.activeOnly) {
    markets = markets.filter((market) => Boolean(market.active) && !Boolean(market.closed));
  }

  if (!args.includeClosed) {
    markets = markets.filter((market) => !Boolean(market.closed));
  }

  if (args.minLiquidityUsd !== undefined) {
    markets = markets.filter((market) => Number(market.liquidityUsd ?? 0) >= args.minLiquidityUsd!);
  }

  if (args.tagFilters && args.tagFilters.length > 0) {
    const wanted = new Set(args.tagFilters.map((tag) => tag.toLowerCase()));
    markets = markets.filter((market) => {
      const tags = safeArray<string>(market.tags).map((tag) => tag.toLowerCase());
      return tags.some((tag) => wanted.has(tag));
    });
  }

  switch (args.sortBy) {
    case "volume":
      markets.sort((a, b) => Number(b.volumeUsd ?? 0) - Number(a.volumeUsd ?? 0));
      break;
    case "liquidity":
      markets.sort((a, b) => Number(b.liquidityUsd ?? 0) - Number(a.liquidityUsd ?? 0));
      break;
    case "ending_soon":
      markets.sort((a, b) => Date.parse(String(a.endDate ?? "9999-12-31")) - Date.parse(String(b.endDate ?? "9999-12-31")));
      break;
    case "newest":
      markets.sort(
        (a, b) =>
          Date.parse(String(b.createdAt ?? b.updatedAt ?? b.endDate ?? 0)) -
          Date.parse(String(a.createdAt ?? a.updatedAt ?? a.endDate ?? 0))
      );
      break;
    default:
      break;
  }

  return markets.slice(0, args.limit);
}

async function fetchGammaMarketById(config: RuntimeConfig, marketId: string): Promise<Record<string, unknown>> {
  return await requestJson<Record<string, unknown>>(`${config.gammaUrl}/markets/${encodeURIComponent(marketId)}?include_tag=true`);
}

async function fetchGammaMarketBySlug(config: RuntimeConfig, slug: string): Promise<Record<string, unknown>> {
  return await requestJson<Record<string, unknown>>(`${config.gammaUrl}/markets/slug/${encodeURIComponent(slug)}?include_tag=true`);
}

async function fetchClobMarketByConditionId(
  config: RuntimeConfig,
  conditionId: string
): Promise<Record<string, unknown>> {
  return await requestJson<Record<string, unknown>>(`${config.clobUrl}/markets/${encodeURIComponent(conditionId)}`);
}

async function findClobMarketByTokenId(
  config: RuntimeConfig,
  tokenId: string,
  maxPages = 20
): Promise<Record<string, unknown>> {
  let nextCursor = "MA==";
  let page = 0;
  while (page < maxPages && nextCursor) {
    const response = await requestJson<Record<string, unknown>>(
      `${config.clobUrl}/markets?next_cursor=${encodeURIComponent(nextCursor)}`,
      25_000
    );
    const data = safeArray<Record<string, unknown>>(response.data);
    for (const market of data) {
      const tokens = safeArray<Record<string, unknown>>(market.tokens);
      if (tokens.some((token) => String(token.token_id ?? token.tokenId ?? "") === tokenId)) {
        return market;
      }
    }
    nextCursor = String(response.next_cursor ?? "");
    if (!nextCursor || nextCursor === "LTE=") {
      break;
    }
    page += 1;
  }
  throw new Error(`Unable to find CLOB market for token_id ${tokenId}`);
}

async function fetchClobMarketForTokenId(
  config: RuntimeConfig,
  tokenId: string
): Promise<Record<string, unknown>> {
  try {
    const orderbook = await getOrderbook(config, tokenId, 1);
    const conditionId = orderbook.conditionId ?? orderbook.marketId;
    if (conditionId) {
      return await fetchClobMarketByConditionId(config, conditionId);
    }
  } catch {
    // Fall back to paginated market scan when the book endpoint is unavailable.
  }

  return await findClobMarketByTokenId(config, tokenId);
}

async function fetchCommentsForMarket(
  config: RuntimeConfig,
  gammaMarket?: Record<string, unknown>,
  limit = 5
): Promise<unknown[]> {
  if (!gammaMarket) {
    return [];
  }
  const events = safeArray<Record<string, unknown>>(gammaMarket.events);
  const eventId = events[0]?.id ?? gammaMarket.eventId ?? gammaMarket.event_id;
  const marketId = gammaMarket.id;

  if (eventId !== undefined) {
    try {
      return await requestJson<unknown[]>(
        withQuery(`${config.gammaUrl}/comments`, {
          parent_entity_type: "Event",
          parent_entity_id: eventId,
          limit,
          order: "createdAt",
          ascending: false
        })
      );
    } catch {
      // fall through to market comments
    }
  }

  if (marketId !== undefined) {
    return await requestJson<unknown[]>(
      withQuery(`${config.gammaUrl}/comments`, {
        parent_entity_type: "market",
        parent_entity_id: marketId,
        limit,
        order: "createdAt",
        ascending: false
      })
    );
  }

  return [];
}

function buildRelatedMarkets(gammaMarket?: Record<string, unknown>): Array<{ title: string; identifier: string; price?: number }> {
  if (!gammaMarket) {
    return [];
  }
  const markets = safeArray<Record<string, unknown>>(safeArray<Record<string, unknown>>(gammaMarket.events)[0]?.markets);
  return markets
    .filter((market) => String(market.slug ?? market.id ?? "") !== String(gammaMarket.slug ?? gammaMarket.id ?? ""))
    .slice(0, 8)
    .map((market) => ({
      title: String(market.question ?? market.title ?? "Untitled market"),
      identifier: String(market.slug ?? market.conditionId ?? market.id ?? ""),
      price: toNumber(market.lastTradePrice) ?? toNumber(market.bestBid) ?? toNumber(market.bestAsk)
    }))
    .filter((market) => Boolean(market.identifier));
}

function marketEndDate(raw: Record<string, unknown>): string | undefined {
  const value = raw.endDateIso ?? raw.endDate ?? raw.end_date_iso ?? raw.end_date;
  return typeof value === "string" && value ? value : undefined;
}

function deriveCurrentPrice(bestBid?: number, bestAsk?: number, lastTradePrice?: number): number | undefined {
  if (bestBid !== undefined && bestAsk !== undefined) {
    const spread = bestAsk - bestBid;
    if (spread <= 0.10) {
      return Number(((bestBid + bestAsk) / 2).toFixed(4));
    }
  }
  if (lastTradePrice !== undefined) {
    return lastTradePrice;
  }
  if (bestBid !== undefined && bestAsk !== undefined) {
    return Number(((bestBid + bestAsk) / 2).toFixed(4));
  }
  return undefined;
}

function computeSpreadCents(bestBid?: number, bestAsk?: number): number | undefined {
  if (bestBid === undefined || bestAsk === undefined) {
    return undefined;
  }
  return Number(((bestAsk - bestBid) * 100).toFixed(2));
}

function normalizeMarketSnapshot(
  gammaMarket: Record<string, unknown> | undefined,
  clobMarket: Record<string, unknown> | undefined,
  orderbook: OrderbookSnapshot | undefined,
  comments: unknown[]
): MarketSnapshot {
  const source = gammaMarket ?? clobMarket ?? {};
  const tokens = safeArray<Record<string, unknown>>(clobMarket?.tokens ?? gammaMarket?.tokens);
  const gammaTokenIds = gammaMarket ? extractGammaTokenIds(gammaMarket) : [];
  const tokenIds = gammaTokenIds.length > 0
    ? gammaTokenIds
    : tokens
        .map((token) => String(token.token_id ?? token.tokenId ?? ""))
        .filter(Boolean);

  const yesNo = chooseYesNoTokenIds(tokens);
  const bestBid = orderbook?.bestBid ?? toNumber(source.bestBid ?? source.best_bid);
  const bestAsk = orderbook?.bestAsk ?? toNumber(source.bestAsk ?? source.best_ask);
  const lastTradePrice = toNumber(source.lastTradePrice ?? source.last_trade_price);

  return {
    title: String(source.question ?? source.title ?? clobMarket?.question ?? "Untitled market"),
    slug: typeof source.slug === "string" ? source.slug : typeof clobMarket?.market_slug === "string" ? clobMarket.market_slug : undefined,
    marketId: source.id !== undefined ? String(source.id) : undefined,
    eventId: safeArray<Record<string, unknown>>(source.events)[0]?.id !== undefined ? String(safeArray<Record<string, unknown>>(source.events)[0]?.id) : undefined,
    conditionId: String(source.conditionId ?? source.condition_id ?? clobMarket?.condition_id ?? "") || undefined,
    tokenIds,
    yesTokenId: yesNo.yesTokenId ?? tokenIds[0],
    noTokenId: yesNo.noTokenId ?? tokenIds[1],
    bestBid,
    bestAsk,
    midpoint: orderbook?.midpoint,
    price: deriveCurrentPrice(bestBid, bestAsk, lastTradePrice),
    spreadCents: computeSpreadCents(bestBid, bestAsk),
    liquidityUsd:
      toNumber(source.liquidityNum ?? source.liquidityClob ?? source.liquidity_clob ?? source.liquidity) ??
      toNumber(clobMarket?.liquidity),
    volumeUsd:
      toNumber(source.volumeNum ?? source.volumeClob ?? source.volume_clob ?? source.volume) ??
      toNumber(clobMarket?.volume),
    minimumTickSize:
      orderbook?.tickSize ??
      toNumber(source.orderPriceMinTickSize ?? source.minimum_tick_size ?? source.minimumTickSize),
    minimumOrderSize:
      orderbook?.minOrderSize ?? toNumber(source.orderMinSize ?? source.minimum_order_size),
    negRisk: Boolean(source.negRisk ?? source.neg_risk ?? clobMarket?.neg_risk),
    active: Boolean(source.active),
    closed: Boolean(source.closed),
    endDate: marketEndDate(source),
    category: typeof source.category === "string" ? source.category : undefined,
    tags: dedupeByKey(normalizeTags(source.tags), (tag) => tag),
    resolutionText: String(
      source.resolutionSource ?? source.description ?? clobMarket?.description ?? ""
    ).trim() || undefined,
    commentsSummary: summarizeComments(comments),
    relatedMarkets: buildRelatedMarkets(gammaMarket),
    rawGammaMarket: gammaMarket,
    rawClobMarket: clobMarket
  };
}

export async function resolveMarketByIdentifier(
  config: RuntimeConfig,
  identifierType: IdentifierType,
  identifier: string,
  options?: { includeComments?: boolean; includeRelatedMarkets?: boolean; includeOrderbookSummary?: boolean }
): Promise<MarketSnapshot> {
  let gammaMarket: Record<string, unknown> | undefined;
  let clobMarket: Record<string, unknown> | undefined;

  if (identifierType === "slug") {
    gammaMarket = await fetchGammaMarketBySlug(config, identifier);
  } else if (identifierType === "market_id") {
    gammaMarket = await fetchGammaMarketById(config, identifier);
  } else if (identifierType === "condition_id") {
    clobMarket = await fetchClobMarketByConditionId(config, identifier);
    const slug = typeof clobMarket.market_slug === "string" ? clobMarket.market_slug : undefined;
    if (slug) {
      try {
        gammaMarket = await fetchGammaMarketBySlug(config, slug);
      } catch {
        // keep clob-only snapshot
      }
    }
  } else if (identifierType === "token_id") {
    clobMarket = await fetchClobMarketForTokenId(config, identifier);
    const slug = typeof clobMarket.market_slug === "string" ? clobMarket.market_slug : undefined;
    if (slug) {
      try {
        gammaMarket = await fetchGammaMarketBySlug(config, slug);
      } catch {
        // keep clob-only snapshot
      }
    }
  }

  if (!gammaMarket && !clobMarket) {
    throw new Error(`Unable to resolve market for ${identifierType}:${identifier}`);
  }

  const snapshotSeed = gammaMarket ?? clobMarket ?? {};
  const tokenIds = extractGammaTokenIds(snapshotSeed).length > 0
    ? extractGammaTokenIds(snapshotSeed)
    : safeArray<Record<string, unknown>>(clobMarket?.tokens).map((token) => String(token.token_id ?? token.tokenId ?? "")).filter(Boolean);

  let orderbook: OrderbookSnapshot | undefined;
  if (options?.includeOrderbookSummary && tokenIds[0]) {
    try {
      orderbook = await getOrderbook(config, tokenIds[0], 50);
    } catch {
      // orderbook summary is optional
    }
  }

  const comments = options?.includeComments ? await fetchCommentsForMarket(config, gammaMarket) : [];
  const snapshot = normalizeMarketSnapshot(gammaMarket, clobMarket, orderbook, comments);
  if (!options?.includeRelatedMarkets) {
    snapshot.relatedMarkets = [];
  }
  try {
    stateStoreForConfig(config).recordMarketSnapshot(snapshot);
  } catch {
    // market state persistence is best-effort and should not break live reads
  }
  return snapshot;
}

export async function getOrderbook(
  config: RuntimeConfig,
  tokenId: string,
  depth: number
): Promise<OrderbookSnapshot> {
  const raw = await requestJson<Record<string, unknown>>(
    withQuery(`${config.clobUrl}/book`, { token_id: tokenId })
  );
  const bids = parseOrderbookSide(safeArray(raw.bids), "bids").slice(0, depth);
  const asks = parseOrderbookSide(safeArray(raw.asks), "asks").slice(0, depth);
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const midpoint =
    bestBid !== undefined && bestAsk !== undefined
      ? Number(((bestBid + bestAsk) / 2).toFixed(4))
      : undefined;
  return {
    tokenId,
    marketId: raw.market !== undefined ? String(raw.market) : undefined,
    conditionId: raw.market !== undefined ? String(raw.market) : undefined,
    bids,
    asks,
    bestBid,
    bestAsk,
    midpoint,
    tickSize: toNumber(raw.tick_size),
    minOrderSize: toNumber(raw.min_order_size),
    negRisk: Boolean(raw.neg_risk),
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
    hash: typeof raw.hash === "string" ? raw.hash : undefined
  };
}

function intervalToFidelity(interval: string): number {
  switch (interval) {
    case "1m":
      return 1;
    case "5m":
      return 1;
    case "15m":
      return 5;
    case "1h":
      return 15;
    case "6h":
      return 30;
    case "1d":
      return 60;
    default:
      return 1;
  }
}

function isoToUnixSeconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : undefined;
}

export async function getPriceHistory(
  config: RuntimeConfig,
  tokenId: string,
  interval: string,
  start?: string,
  end?: string,
  limit = 100
): Promise<Record<string, unknown>> {
  const raw = await requestJson<Record<string, unknown>>(
    withQuery(`${config.clobUrl}/prices-history`, {
      market: tokenId,
      interval,
      startTs: isoToUnixSeconds(start),
      endTs: isoToUnixSeconds(end),
      fidelity: intervalToFidelity(interval)
    })
  );

  const history = safeArray<Record<string, unknown>>(raw.history)
    .map((point) => ({
      t: Number(point.t),
      p: Number(point.p),
      iso: Number.isFinite(Number(point.t)) ? new Date(Number(point.t) * 1000).toISOString() : undefined
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
    .slice(-limit);

  return {
    tokenId,
    interval,
    count: history.length,
    history
  };
}

async function resolveConditionIdForScope(
  config: RuntimeConfig,
  scopeType: "condition_id" | "token_id" | "market_id",
  scopeId: string
): Promise<string> {
  if (scopeType === "condition_id") {
    return scopeId;
  }
  if (scopeType === "market_id") {
    const gamma = await fetchGammaMarketById(config, scopeId);
    return String(gamma.conditionId ?? gamma.condition_id);
  }
  const market = await fetchClobMarketForTokenId(config, scopeId);
  return String(market.condition_id ?? market.market ?? "");
}

export async function getRecentTrades(
  config: RuntimeConfig,
  args: {
    scopeType: "condition_id" | "token_id" | "market_id";
    scopeId: string;
    side?: Side;
    limit: number;
  }
): Promise<Record<string, unknown>> {
  const conditionId = await resolveConditionIdForScope(config, args.scopeType, args.scopeId);
  const raw = await requestJson<unknown[]>(
    withQuery(`${config.dataUrl}/trades`, {
      market: conditionId,
      side: args.side,
      limit: Math.min(10_000, args.limit),
      offset: 0,
      takerOnly: false
    })
  );

  let trades = safeArray<Record<string, unknown>>(raw);
  if (args.scopeType === "token_id") {
    trades = trades.filter((trade) => String(trade.asset ?? "") === args.scopeId);
  }

  return {
    scopeType: args.scopeType,
    scopeId: args.scopeId,
    conditionId,
    count: trades.length,
    trades: trades.slice(0, args.limit),
    note:
      "The public Data API does not expose the CLOB trade status field used by authenticated user trade history, so status filters are not applied in this public market-flow view."
  };
}

async function fetchPositionsEndpoint(
  config: RuntimeConfig,
  endpoint: "/positions" | "/closed-positions",
  ownerAddress: string,
  market?: string,
  limit = 100
): Promise<Record<string, unknown>[]> {
  const resolvedMarket = market
    ? market.startsWith("0x")
      ? market
      : /\d+/.test(market)
        ? String((await fetchGammaMarketById(config, market)).conditionId)
        : String((await fetchGammaMarketBySlug(config, market)).conditionId)
    : undefined;

  return safeArray<Record<string, unknown>>(
    await requestJson<unknown[]>(
      withQuery(`${config.dataUrl}${endpoint}`, {
        user: ownerAddress,
        market: resolvedMarket,
        limit,
        offset: 0,
        sortBy: endpoint === "/closed-positions" ? "TIMESTAMP" : "CURRENT"
      })
    )
  );
}

export async function getPositions(
  config: RuntimeConfig,
  args: {
    ownerAddress?: string;
    market?: string;
    includeClosed: boolean;
    limit: number;
  }
): Promise<Record<string, unknown>> {
  const ownerAddress = args.ownerAddress ?? resolveDefaultUserAddress(config);
  if (!ownerAddress) {
    throw new Error(
      "owner_address is required unless POLYMARKET_FUNDER or POLYMARKET_PROXY_ADDRESS is configured."
    );
  }

  const current = await fetchPositionsEndpoint(config, "/positions", ownerAddress, args.market, args.limit);
  const closed = args.includeClosed
    ? await fetchPositionsEndpoint(config, "/closed-positions", ownerAddress, args.market, args.limit)
    : [];

  return {
    ownerAddress,
    market: args.market,
    current,
    closed,
    grossCurrentValueUsd: Number(
      current.reduce((sum, position) => sum + Math.abs(Number(position.currentValue ?? 0)), 0).toFixed(2)
    )
  };
}

async function resolveConditionIdish(config: RuntimeConfig, marketInput: string): Promise<string> {
  if (marketInput.startsWith("0x")) {
    return marketInput;
  }
  if (/^\d+$/.test(marketInput)) {
    const gamma = await fetchGammaMarketById(config, marketInput);
    return String(gamma.conditionId ?? gamma.condition_id);
  }
  const gamma = await fetchGammaMarketBySlug(config, marketInput);
  return String(gamma.conditionId ?? gamma.condition_id);
}

export async function getRewardsStatus(
  config: RuntimeConfig,
  args: { market?: string; orderIds?: string[] }
): Promise<Record<string, unknown>> {
  if (args.orderIds && args.orderIds.length > 0) {
    if (!hasTradingCredentials(config)) {
      throw new Error("Order scoring checks require authenticated CLOB credentials.");
    }
    const scoring = await invokePythonHelper<Record<string, unknown>>(
      config,
      "orders_scoring",
      { order_ids: args.orderIds }
    );
    return {
      scope: "orders",
      scoring
    };
  }

  if (!args.market) {
    throw new Error("Either market or order_ids is required.");
  }

  const conditionId = await resolveConditionIdish(config, args.market);
  const rewards = await requestJson<Record<string, unknown>>(
    `${config.clobUrl}/rewards/markets/${encodeURIComponent(conditionId)}`
  );
  return {
    scope: "market",
    conditionId,
    rewards
  };
}

export async function getLiveAlerts(
  config: RuntimeConfig,
  args: { scope: "watchlist" | "portfolio" | "all"; since?: string; limit: number }
): Promise<Record<string, unknown>> {
  try {
    const alerts = stateStoreForConfig(config).listAlerts(args).map((alert) => ({
      ...alert,
      metadata: alert.metadata ?? {}
    } satisfies StoredAlertRecord));
    if (alerts.length > 0) {
      return {
        cachePath: config.alertCachePath,
        stateDbPath: config.stateDbPath,
        count: alerts.length,
        alerts
      };
    }
  } catch {
    // fall back to the JSON cache when the SQLite state store is unavailable
  }

  try {
    const raw = JSON.parse(await readFile(config.alertCachePath, "utf8")) as
      | Record<string, unknown>
      | unknown[];
    const sourceAlerts = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as Record<string, unknown>).alerts)
        ? ((raw as Record<string, unknown>).alerts as unknown[])
        : [];

    const sinceTs = args.since ? Date.parse(args.since) : undefined;
    const alerts = safeArray<Record<string, unknown>>(sourceAlerts)
      .filter((alert) => {
        const createdAt = Date.parse(String(alert.createdAt ?? 0));
        if (sinceTs !== undefined && Number.isFinite(createdAt) && createdAt < sinceTs) {
          return false;
        }
        if (args.scope === "all") {
          return true;
        }
        return String(alert.scope ?? "all") === args.scope;
      })
      .sort((a, b) => Date.parse(String(b.createdAt ?? 0)) - Date.parse(String(a.createdAt ?? 0)))
      .slice(0, args.limit);

    return {
      cachePath: config.alertCachePath,
      stateDbPath: config.stateDbPath,
      count: alerts.length,
      alerts,
      note: alerts.length > 0 ? "Returned alerts from the legacy JSON cache." : undefined
    };
  } catch {
    return {
      cachePath: config.alertCachePath,
      stateDbPath: config.stateDbPath,
      count: 0,
      alerts: [],
      note: "No alert cache found yet. Start the watcher daemon or write alerts to the configured cache file."
    };
  }
}

export interface MarketExecutionEstimate {
  totalShares: number;
  totalNotionalUsd: number;
  averagePrice?: number;
  exhaustedBook: boolean;
  fullyFilled: boolean;
  usedLevels: Array<{ price: number; size: number; taken: number }>;
}

export function estimateBuyFromBudget(
  asks: PriceLevel[],
  budgetUsd: number,
  worstPrice: number
): MarketExecutionEstimate {
  let remainingBudget = budgetUsd;
  let totalShares = 0;
  let totalNotionalUsd = 0;
  const usedLevels: Array<{ price: number; size: number; taken: number }> = [];

  for (const level of asks) {
    if (remainingBudget <= 1e-9) {
      break;
    }
    if (level.price > worstPrice) {
      break;
    }
    const affordableShares = remainingBudget / level.price;
    const taken = Math.min(level.size, affordableShares);
    if (taken <= 0) {
      continue;
    }
    const spent = taken * level.price;
    remainingBudget -= spent;
    totalShares += taken;
    totalNotionalUsd += spent;
    usedLevels.push({ price: level.price, size: level.size, taken });
  }

  const exhaustedBook = asks.length === 0 || remainingBudget > 1e-6;
  return {
    totalShares: Number(totalShares.toFixed(6)),
    totalNotionalUsd: Number(totalNotionalUsd.toFixed(6)),
    averagePrice: totalShares > 0 ? Number((totalNotionalUsd / totalShares).toFixed(6)) : undefined,
    exhaustedBook,
    fullyFilled: remainingBudget <= 1e-6,
    usedLevels
  };
}

export function estimateSellShares(
  bids: PriceLevel[],
  shares: number,
  worstPrice: number
): MarketExecutionEstimate {
  let remainingShares = shares;
  let totalShares = 0;
  let totalNotionalUsd = 0;
  const usedLevels: Array<{ price: number; size: number; taken: number }> = [];

  for (const level of bids) {
    if (remainingShares <= 1e-9) {
      break;
    }
    if (level.price < worstPrice) {
      break;
    }
    const taken = Math.min(level.size, remainingShares);
    if (taken <= 0) {
      continue;
    }
    remainingShares -= taken;
    totalShares += taken;
    totalNotionalUsd += taken * level.price;
    usedLevels.push({ price: level.price, size: level.size, taken });
  }

  const exhaustedBook = bids.length === 0 || remainingShares > 1e-6;
  return {
    totalShares: Number(totalShares.toFixed(6)),
    totalNotionalUsd: Number(totalNotionalUsd.toFixed(6)),
    averagePrice: totalShares > 0 ? Number((totalNotionalUsd / totalShares).toFixed(6)) : undefined,
    exhaustedBook,
    fullyFilled: remainingShares <= 1e-6,
    usedLevels
  };
}

export function hoursUntil(endDate?: string): number | undefined {
  if (!endDate) {
    return undefined;
  }
  const timestamp = Date.parse(endDate);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return (timestamp - Date.now()) / (1000 * 60 * 60);
}
