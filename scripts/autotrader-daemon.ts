import process from "node:process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compactAutoTradingIterationResult,
  evaluateUniverseFreshness,
  normalizeAutoTradingMandate,
  refreshAutoTradingMarketSnapshots,
  runAutoTradingIteration,
  runIndependentForecastWriter,
  type AutoTradingSnapshotRefreshResult,
  type AutoTradingMandateInput
} from "../packages/auto-trader/src/index.js";
import {
  ingestUniverseMarkets,
  loadDiscoveryPolicies,
  normalizeUniverseMarketForStorage,
  type EnrichmentProfile,
  type UniverseMarket,
  type UniverseSource
} from "../packages/market-universe/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import {
  openStateStore,
  type StateStore,
  type StoredAutoTradingDecisionRecord,
  type StoredAutoTradingSessionRecord,
  type StoredUniverseMarketInput,
  type StoredPaperTradingExecutionReport
} from "../packages/state-store/src/index.js";

export interface AutotraderDaemonOptions {
  sessionId?: string;
  mode: "paper" | "live_guarded" | "live_autonomous";
  loop: boolean;
  intervalSeconds: number;
  respectNextRunAt: boolean;
  schedulerSlackSeconds: number;
  limit: number;
  autoForecast: boolean;
  autoRefreshUniverse?: boolean;
  autoRefreshSnapshots?: boolean;
  refreshSnapshotLimit?: number;
  refreshSnapshotMaxAgeMinutes?: number;
  maxUniverseAgeMinutes?: number;
  universeSource?: UniverseSource;
  universePageSize?: number;
  universeLimitPages?: number;
  universeEnrichTopN?: number;
  universeEnrichmentProfile?: EnrichmentProfile;
  stateDbPath: string;
  latestReportPath: string;
  observationLogPath: string;
  lockDir: string;
  staleLockSeconds: number;
  json: boolean;
}

export interface UniverseRefreshDecision {
  shouldRefresh: boolean;
  reason: "disabled" | "missing" | "fresh" | "stale" | "unparseable";
  latestRunId?: string;
  ageMinutes?: number;
  maxAgeMinutes: number;
}

export interface UniverseRefreshResult extends UniverseRefreshDecision {
  refreshed: boolean;
  runId?: string;
  totalMarkets?: number;
  totalEvents?: number;
  enrichedMarkets?: number;
  pageCount?: number;
}

export interface AutotraderDaemonSessionStatus {
  sessionId: string;
  name?: string;
  mode: string;
  status: string;
  due: boolean;
  skipped: boolean;
  skipReason?: string;
  nextRunAt?: string;
  dueInSeconds?: number;
}

interface LockHandle {
  lockDir: string;
  release: () => Promise<void>;
}

function envString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readArgValue(argv: string[], index: number): string | undefined {
  const arg = argv[index];
  const equals = arg.indexOf("=");
  return equals >= 0 ? arg.slice(equals + 1) : argv[index + 1];
}

function consumedNext(argv: string[], index: number): boolean {
  return !argv[index].includes("=");
}

export function parseDaemonArgs(argv = process.argv.slice(2)): AutotraderDaemonOptions {
  const explicitTradingFlag = process.env.POLYMARKET_ENABLE_TRADING;
  const config = loadRuntimeConfig();
  if (explicitTradingFlag !== undefined) {
    process.env.POLYMARKET_ENABLE_TRADING = explicitTradingFlag;
  }
  const options: AutotraderDaemonOptions = {
    sessionId: envString("AUTOTRADER_SESSION_ID"),
    mode: (envString("AUTOTRADER_MODE", "paper") as AutotraderDaemonOptions["mode"]) ?? "paper",
    loop: envBoolean("AUTOTRADER_DAEMON_LOOP", true),
    intervalSeconds: envNumber("AUTOTRADER_DAEMON_INTERVAL_SECONDS", 30),
    respectNextRunAt: envBoolean("AUTOTRADER_RESPECT_NEXT_RUN_AT", true),
    schedulerSlackSeconds: envNumber("AUTOTRADER_SCHEDULER_SLACK_SECONDS", 30),
    limit: envNumber("AUTOTRADER_LIMIT", 10),
    autoForecast: envBoolean("AUTOTRADER_AUTO_FORECAST", true),
    autoRefreshUniverse: envBoolean("AUTOTRADER_AUTO_REFRESH_UNIVERSE", true),
    autoRefreshSnapshots: envBoolean("AUTOTRADER_REFRESH_SNAPSHOTS", true),
    refreshSnapshotLimit: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_LIMIT", 50),
    refreshSnapshotMaxAgeMinutes: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_MAX_AGE_MINUTES", 5),
    maxUniverseAgeMinutes: envNumber("AUTOTRADER_MAX_UNIVERSE_AGE_MINUTES", 10),
    universeSource: envString("AUTOTRADER_UNIVERSE_SOURCE") as UniverseSource | undefined,
    universePageSize: envNumber("AUTOTRADER_UNIVERSE_PAGE_SIZE", 250),
    universeLimitPages: envNumber("AUTOTRADER_UNIVERSE_LIMIT_PAGES", 1),
    universeEnrichTopN: envNumber("AUTOTRADER_ENRICH_TOP_N", 250),
    universeEnrichmentProfile: (envString("AUTOTRADER_ENRICHMENT_PROFILE", "microstructure") as EnrichmentProfile) ?? "microstructure",
    stateDbPath: envString("AUTOTRADER_STATE_DB_PATH", config.stateDbPath) ?? config.stateDbPath,
    latestReportPath: envString("AUTOTRADER_DAEMON_LATEST_REPORT_PATH", "state/autotrader-daemon-latest.json") ?? "state/autotrader-daemon-latest.json",
    observationLogPath: envString("AUTOTRADER_DAEMON_LOG_PATH", "state/autotrader-daemon.jsonl") ?? "state/autotrader-daemon.jsonl",
    lockDir: envString("AUTOTRADER_DAEMON_LOCK_DIR", "state/autotrader-daemon.lock") ?? "state/autotrader-daemon.lock",
    staleLockSeconds: envNumber("AUTOTRADER_DAEMON_STALE_LOCK_SECONDS", 10 * 60),
    json: envBoolean("AUTOTRADER_DAEMON_JSON", false)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") {
      options.loop = false;
    } else if (arg === "--loop") {
      options.loop = true;
    } else if (arg === "--session-id" || arg.startsWith("--session-id=")) {
      options.sessionId = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--mode" || arg.startsWith("--mode=")) {
      options.mode = readArgValue(argv, index) as AutotraderDaemonOptions["mode"];
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--interval-seconds" || arg.startsWith("--interval-seconds=")) {
      options.intervalSeconds = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--ignore-next-run-at" || arg === "--force") {
      options.respectNextRunAt = false;
    } else if (arg === "--respect-next-run-at") {
      options.respectNextRunAt = true;
    } else if (arg === "--scheduler-slack-seconds" || arg.startsWith("--scheduler-slack-seconds=")) {
      options.schedulerSlackSeconds = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      options.limit = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--no-auto-forecast") {
      options.autoForecast = false;
    } else if (arg === "--no-auto-refresh-universe") {
      options.autoRefreshUniverse = false;
    } else if (arg === "--auto-refresh-universe") {
      options.autoRefreshUniverse = true;
    } else if (arg === "--refresh-snapshots") {
      options.autoRefreshSnapshots = true;
    } else if (arg === "--no-refresh-snapshots") {
      options.autoRefreshSnapshots = false;
    } else if (arg === "--refresh-snapshot-limit" || arg.startsWith("--refresh-snapshot-limit=")) {
      options.refreshSnapshotLimit = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--refresh-snapshot-max-age-minutes" || arg.startsWith("--refresh-snapshot-max-age-minutes=")) {
      options.refreshSnapshotMaxAgeMinutes = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--max-universe-age-minutes" || arg.startsWith("--max-universe-age-minutes=")) {
      options.maxUniverseAgeMinutes = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--universe-source" || arg.startsWith("--universe-source=")) {
      options.universeSource = readArgValue(argv, index) as UniverseSource | undefined;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--universe-page-size" || arg.startsWith("--universe-page-size=")) {
      options.universePageSize = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--universe-limit-pages" || arg.startsWith("--universe-limit-pages=")) {
      options.universeLimitPages = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--universe-enrich-top-n" || arg.startsWith("--universe-enrich-top-n=")) {
      options.universeEnrichTopN = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--universe-enrichment-profile" || arg.startsWith("--universe-enrichment-profile=")) {
      options.universeEnrichmentProfile = readArgValue(argv, index) as EnrichmentProfile | undefined;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--state-db" || arg.startsWith("--state-db=")) {
      options.stateDbPath = readArgValue(argv, index) ?? options.stateDbPath;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--latest-report" || arg.startsWith("--latest-report=")) {
      options.latestReportPath = readArgValue(argv, index) ?? options.latestReportPath;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--observation-log" || arg.startsWith("--observation-log=")) {
      options.observationLogPath = readArgValue(argv, index) ?? options.observationLogPath;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--lock-dir" || arg.startsWith("--lock-dir=")) {
      options.lockDir = readArgValue(argv, index) ?? options.lockDir;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--json") {
      options.json = true;
    }
  }

  options.intervalSeconds = Math.max(5, Math.min(24 * 60 * 60, options.intervalSeconds));
  options.schedulerSlackSeconds = Math.max(0, Math.min(60 * 60, options.schedulerSlackSeconds));
  options.limit = Math.max(1, Math.min(100, options.limit));
  options.refreshSnapshotLimit = Math.max(1, Math.min(250, Number(options.refreshSnapshotLimit ?? 50)));
  options.refreshSnapshotMaxAgeMinutes = Math.max(0, Math.min(24 * 60, Number(options.refreshSnapshotMaxAgeMinutes ?? 5)));
  options.maxUniverseAgeMinutes = Math.max(1, Math.min(24 * 60, Number(options.maxUniverseAgeMinutes ?? 10)));
  options.universePageSize = Math.max(25, Math.min(1_000, Number(options.universePageSize ?? 250)));
  options.universeLimitPages = Math.max(1, Math.min(100, Number(options.universeLimitPages ?? 1)));
  options.universeEnrichTopN = Math.max(0, Math.min(5_000, Number(options.universeEnrichTopN ?? 250)));
  return options;
}

async function refreshSnapshotsForSession(
  store: StateStore,
  mandate: ReturnType<typeof normalizeAutoTradingMandate>,
  universeRefresh: UniverseRefreshResult,
  options: AutotraderDaemonOptions,
  now: Date
): Promise<AutoTradingSnapshotRefreshResult | undefined> {
  if (options.autoRefreshSnapshots === false) {
    return undefined;
  }
  const runtimeConfig = loadRuntimeConfig();
  return refreshAutoTradingMarketSnapshots(store, runtimeConfig, {
    runId: universeRefresh.runId ?? universeRefresh.latestRunId,
    mandate,
    limit: options.refreshSnapshotLimit,
    maxAgeMinutes: options.refreshSnapshotMaxAgeMinutes,
    now
  });
}

function absolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function numericValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toStoredUniverseMarketInput(
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

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function acquireLock(lockDir: string, staleLockSeconds: number): Promise<LockHandle> {
  const resolved = absolutePath(lockDir);
  const metadataPath = path.join(resolved, "lock.json");
  try {
    await mkdir(resolved, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    const metadata = await readJsonIfExists(metadataPath);
    const createdAt = typeof metadata?.createdAt === "string" ? Date.parse(metadata.createdAt) : Number.NaN;
    const stale = Number.isFinite(createdAt) && Date.now() - createdAt > staleLockSeconds * 1000;
    if (!stale) {
      throw new Error(`Autotrader daemon lock is active at ${resolved}.`);
    }
    await rm(resolved, { recursive: true, force: true });
    await mkdir(resolved, { recursive: false });
  }
  await writeFile(metadataPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    pid: process.pid
  }, null, 2)}\n`, "utf8");
  return {
    lockDir: resolved,
    release: async () => {
      await rm(resolved, { recursive: true, force: true });
    }
  };
}

function isActiveSession(session: StoredAutoTradingSessionRecord, mode: string, now = new Date()): boolean {
  return session.status === "active" &&
    session.mode === mode &&
    Number.isFinite(Date.parse(session.endsAt)) &&
    Date.parse(session.endsAt) > now.getTime();
}

function latestIterationDecisions(decisions: StoredAutoTradingDecisionRecord[]): StoredAutoTradingDecisionRecord[] {
  const latestIterationId = decisions[0]?.iterationId;
  return latestIterationId
    ? decisions.filter((decision) => decision.iterationId === latestIterationId)
    : [];
}

function nextRunAtFromDecisions(decisions: StoredAutoTradingDecisionRecord[]): string | undefined {
  return latestIterationDecisions(decisions)
    .map((decision) => decision.nextCheckAt)
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort()[0];
}

export function sessionDueStatus(
  session: StoredAutoTradingSessionRecord,
  decisions: StoredAutoTradingDecisionRecord[],
  options: Pick<AutotraderDaemonOptions, "respectNextRunAt" | "schedulerSlackSeconds">,
  now = new Date()
): AutotraderDaemonSessionStatus {
  const nextRunAt = nextRunAtFromDecisions(decisions);
  if (!options.respectNextRunAt) {
    return {
      sessionId: session.sessionId,
      name: session.name,
      mode: session.mode,
      status: session.status,
      due: true,
      skipped: false,
      skipReason: "forced",
      nextRunAt
    };
  }
  const dueAt = typeof nextRunAt === "string" ? Date.parse(nextRunAt) : Number.NaN;
  if (!Number.isFinite(dueAt)) {
    return {
      sessionId: session.sessionId,
      name: session.name,
      mode: session.mode,
      status: session.status,
      due: true,
      skipped: false,
      skipReason: "missing_next_run_at",
      nextRunAt
    };
  }
  const dueInSeconds = Math.ceil((dueAt - now.getTime()) / 1000);
  const due = dueAt - options.schedulerSlackSeconds * 1000 <= now.getTime();
  return {
    sessionId: session.sessionId,
    name: session.name,
    mode: session.mode,
    status: session.status,
    due,
    skipped: !due,
    skipReason: due ? "due" : "not_due",
    nextRunAt,
    dueInSeconds
  };
}

function sessionsToCheck(store: StateStore, options: AutotraderDaemonOptions): StoredAutoTradingSessionRecord[] {
  if (options.sessionId) {
    const session = store.getAutoTradingSession(options.sessionId);
    if (!session) {
      throw new Error(`Unknown auto-trading session ${options.sessionId}.`);
    }
    return [session];
  }
  return store
    .listAutoTradingSessions({ status: "active", limit: 100 })
    .filter((session) => isActiveSession(session, options.mode));
}

function assertSafeMode(options: AutotraderDaemonOptions, session: StoredAutoTradingSessionRecord): void {
  if (process.env.POLYMARKET_ENABLE_TRADING !== "false") {
    throw new Error("Refusing to run daemon unless POLYMARKET_ENABLE_TRADING=false.");
  }
  if (options.mode !== "paper" || session.mode !== "paper") {
    throw new Error("This daemon is paper-only until live scheduling has separate production gates.");
  }
}

function actionCounts(decisions: Array<{ action: string }>): Record<string, number> {
  return decisions.reduce<Record<string, number>>((counts, decision) => {
    counts[decision.action] = (counts[decision.action] ?? 0) + 1;
    return counts;
  }, {});
}

function proposalDetails(decisions: Array<{
  action: string;
  marketKey?: string;
  title?: string;
  allocatedBudgetUsdc?: number;
  targetPrice?: number;
  shares?: number;
  blockers: string[];
}>, action: string): Array<Record<string, unknown>> {
  return decisions
    .filter((decision) => decision.action === action)
    .map((decision) => ({
      marketKey: decision.marketKey,
      title: decision.title,
      allocatedBudgetUsdc: decision.allocatedBudgetUsdc,
      targetPrice: decision.targetPrice,
      shares: decision.shares,
      blockers: decision.blockers
    }));
}

function executionMaterialChanges(report: StoredPaperTradingExecutionReport): string[] {
  const changes: string[] = [];
  if (report.orderCount <= 0) {
    return changes;
  }
  if (report.rejectedCount > 0) {
    changes.push("paper_execution_rejected_orders");
  }
  if (report.expiredCount > 0) {
    changes.push("paper_execution_expired_orders");
  }
  if (report.missedCount > 0) {
    changes.push("paper_execution_missed_orders");
  }
  if (report.partialFillCount > 0) {
    changes.push("paper_execution_partial_fills");
  }
  if (report.notionalFillRate < 0.5) {
    changes.push("paper_execution_low_fill_rate");
  }
  return changes;
}

export function universeRefreshDecision(
  latestRun: Record<string, unknown> | null | undefined,
  options: Pick<AutotraderDaemonOptions, "autoRefreshUniverse" | "maxUniverseAgeMinutes">,
  now = new Date()
): UniverseRefreshDecision {
  const maxAgeMinutes = Math.max(1, Number(options.maxUniverseAgeMinutes ?? 10));
  if (options.autoRefreshUniverse === false) {
    return {
      shouldRefresh: false,
      reason: "disabled",
      latestRunId: typeof latestRun?.runId === "string" ? latestRun.runId : undefined,
      maxAgeMinutes
    };
  }
  const freshness = evaluateUniverseFreshness(latestRun, { maxAgeMinutes }, now);
  const decision: UniverseRefreshDecision = {
    shouldRefresh: !freshness.isFresh,
    reason: freshness.reason,
    maxAgeMinutes: freshness.maxAgeMinutes
  };
  if (freshness.latestRunId !== undefined) {
    decision.latestRunId = freshness.latestRunId;
  }
  if (freshness.ageMinutes !== undefined) {
    decision.ageMinutes = freshness.ageMinutes;
  }
  return decision;
}

async function ensureFreshUniverse(
  store: StateStore,
  options: AutotraderDaemonOptions,
  now: Date
): Promise<UniverseRefreshResult> {
  const decision = universeRefreshDecision(store.getLatestUniverseRun(), options, now);
  if (!decision.shouldRefresh) {
    return {
      ...decision,
      refreshed: false
    };
  }

  const runtimeConfig = loadRuntimeConfig();
  const policies = await loadDiscoveryPolicies(path.resolve(runtimeConfig.cwd, "configs/discovery-policies.yaml"));
  const source = options.universeSource ?? policies.defaults.source;
  const pageSize = Number(options.universePageSize ?? policies.defaults.pageSize);
  const limitPages = Number(options.universeLimitPages ?? 1);
  const enrichTopN = Number(options.universeEnrichTopN ?? Math.max(options.limit * 25, policies.defaults.enrichTopN));
  const enrichmentProfile = options.universeEnrichmentProfile ?? policies.defaults.enrichmentProfile;
  const startedAt = now.toISOString();
  const runId = store.startUniverseRun({
    startedAt,
    source,
    activeOnly: true,
    closedIncluded: false,
    status: "running",
    metadata: {
      trigger: "autotrader-daemon",
      refreshReason: decision.reason,
      previousRunId: decision.latestRunId,
      previousAgeMinutes: decision.ageMinutes,
      maxAgeMinutes: decision.maxAgeMinutes,
      pageSize,
      limitPages,
      enrichTopN,
      enrichmentProfile
    }
  });

  try {
    const result = await ingestUniverseMarkets(runtimeConfig, {
      activeOnly: true,
      includeClosed: false,
      source,
      pageSize,
      limitPages,
      enrichTopN,
      enrichmentProfile,
      now
    }, policies);
    const capturedAt = new Date().toISOString();
    const stored = result.markets.map((market) => toStoredUniverseMarketInput(runId, market, capturedAt));
    store.recordUniverseMarkets(runId, stored);
    store.completeUniverseRun(runId, {
      completedAt: capturedAt,
      source: result.source,
      activeOnly: true,
      closedIncluded: false,
      totalEvents: result.rawEvents.length,
      totalMarkets: result.markets.length,
      enrichedMarkets: result.enrichedCount,
      status: "completed",
      metadata: {
        trigger: "autotrader-daemon",
        refreshReason: decision.reason,
        previousRunId: decision.latestRunId,
        previousAgeMinutes: decision.ageMinutes,
        maxAgeMinutes: decision.maxAgeMinutes,
        pageSize,
        limitPages,
        enrichTopN,
        enrichmentProfile,
        rawMarkets: result.rawMarkets.length,
        pageCount: result.pageCount
      }
    });
    return {
      ...decision,
      refreshed: true,
      runId,
      totalMarkets: result.markets.length,
      totalEvents: result.rawEvents.length,
      enrichedMarkets: result.enrichedCount,
      pageCount: result.pageCount
    };
  } catch (error) {
    store.completeUniverseRun(runId, {
      completedAt: new Date().toISOString(),
      source,
      activeOnly: true,
      closedIncluded: false,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        trigger: "autotrader-daemon",
        refreshReason: decision.reason,
        previousRunId: decision.latestRunId,
        previousAgeMinutes: decision.ageMinutes,
        maxAgeMinutes: decision.maxAgeMinutes
      }
    });
    throw error;
  }
}

async function persistDaemonObservation(
  observation: Record<string, unknown>,
  options: AutotraderDaemonOptions
): Promise<void> {
  const latestPath = absolutePath(options.latestReportPath);
  const logPath = absolutePath(options.observationLogPath);
  await mkdir(path.dirname(latestPath), { recursive: true });
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(latestPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
  await writeFile(logPath, `${JSON.stringify(observation)}\n`, { encoding: "utf8", flag: "a" });
}

export async function runDaemonOnce(options: AutotraderDaemonOptions, now = new Date()): Promise<Record<string, unknown>> {
  const lock = await acquireLock(options.lockDir, options.staleLockSeconds);
  const store = openStateStore(options.stateDbPath);
  const startedAt = now.toISOString();
  const observations: Record<string, unknown>[] = [];
  try {
    for (const session of sessionsToCheck(store, options)) {
      assertSafeMode(options, session);
      const previousDecisions = store.listAutoTradingDecisions({ sessionId: session.sessionId, limit: 200 });
      const due = sessionDueStatus(session, previousDecisions, options, now);
      if (!due.due) {
        observations.push({
          ...due,
          ran: false
        });
        continue;
      }

      const universeRefresh = await ensureFreshUniverse(store, options, now);
      const decisionNow = universeRefresh.refreshed ? new Date() : now;
      const mandate = normalizeAutoTradingMandate(session.mandate as unknown as AutoTradingMandateInput);
      const snapshotRefresh = await refreshSnapshotsForSession(
        store,
        mandate,
        universeRefresh,
        options,
        decisionNow
      );
      const forecastWriter = options.autoForecast
        ? runIndependentForecastWriter(store, {
          now: decisionNow,
          limit: Math.max(options.limit * 80, 1_000),
          minLiquidityUsdc: Math.max(0, mandate.minLiquidityUsdc * 0.5),
          maxSpreadCents: Math.max(mandate.maxSpreadCents, mandate.maxSpreadCents + 2)
        })
        : undefined;
      const iteration = runAutoTradingIteration(store, {
        sessionId: session.sessionId,
        now: decisionNow,
        limit: options.limit
      });
      const compact = compactAutoTradingIterationResult(iteration);
      const paperBuys = proposalDetails(iteration.candidates, "paper_buy_yes");
      const paperExits = proposalDetails(iteration.candidates, "paper_sell_yes");
      const ledger = store.getPaperTradingLedger(session.sessionId);
      const paperExecutionReport = store.getPaperTradingExecutionReport({
        sessionId: session.sessionId,
        limit: 20
      });
      const materialChanges = executionMaterialChanges(paperExecutionReport);
      const observation = {
        ...due,
        ran: true,
        generatedAt: iteration.generatedAt,
        runId: iteration.runId,
        iterationId: iteration.iterationId,
        universeRefresh,
        snapshotRefresh,
        forecastWriter,
        summary: compact.summary,
        budgetUsdc: compact.summary.budgetUsdc,
        spentUsdc: compact.summary.spentUsdc,
        remainingBudgetUsdc: compact.summary.remainingBudgetUsdc,
        positionValueUsdc: compact.summary.positionValueUsdc,
        unrealizedPnlUsdc: compact.summary.unrealizedPnlUsdc,
        realizedPnlUsdc: compact.summary.realizedPnlUsdc,
        totalPnlUsdc: compact.summary.totalPnlUsdc,
        portfolioValueUsdc: compact.summary.portfolioValueUsdc,
        materialChanges,
        actionCounts: actionCounts(iteration.candidates),
        blockerCounts: compact.summary.blockerCounts,
        paperBuyProposalCount: paperBuys.length,
        paperExitProposalCount: paperExits.length,
        paperBuyProposals: paperBuys,
        paperExitProposals: paperExits,
        paperExecutionReport,
        openPositions: ledger.positions
          .filter((position) => position.status === "open")
          .map((position) => ({
            marketKey: position.marketKey,
            title: position.title,
            shares: position.shares,
            averagePrice: position.averagePrice,
            currentPrice: position.currentPrice,
            currentValueUsdc: position.currentValueUsdc,
            unrealizedPnlUsdc: position.unrealizedPnlUsdc,
            unrealizedPnlPct: position.unrealizedPnlPct,
            openedAt: position.openedAt,
            updatedAt: position.updatedAt
          }))
      };
      store.recordAutomationRun({
        automationName: "autotrader-daemon",
        status: "completed",
        projectMode: "local",
        findingsCount: iteration.candidates.length,
        summary: `session ${session.sessionId}: ${compact.summary.proposedOrders} buys, ${compact.summary.exitOrders} exits; next ${compact.summary.nextRunAt ?? "unknown"}`,
        output: observation
      });
      observations.push(observation);
    }

    const report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      startedAt,
      stateDbPath: path.resolve(options.stateDbPath),
      mode: options.mode,
      loop: options.loop,
      sessionCount: observations.length,
      submittedOrders: 0,
      noSubmitInvariantHeld: true,
      observations
    };
    await persistDaemonObservation(report, options);
    return report;
  } catch (error) {
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      startedAt,
      stateDbPath: path.resolve(options.stateDbPath),
      error: error instanceof Error ? error.message : String(error),
      submittedOrders: 0,
      noSubmitInvariantHeld: true,
      observations
    };
    await persistDaemonObservation(report, options);
    throw error;
  } finally {
    store.close();
    await lock.release();
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function renderText(report: Record<string, unknown>): string {
  const observations = Array.isArray(report.observations) ? report.observations as Array<Record<string, unknown>> : [];
  const lines = [
    `Autotrader daemon: ${report.ok ? "ok" : "failed"}`,
    `Generated: ${report.generatedAt}`,
    `Sessions checked: ${observations.length}`,
    `No-submit invariant: ${report.noSubmitInvariantHeld ? "held" : "FAILED"}`
  ];
  for (const observation of observations) {
    const summary = observation.summary as Record<string, unknown> | undefined;
    const universeRefresh = observation.universeRefresh as Record<string, unknown> | undefined;
    lines.push(
      `- ${observation.sessionId}: ${observation.ran ? "ran" : `skipped ${observation.skipReason ?? ""}`}; ` +
      `$${Number(summary?.spentUsdc ?? 0).toFixed(4)} spent, ` +
      `$${Number(summary?.remainingBudgetUsdc ?? 0).toFixed(4)} remaining, ` +
      `${summary?.openPositions ?? 0} open, ` +
      `$${Number(summary?.unrealizedPnlUsdc ?? 0).toFixed(6)} unrealized PnL, ` +
      `${(observation.paperExecutionReport as Record<string, unknown> | undefined)?.orderCount ?? 0} paper orders, ` +
      `${Number((observation.paperExecutionReport as Record<string, unknown> | undefined)?.notionalFillRate ?? 0).toFixed(4)} fill rate, ` +
      `${observation.paperBuyProposalCount ?? 0} buy proposals, ` +
      `${observation.paperExitProposalCount ?? 0} exit proposals, ` +
      `universe ${universeRefresh?.refreshed ? "refreshed" : `kept ${universeRefresh?.reason ?? "unknown"}`}, ` +
      `snapshots ${(observation.snapshotRefresh as Record<string, unknown> | undefined)?.refreshed ?? 0} refreshed`
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseDaemonArgs();
  do {
    const report = await runDaemonOnce(options);
    console.log(options.json ? JSON.stringify(report, null, 2) : renderText(report));
    if (!options.loop) {
      break;
    }
    await sleep(options.intervalSeconds * 1000);
  } while (options.loop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
