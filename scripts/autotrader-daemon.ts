import process from "node:process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compactAutoTradingIterationResult,
  normalizeAutoTradingMandate,
  runAutoTradingIteration,
  runIndependentForecastWriter,
  type AutoTradingMandateInput
} from "../packages/auto-trader/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import {
  openStateStore,
  type StateStore,
  type StoredAutoTradingDecisionRecord,
  type StoredAutoTradingSessionRecord
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
  stateDbPath: string;
  latestReportPath: string;
  observationLogPath: string;
  lockDir: string;
  staleLockSeconds: number;
  json: boolean;
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
  return options;
}

function absolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
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

      const mandate = normalizeAutoTradingMandate(session.mandate as unknown as AutoTradingMandateInput);
      const forecastWriter = options.autoForecast
        ? runIndependentForecastWriter(store, {
          limit: Math.max(options.limit * 80, 1_000),
          minLiquidityUsdc: Math.max(0, mandate.minLiquidityUsdc * 0.5),
          maxSpreadCents: Math.max(mandate.maxSpreadCents, mandate.maxSpreadCents + 2)
        })
        : undefined;
      const iteration = runAutoTradingIteration(store, {
        sessionId: session.sessionId,
        now,
        limit: options.limit
      });
      const compact = compactAutoTradingIterationResult(iteration);
      const paperBuys = proposalDetails(iteration.candidates, "paper_buy_yes");
      const paperExits = proposalDetails(iteration.candidates, "paper_sell_yes");
      const ledger = store.getPaperTradingLedger(session.sessionId);
      const observation = {
        ...due,
        ran: true,
        generatedAt: iteration.generatedAt,
        runId: iteration.runId,
        iterationId: iteration.iterationId,
        forecastWriter,
        summary: compact.summary,
        actionCounts: actionCounts(iteration.candidates),
        paperBuyProposalCount: paperBuys.length,
        paperExitProposalCount: paperExits.length,
        paperBuyProposals: paperBuys,
        paperExitProposals: paperExits,
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
    lines.push(
      `- ${observation.sessionId}: ${observation.ran ? "ran" : `skipped ${observation.skipReason ?? ""}`}; ` +
      `$${Number(summary?.spentUsdc ?? 0).toFixed(4)} spent, ` +
      `$${Number(summary?.remainingBudgetUsdc ?? 0).toFixed(4)} remaining, ` +
      `${summary?.openPositions ?? 0} open, ` +
      `$${Number(summary?.unrealizedPnlUsdc ?? 0).toFixed(6)} unrealized PnL, ` +
      `${observation.paperBuyProposalCount ?? 0} buy proposals, ` +
      `${observation.paperExitProposalCount ?? 0} exit proposals`
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
