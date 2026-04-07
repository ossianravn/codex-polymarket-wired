import path from "node:path";
import process from "node:process";

import {
  getPositions,
  hasTradingCredentials,
  invokePythonHelper,
  loadRuntimeConfig,
  resolveDefaultUserAddress
} from "../../../packages/polymarket-core/src/index.js";
import { loadRiskLimits, type RiskLimits } from "../../../packages/policy-engine/src/index.js";
import {
  buildExecutionQueue,
  listStrategyCandidates,
  loadStrategyPolicies,
  summarizeTrackedMarkets,
  type ExecutionQueueItem,
  type StrategyCandidate
} from "../../../packages/strategy-engine/src/index.js";
import { openStateStore, type StateStore } from "../../../packages/state-store/src/index.js";

export interface ExecutionPolicy {
  enabled: boolean;
  allowPassiveQuotes: boolean;
  allowInventoryRebalancing: boolean;
  heartbeatEnabled: boolean;
  maxOrderUsd: number;
}

export interface PendingAction {
  type: "submit_preview" | "cancel_order" | "cancel_market" | "cancel_all";
  payload: Record<string, unknown>;
}

export interface ExecutorCliOptions {
  once: boolean;
  json: boolean;
  applyCancels: boolean;
  includeWaiting: boolean;
  limit: number;
  intervalSeconds: number;
}

export interface OpenOrderSyncSummary {
  attempted: boolean;
  skippedReason?: string;
  fetched: number;
  upserted: number;
  markedNotOnVenue: number;
}

export interface PortfolioSyncSummary {
  attempted: boolean;
  skippedReason?: string;
  ownerAddress?: string;
  snapshotId?: string;
  positions: number;
  grossCurrentValueUsd: number;
}

export interface CancelSummary {
  attempted: boolean;
  skippedReason?: string;
  requested: number;
  cancelledOrderIds: string[];
  result?: Record<string, unknown>;
}

export interface ExecutorIterationResult {
  generatedAt: string;
  dbPath: string;
  trackedMarketSummary: Record<string, number>;
  sync: OpenOrderSyncSummary;
  portfolio: PortfolioSyncSummary;
  candidates: StrategyCandidate[];
  queue: ExecutionQueueItem[];
  cancelSummary: CancelSummary;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function parseCliArgs(argv = process.argv.slice(2)): ExecutorCliOptions {
  let once = false;
  let json = false;
  let applyCancels = false;
  let includeWaiting = false;
  let limit = 25;
  let intervalSeconds = 60;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") {
      once = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--apply-cancels") {
      applyCancels = true;
    } else if (arg === "--include-waiting") {
      includeWaiting = true;
    } else if (arg === "--limit") {
      limit = Math.max(1, Math.min(250, Number(argv[index + 1] ?? limit)));
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      limit = Math.max(1, Math.min(250, Number(arg.split("=")[1] ?? limit)));
    } else if (arg === "--interval-seconds") {
      intervalSeconds = Math.max(5, Number(argv[index + 1] ?? intervalSeconds));
      index += 1;
    } else if (arg.startsWith("--interval-seconds=")) {
      intervalSeconds = Math.max(5, Number(arg.split("=")[1] ?? intervalSeconds));
    }
  }

  return {
    once,
    json,
    applyCancels,
    includeWaiting,
    limit,
    intervalSeconds
  };
}

function orderIdsFromQueue(queue: ExecutionQueueItem[]): string[] {
  return Array.from(
    new Set(
      queue
        .filter((item) => item.action === "cancel-orders")
        .flatMap((item) => item.staleOrderIds ?? [])
        .filter((orderId) => orderId.length > 0)
    )
  );
}

async function syncLiveOpenOrders(
  store: StateStore
): Promise<{ config: ReturnType<typeof loadRuntimeConfig>; summary: OpenOrderSyncSummary }> {
  const config = loadRuntimeConfig();
  if (!hasTradingCredentials(config)) {
    return {
      config,
      summary: {
        attempted: false,
        skippedReason: "missing_credentials",
        fetched: 0,
        upserted: 0,
        markedNotOnVenue: 0
      }
    };
  }

  const liveOrders = await invokePythonHelper<Record<string, unknown>[]>(config, "open_orders", {
    limit: 500
  });
  const seenOrderIds: string[] = [];
  let upserted = 0;

  for (const rawOrder of liveOrders) {
    const orderId = firstString(rawOrder.id, rawOrder.orderID, rawOrder.order_id, rawOrder.orderId);
    if (!orderId) {
      continue;
    }
    seenOrderIds.push(orderId);
    store.recordOrderSubmission({
      orderId,
      conditionId: firstString(rawOrder.market, rawOrder.condition_id, rawOrder.conditionId),
      marketId: firstString(rawOrder.market_id, rawOrder.marketId),
      side: firstString(rawOrder.side),
      status: firstString(rawOrder.status, "open_live"),
      orderKind: firstString(rawOrder.order_type, rawOrder.orderType),
      price: asNumber(rawOrder.price),
      size: asNumber(rawOrder.size ?? rawOrder.original_size ?? rawOrder.amount),
      notionalUsd: asNumber(rawOrder.notional ?? rawOrder.usdc_size ?? rawOrder.value),
      submittedAt: firstString(rawOrder.created_at, rawOrder.createdAt, rawOrder.timestamp),
      payload: rawOrder
    });
    upserted += 1;
  }

  const markedNotOnVenue = store.markOrdersMissingFromVenue(seenOrderIds, "not_on_venue");
  return {
    config,
    summary: {
      attempted: true,
      fetched: liveOrders.length,
      upserted,
      markedNotOnVenue
    }
  };
}

async function syncLivePositions(store: StateStore): Promise<PortfolioSyncSummary> {
  const config = loadRuntimeConfig();
  const ownerAddress = resolveDefaultUserAddress(config);
  if (!ownerAddress) {
    return {
      attempted: false,
      skippedReason: "missing_owner_address",
      positions: 0,
      grossCurrentValueUsd: 0
    };
  }

  try {
    const positions = await getPositions(config, {
      ownerAddress,
      includeClosed: false,
      limit: 500
    });
    const current = Array.isArray(positions.current) ? (positions.current as Array<Record<string, unknown>>) : [];
    const closed = Array.isArray(positions.closed) ? (positions.closed as Array<Record<string, unknown>>) : [];
    const snapshotId = store.recordPortfolioSnapshot({
      ownerAddress: String(positions.ownerAddress ?? ownerAddress),
      grossCurrentValueUsd: asNumber(positions.grossCurrentValueUsd),
      current,
      closed,
      source: "data_api",
      metadata: {
        market: positions.market ?? null
      }
    });

    return {
      attempted: true,
      ownerAddress: String(positions.ownerAddress ?? ownerAddress),
      snapshotId,
      positions: current.length,
      grossCurrentValueUsd: asNumber(positions.grossCurrentValueUsd) ?? 0
    };
  } catch (error) {
    return {
      attempted: false,
      skippedReason: `error:${String(error)}`,
      ownerAddress,
      positions: 0,
      grossCurrentValueUsd: 0
    };
  }
}

async function applyCancelActions(
  config: ReturnType<typeof loadRuntimeConfig>,
  store: StateStore,
  queue: ExecutionQueueItem[],
  applyCancels: boolean
): Promise<CancelSummary> {
  const cancelledOrderIds = orderIdsFromQueue(queue);
  if (cancelledOrderIds.length === 0) {
    return {
      attempted: false,
      skippedReason: "no_cancel_actions",
      requested: 0,
      cancelledOrderIds: []
    };
  }
  if (!applyCancels) {
    return {
      attempted: false,
      skippedReason: "dry_run",
      requested: cancelledOrderIds.length,
      cancelledOrderIds
    };
  }
  if (!hasTradingCredentials(config)) {
    return {
      attempted: false,
      skippedReason: "missing_credentials",
      requested: cancelledOrderIds.length,
      cancelledOrderIds
    };
  }

  const result = await invokePythonHelper<Record<string, unknown>>(config, "cancel_orders", {
    order_ids: cancelledOrderIds
  });
  for (const orderId of cancelledOrderIds) {
    store.updateOrderStatus(orderId, "cancel_requested", {
      result,
      orderId,
      cancelledAt: nowIso()
    });
  }
  return {
    attempted: true,
    requested: cancelledOrderIds.length,
    cancelledOrderIds,
    result
  };
}

function renderHumanSummary(result: ExecutorIterationResult): string {
  const queueLines = result.queue.slice(0, 10).map((item) => {
    const reasons = [...item.blockers, ...item.notes].slice(0, 3).join(" | ");
    return `- [${item.status}] ${item.title} -> ${item.action}${reasons ? ` (${reasons})` : ""}`;
  });
  return [
    `Executor iteration: ${result.generatedAt}`,
    `DB: ${result.dbPath}`,
    `Tracked markets: ${result.trackedMarketSummary.total ?? 0}`,
    `Queue items: ${result.queue.length}`,
    `Open-order sync: ${result.sync.attempted ? `${result.sync.fetched} fetched / ${result.sync.markedNotOnVenue} marked not_on_venue` : `skipped (${result.sync.skippedReason ?? "unknown"})`}`,
    `Portfolio sync: ${result.portfolio.attempted ? `${result.portfolio.positions} positions / ${result.portfolio.grossCurrentValueUsd.toFixed(2)} USD` : `skipped (${result.portfolio.skippedReason ?? "unknown"})`}`,
    `Cancels: ${result.cancelSummary.attempted ? `${result.cancelSummary.requested} requested` : `skipped (${result.cancelSummary.skippedReason ?? "unknown"})`}`,
    ...(queueLines.length > 0 ? ["Top actions:", ...queueLines] : ["Top actions: none"])
  ].join("\n");
}

export async function runExecutorIteration(options?: Partial<ExecutorCliOptions>): Promise<ExecutorIterationResult> {
  const cli = {
    ...parseCliArgs([]),
    ...options
  } satisfies ExecutorCliOptions;
  const config = loadRuntimeConfig();
  const riskLimits = await loadRiskLimits(path.resolve(config.cwd, "configs/risk-limits.yaml"));
  const strategyPolicies = await loadStrategyPolicies(
    path.resolve(config.cwd, "configs/strategy-policies.yaml")
  );
  const store = openStateStore(config.stateDbPath);

  const syncResult = await syncLiveOpenOrders(store);
  const portfolioResult = await syncLivePositions(store);
  const trackedMarketSummary = summarizeTrackedMarkets(store.listTrackedMarkets(500));
  const candidates = listStrategyCandidates(store, strategyPolicies, riskLimits, {
    limit: cli.limit,
    includeBlocked: true,
    includeWaiting: cli.includeWaiting
  });
  const queue = buildExecutionQueue(store, strategyPolicies, riskLimits, {
    limit: cli.limit,
    includeWaiting: cli.includeWaiting
  });
  const cancelSummary = await applyCancelActions(syncResult.config, store, queue, cli.applyCancels);

  const result = {
    generatedAt: nowIso(),
    dbPath: config.stateDbPath,
    trackedMarketSummary,
    sync: syncResult.summary,
    portfolio: portfolioResult,
    candidates,
    queue,
    cancelSummary
  } satisfies ExecutorIterationResult;

  store.recordAutomationRun({
    automationName: "executor-daemon",
    status: "completed",
    projectMode: "local",
    startedAt: result.generatedAt,
    finishedAt: result.generatedAt,
    findingsCount: queue.length,
    summary: `executor queue ${queue.length}; sync fetched ${result.sync.fetched}; portfolio positions ${result.portfolio.positions}; cancels ${result.cancelSummary.requested}`,
    output: result as unknown as Record<string, unknown>
  });

  return result;
}

/**
 * Responsibilities:
 * - consume persisted classifications, research runs, previews, and orders from SQLite
 * - sync the local order table with live open orders when credentials are available
 * - produce a deterministic execution queue for cancel / monitor / preview workflows
 * - optionally issue cancel requests for stale live orders in explicit --apply-cancels mode
 *
 * Keep this service separate from Codex app automations.
 */
export async function startExecutor(): Promise<void> {
  const cli = parseCliArgs();
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  do {
    const result = await runExecutorIteration(cli);
    if (cli.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderHumanSummary(result));
    }
    if (cli.once) {
      break;
    }
    await sleep(cli.intervalSeconds * 1000);
  } while (!stopping);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startExecutor().catch((error) => {
    console.error("executor-daemon error:", error);
    process.exit(1);
  });
}
