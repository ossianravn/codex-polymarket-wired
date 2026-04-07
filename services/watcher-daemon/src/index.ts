import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

import {
  hoursUntil,
  loadRuntimeConfig,
  resolveMarketByIdentifier,
  type IdentifierType,
  type MarketSnapshot,
  type RuntimeConfig
} from "../../../packages/polymarket-core/src/index.js";
import { openStateStore, type StoredAlertRecord } from "../../../packages/state-store/src/index.js";

export interface WatchSubscription {
  kind: "market" | "user" | "rtds";
  identifier: string;
}

export interface AlertRecord {
  id: string;
  severity: "info" | "warn" | "critical";
  category: "price_move" | "spread_widening" | "new_comment" | "related_market_drift" | "resolution";
  title: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface WatchlistMarketConfig {
  identifier_type: IdentifierType;
  identifier: string;
  move_threshold_pct_points?: number;
  spread_threshold_cents?: number;
  include_related_markets?: boolean;
  include_comments?: boolean;
  scope?: "watchlist" | "portfolio" | "all";
}

export interface WatchlistGroupConfig {
  name: string;
  description?: string;
  markets: WatchlistMarketConfig[];
}

export interface WatchlistsConfig {
  watchlists: WatchlistGroupConfig[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

async function loadWatchlistsConfig(configPath: string): Promise<WatchlistsConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = YAML.parse(raw) as Record<string, unknown>;
  const watchlists = Array.isArray(parsed.watchlists) ? parsed.watchlists : [];
  return {
    watchlists: watchlists
      .map((group) => {
        const record = (group ?? {}) as Record<string, unknown>;
        const markets = Array.isArray(record.markets) ? record.markets : [];
        return {
          name: String(record.name ?? "unnamed"),
          description: typeof record.description === "string" ? record.description : undefined,
          markets: markets.map((item) => {
            const market = (item ?? {}) as Record<string, unknown>;
            return {
              identifier_type: String(market.identifier_type ?? market.identifierType ?? "slug") as IdentifierType,
              identifier: String(market.identifier ?? ""),
              move_threshold_pct_points: asNumber(market.move_threshold_pct_points ?? market.moveThresholdPctPoints),
              spread_threshold_cents: asNumber(market.spread_threshold_cents ?? market.spreadThresholdCents),
              include_related_markets: Boolean(market.include_related_markets ?? market.includeRelatedMarkets),
              include_comments: Boolean(market.include_comments ?? market.includeComments),
              scope: typeof market.scope === "string" ? (market.scope as "watchlist" | "portfolio" | "all") : "watchlist"
            } satisfies WatchlistMarketConfig;
          }).filter((market) => market.identifier.length > 0)
        } satisfies WatchlistGroupConfig;
      })
      .filter((group) => group.markets.length > 0)
  };
}

function alertId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function relatedPriceMap(snapshot: MarketSnapshot | Record<string, unknown> | null | undefined): Map<string, number> {
  const related = Array.isArray((snapshot as Record<string, unknown> | undefined)?.relatedMarkets)
    ? ((snapshot as Record<string, unknown>).relatedMarkets as Array<Record<string, unknown>>)
    : [];
  return new Map(
    related
      .map((item): [string, number | undefined] => [String(item.identifier ?? ""), asNumber(item.price)])
      .filter((item): item is [string, number] => item[0].length > 0 && item[1] !== undefined)
  );
}

function computeAlertSeverity(delta: number, threshold: number): "warn" | "critical" {
  return Math.abs(delta) >= threshold * 2 ? "critical" : "warn";
}

function buildAlerts(args: {
  scope: "watchlist" | "portfolio" | "all";
  groupName: string;
  marketKey: string;
  current: MarketSnapshot;
  previous: Record<string, unknown> | null;
  marketConfig: WatchlistMarketConfig;
  createdAt: string;
}): StoredAlertRecord[] {
  const alerts: StoredAlertRecord[] = [];
  const moveThreshold = args.marketConfig.move_threshold_pct_points ?? 3;
  const spreadThreshold = args.marketConfig.spread_threshold_cents ?? 5;
  const currentPrice = args.current.price;
  const previousPrice = asNumber(args.previous?.price ?? (args.previous?.snapshot as Record<string, unknown> | undefined)?.price);
  if (currentPrice !== undefined && previousPrice !== undefined) {
    const deltaPctPoints = Number(((currentPrice - previousPrice) * 100).toFixed(2));
    if (Math.abs(deltaPctPoints) >= moveThreshold) {
      alerts.push({
        id: alertId([args.marketKey, args.createdAt.slice(0, 16), "price_move", String(deltaPctPoints)]),
        scope: args.scope,
        severity: computeAlertSeverity(deltaPctPoints, moveThreshold),
        category: "price_move",
        title: `${args.current.title}: price moved ${deltaPctPoints > 0 ? "+" : ""}${deltaPctPoints.toFixed(2)}pt`,
        message: `Price moved from ${(previousPrice * 100).toFixed(2)} to ${(currentPrice * 100).toFixed(2)} (${deltaPctPoints > 0 ? "+" : ""}${deltaPctPoints.toFixed(2)} percentage points).`,
        createdAt: args.createdAt,
        marketKey: args.marketKey,
        metadata: {
          watchlist: args.groupName,
          previousPrice,
          currentPrice,
          deltaPctPoints
        }
      });
    }
  }

  const currentSpread = args.current.spreadCents;
  if (currentSpread !== undefined && currentSpread >= spreadThreshold) {
    const previousSpread = asNumber(args.previous?.spread_cents ?? (args.previous?.snapshot as Record<string, unknown> | undefined)?.spreadCents);
    if (previousSpread === undefined || currentSpread > previousSpread + 0.01) {
      alerts.push({
        id: alertId([args.marketKey, args.createdAt.slice(0, 16), "spread", String(currentSpread)]),
        scope: args.scope,
        severity: computeAlertSeverity(currentSpread, spreadThreshold),
        category: "spread_widening",
        title: `${args.current.title}: spread widened to ${currentSpread.toFixed(2)}¢`,
        message: previousSpread !== undefined
          ? `Spread widened from ${previousSpread.toFixed(2)}¢ to ${currentSpread.toFixed(2)}¢.`
          : `Spread is ${currentSpread.toFixed(2)}¢, above the configured threshold.` ,
        createdAt: args.createdAt,
        marketKey: args.marketKey,
        metadata: {
          watchlist: args.groupName,
          previousSpread,
          currentSpread
        }
      });
    }
  }

  if (args.marketConfig.include_comments) {
    const currentComments = args.current.commentsSummary ?? [];
    const previousComments = asStringArray(args.previous?.commentsSummary ?? (args.previous?.snapshot as Record<string, unknown> | undefined)?.commentsSummary);
    const newComments = currentComments.filter((comment) => !previousComments.includes(comment));
    if (newComments.length > 0) {
      alerts.push({
        id: alertId([args.marketKey, args.createdAt.slice(0, 16), "comments", newComments[0]]),
        scope: args.scope,
        severity: newComments.length >= 3 ? "critical" : "info",
        category: "new_comment",
        title: `${args.current.title}: ${newComments.length} new comment${newComments.length === 1 ? "" : "s"}`,
        message: newComments.slice(0, 2).join(" | "),
        createdAt: args.createdAt,
        marketKey: args.marketKey,
        metadata: {
          watchlist: args.groupName,
          newComments
        }
      });
    }
  }

  if (args.marketConfig.include_related_markets) {
    const currentRelated = relatedPriceMap(args.current);
    const previousRelated = relatedPriceMap(args.previous?.snapshot as Record<string, unknown> | undefined);
    const moveFloor = Math.max(moveThreshold / 2, 2);
    for (const [identifier, price] of currentRelated) {
      const previousRelatedPrice = previousRelated.get(identifier);
      if (previousRelatedPrice === undefined) {
        continue;
      }
      const deltaPctPoints = Number(((price - previousRelatedPrice) * 100).toFixed(2));
      if (Math.abs(deltaPctPoints) >= moveFloor) {
        alerts.push({
          id: alertId([args.marketKey, args.createdAt.slice(0, 16), "related", identifier, String(deltaPctPoints)]),
          scope: args.scope,
          severity: computeAlertSeverity(deltaPctPoints, moveFloor),
          category: "related_market_drift",
          title: `${args.current.title}: related market drift`,
          message: `Related market ${identifier} moved ${deltaPctPoints > 0 ? "+" : ""}${deltaPctPoints.toFixed(2)}pt since the prior scan.`,
          createdAt: args.createdAt,
          marketKey: args.marketKey,
          metadata: {
            watchlist: args.groupName,
            relatedIdentifier: identifier,
            previousRelatedPrice,
            currentRelatedPrice: price,
            deltaPctPoints
          }
        });
      }
    }
  }

  const hoursToResolution = hoursUntil(args.current.endDate);
  if (hoursToResolution !== undefined && hoursToResolution <= 24) {
    const roundedHours = Number(hoursToResolution.toFixed(2));
    alerts.push({
      id: alertId([args.marketKey, args.createdAt.slice(0, 16), "resolution", String(Math.floor(Math.max(0, roundedHours)))]),
      scope: args.scope,
      severity: roundedHours <= 6 ? "critical" : roundedHours <= 12 ? "warn" : "info",
      category: "resolution",
      title: `${args.current.title}: near resolution`,
      message: `Market is within ${roundedHours.toFixed(2)} hours of the configured end date.`,
      createdAt: args.createdAt,
      marketKey: args.marketKey,
      metadata: {
        watchlist: args.groupName,
        hoursToResolution: roundedHours,
        endDate: args.current.endDate
      }
    });
  }

  return alerts;
}

async function writeAlertCache(config: RuntimeConfig): Promise<void> {
  const stateStore = openStateStore(config.stateDbPath);
  const alerts = stateStore.listAlerts({ scope: "all", limit: 500 });
  await mkdir(path.dirname(config.alertCachePath), { recursive: true });
  await writeFile(
    config.alertCachePath,
    JSON.stringify({ generatedAt: nowIso(), stateDbPath: config.stateDbPath, alerts }, null, 2),
    "utf8"
  );
}

export async function runWatcherIteration(
  runtimeConfig = loadRuntimeConfig(),
  watchlistsPath = path.resolve(runtimeConfig.cwd, "configs/watchlists.yaml")
): Promise<{ scanned: number; generatedAlerts: StoredAlertRecord[]; watchlistsPath: string; stateDbPath: string }> {
  const watchlists = await loadWatchlistsConfig(watchlistsPath);
  const stateStore = openStateStore(runtimeConfig.stateDbPath);
  const generatedAlerts: StoredAlertRecord[] = [];
  let scanned = 0;

  for (const group of watchlists.watchlists) {
    for (const market of group.markets) {
      const previous = stateStore.getLatestMarketSnapshot({
        slug: market.identifier_type === "slug" ? market.identifier : undefined,
        conditionId: market.identifier_type === "condition_id" ? market.identifier : undefined,
        marketId: market.identifier_type === "market_id" ? market.identifier : undefined
      });
      const current = await resolveMarketByIdentifier(runtimeConfig, market.identifier_type, market.identifier, {
        includeComments: market.include_comments,
        includeOrderbookSummary: true,
        includeRelatedMarkets: market.include_related_markets
      });
      const marketKey = stateStore.resolveMarketKey({
        conditionId: current.conditionId,
        marketId: current.marketId,
        slug: current.slug,
        title: current.title
      });
      scanned += 1;
      generatedAlerts.push(
        ...buildAlerts({
          scope: market.scope ?? "watchlist",
          groupName: group.name,
          marketKey,
          current,
          previous,
          marketConfig: market,
          createdAt: nowIso()
        })
      );
    }
  }

  stateStore.recordAlerts(generatedAlerts);
  await writeAlertCache(runtimeConfig);
  return {
    scanned,
    generatedAlerts,
    watchlistsPath,
    stateDbPath: runtimeConfig.stateDbPath
  };
}

/**
 * Suggested responsibilities:
 * - subscribe to market websocket channels for book/price updates
 * - subscribe to user websocket channels for fills and order changes
 * - subscribe to RTDS topics for comments and activity
 * - materialize compact alert records into a local cache
 * - expose those alerts to the MCP layer through `get_live_alerts`
 *
 * This v1 implementation is intentionally poll-based so it works today with the
 * existing MCP and skill stack while still persisting durable watcher state.
 */
export async function startWatcher(options?: {
  once?: boolean;
  intervalSeconds?: number;
  watchlistsPath?: string;
}): Promise<void> {
  const config = loadRuntimeConfig();
  const intervalSeconds = Math.max(15, Math.trunc(options?.intervalSeconds ?? Number(process.env.POLYMARKET_WATCHER_INTERVAL_SECONDS ?? "300")));
  const watchlistsPath = options?.watchlistsPath ?? path.resolve(config.cwd, "configs/watchlists.yaml");

  do {
    const result = await runWatcherIteration(config, watchlistsPath);
    console.log(`watcher iteration complete: scanned=${result.scanned} alerts=${result.generatedAlerts.length} db=${result.stateDbPath}`);
    if (options?.once) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  } while (true);
}

const isEntrypoint = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;

if (isEntrypoint) {
  const once = process.argv.includes("--once");
  startWatcher({ once }).catch((error) => {
    console.error("watcher daemon error:", error);
    process.exit(1);
  });
}
