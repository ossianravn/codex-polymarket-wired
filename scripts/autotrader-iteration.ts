import process from "node:process";
import { readFile } from "node:fs/promises";

import {
  compactAutoTradingIterationResult,
  evaluateUniverseFreshness,
  normalizeAutoTradingMandate,
  refreshAutoTradingMarketSnapshots,
  runResearchEvidencePipeline,
  runIndependentForecastWriter,
  runAutoTradingIteration,
  type AutoTradingSnapshotRefreshResult,
  type AutoTradingMandateInput,
  type AutoTradingRiskProfile,
  type ResearchSourcePack
} from "../packages/auto-trader/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

interface CliOptions {
  sessionId?: string;
  name?: string;
  budgetUsdc?: number;
  timeframeHours?: number;
  riskProfile?: AutoTradingRiskProfile;
  mode?: "paper" | "live_guarded" | "live_autonomous";
  limit: number;
  autoForecast: boolean;
  refreshSnapshots: boolean;
  refreshSnapshotLimit: number;
  refreshSnapshotMaxAgeMinutes: number;
  researchSourceFile?: string;
  maxUniverseAgeMinutes: number;
  allowStaleUniverse: boolean;
  json: boolean;
  compact: boolean;
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

function parseCliArgs(argv = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {
    limit: 25,
    autoForecast: true,
    refreshSnapshots: envBoolean("AUTOTRADER_REFRESH_SNAPSHOTS", false),
    refreshSnapshotLimit: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_LIMIT", 50),
    refreshSnapshotMaxAgeMinutes: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_MAX_AGE_MINUTES", 5),
    researchSourceFile: process.env.AUTOTRADER_RESEARCH_SOURCE_FILE,
    maxUniverseAgeMinutes: envNumber("AUTOTRADER_MAX_UNIVERSE_AGE_MINUTES", 10),
    allowStaleUniverse: envBoolean("AUTOTRADER_ALLOW_STALE_UNIVERSE", false),
    json: false,
    compact: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--session-id") {
      options.sessionId = next;
      index += 1;
    } else if (arg.startsWith("--session-id=")) {
      options.sessionId = arg.split("=")[1];
    } else if (arg === "--name") {
      options.name = next;
      index += 1;
    } else if (arg.startsWith("--name=")) {
      options.name = arg.split("=")[1];
    } else if (arg === "--budget-usdc") {
      options.budgetUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--budget-usdc=")) {
      options.budgetUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--timeframe-hours") {
      options.timeframeHours = Number(next);
      index += 1;
    } else if (arg.startsWith("--timeframe-hours=")) {
      options.timeframeHours = Number(arg.split("=")[1]);
    } else if (arg === "--risk-profile") {
      options.riskProfile = next as AutoTradingRiskProfile;
      index += 1;
    } else if (arg.startsWith("--risk-profile=")) {
      options.riskProfile = arg.split("=")[1] as AutoTradingRiskProfile;
    } else if (arg === "--mode") {
      options.mode = next as CliOptions["mode"];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1] as CliOptions["mode"];
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
    } else if (arg === "--no-auto-forecast") {
      options.autoForecast = false;
    } else if (arg === "--refresh-snapshots") {
      options.refreshSnapshots = true;
    } else if (arg === "--no-refresh-snapshots") {
      options.refreshSnapshots = false;
    } else if (arg === "--refresh-snapshot-limit") {
      options.refreshSnapshotLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--refresh-snapshot-limit=")) {
      options.refreshSnapshotLimit = Number(arg.split("=")[1]);
    } else if (arg === "--refresh-snapshot-max-age-minutes") {
      options.refreshSnapshotMaxAgeMinutes = Number(next);
      index += 1;
    } else if (arg.startsWith("--refresh-snapshot-max-age-minutes=")) {
      options.refreshSnapshotMaxAgeMinutes = Number(arg.split("=")[1]);
    } else if (arg === "--research-source-file") {
      options.researchSourceFile = next;
      index += 1;
    } else if (arg.startsWith("--research-source-file=")) {
      options.researchSourceFile = arg.split("=")[1];
    } else if (arg === "--max-universe-age-minutes") {
      options.maxUniverseAgeMinutes = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-universe-age-minutes=")) {
      options.maxUniverseAgeMinutes = Number(arg.split("=")[1]);
    } else if (arg === "--allow-stale-universe") {
      options.allowStaleUniverse = true;
    } else if (arg === "--fail-on-stale-universe") {
      options.allowStaleUniverse = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--compact") {
      options.compact = true;
    }
  }
  options.maxUniverseAgeMinutes = Math.max(1, Math.min(24 * 60, Number(options.maxUniverseAgeMinutes)));
  options.refreshSnapshotLimit = Math.max(1, Math.min(250, Number(options.refreshSnapshotLimit)));
  options.refreshSnapshotMaxAgeMinutes = Math.max(0, Math.min(24 * 60, Number(options.refreshSnapshotMaxAgeMinutes)));
  return options;
}

async function loadResearchSourcePacks(filePath: string | undefined): Promise<ResearchSourcePack[] | undefined> {
  if (!filePath) {
    return undefined;
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as ResearchSourcePack[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { sourcePacks?: unknown }).sourcePacks)) {
    return (parsed as { sourcePacks: ResearchSourcePack[] }).sourcePacks;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { packs?: unknown }).packs)) {
    return (parsed as { packs: ResearchSourcePack[] }).packs;
  }
  throw new Error("Research source file must be an array or an object with sourcePacks array.");
}

function renderSummary(result: Awaited<ReturnType<typeof runAutoTradingIteration>>): string {
  const lines = result.candidates.slice(0, 10).map((decision) => {
    const budget = decision.allocatedBudgetUsdc === undefined ? "" : ` $${decision.allocatedBudgetUsdc.toFixed(2)}`;
    const price = decision.targetPrice === undefined ? "" : ` @ ${decision.targetPrice}`;
    return `- [${decision.status}] ${decision.action}${budget}${price}: ${decision.title ?? decision.marketKey ?? "unknown"} (${decision.score})`;
  });
  return [
    `Auto-trader iteration: ${result.generatedAt}`,
    `Session: ${result.session.sessionId}`,
    `Mode: ${result.summary.mode}`,
    `Risk: ${result.summary.riskProfile}`,
    `Budget: $${result.summary.spentUsdc.toFixed(2)} spent, $${result.summary.remainingBudgetUsdc.toFixed(2)} remaining / $${result.summary.budgetUsdc.toFixed(2)} total`,
    `Paper PnL: $${result.summary.unrealizedPnlUsdc.toFixed(2)} unrealized, $${result.summary.realizedPnlUsdc.toFixed(2)} realized, $${result.summary.totalPnlUsdc.toFixed(2)} total across ${result.summary.openPositions} open positions`,
    `This iteration: $${result.summary.proposedBudgetUsdc.toFixed(2)} proposed`,
    `Orders: ${result.summary.proposedOrders} buy, ${result.summary.exitOrders} exit; research: ${result.summary.researchRequired}; research requests: ${result.summary.researchRequests}; blocked: ${result.summary.blocked}`,
    `Risk blocked new buys: ${result.summary.riskBlockedNewBuys ? "yes" : "no"}`,
    `Next run: ${result.summary.nextRunAt ?? "unknown"}`,
    ...(lines.length > 0 ? ["Top decisions:", ...lines] : ["Top decisions: none"])
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  if (!options.sessionId && (options.budgetUsdc === undefined || options.timeframeHours === undefined || !options.riskProfile)) {
    throw new Error("Provide --session-id or a new mandate with --budget-usdc, --timeframe-hours, and --risk-profile.");
  }
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  const sourcePacks = await loadResearchSourcePacks(options.researchSourceFile);
  const universeFreshness = evaluateUniverseFreshness(
    store.getLatestUniverseRun(),
    { maxAgeMinutes: options.maxUniverseAgeMinutes }
  );
  if (!universeFreshness.isFresh && !options.allowStaleUniverse && !options.refreshSnapshots) {
    const output = {
      status: "blocked",
      blocker: "stale_universe_run",
      universeFreshness,
      message: `Auto-trader iteration blocked because universe discovery is ${universeFreshness.reason}. Refresh discovery or pass --allow-stale-universe for development-only runs.`
    };
    store.recordAutomationRun({
      automationName: "autotrader-iteration",
      status: "blocked",
      projectMode: "local",
      findingsCount: 0,
      summary: `blocked: universe discovery ${universeFreshness.reason}`,
      output
    });
    store.close();
    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(output.message);
    }
    process.exitCode = 2;
    return;
  }
  const existingSession = options.sessionId ? store.getAutoTradingSession(options.sessionId) : undefined;
  const mandateInput = existingSession
    ? existingSession.mandate as unknown as AutoTradingMandateInput
    : {
      name: options.name,
      budgetUsdc: options.budgetUsdc as number,
      timeframeHours: options.timeframeHours as number,
      riskProfile: options.riskProfile as AutoTradingRiskProfile,
      mode: options.mode ?? "paper"
    };
  const mandate = normalizeAutoTradingMandate(mandateInput);
  let snapshotRefresh: AutoTradingSnapshotRefreshResult | undefined;
  if (options.refreshSnapshots) {
    snapshotRefresh = await refreshAutoTradingMarketSnapshots(store, config, {
      runId: universeFreshness.latestRunId,
      mandate,
      limit: options.refreshSnapshotLimit,
      maxAgeMinutes: options.refreshSnapshotMaxAgeMinutes
    });
  }
  const researchPipeline = sourcePacks && sourcePacks.length > 0
    ? runResearchEvidencePipeline(store, {
      sessionId: options.sessionId,
      limit: options.limit,
      sourcePacks,
      automationName: "autotrader-iteration"
    })
    : undefined;
  const forecastWriter = options.autoForecast
    ? runIndependentForecastWriter(store, {
      limit: Math.max(options.limit * 80, 1_000),
      minLiquidityUsdc: Math.max(0, mandate.minLiquidityUsdc * 0.5),
      maxSpreadCents: Math.max(mandate.maxSpreadCents, mandate.maxSpreadCents + 2)
    })
    : undefined;
  const result = runAutoTradingIteration(store, {
    sessionId: options.sessionId,
    mandate: options.sessionId ? undefined : mandateInput,
    limit: options.limit
  });
  store.recordAutomationRun({
    automationName: "autotrader-iteration",
    status: "completed",
    projectMode: "local",
    findingsCount: result.candidates.length,
    summary: `auto-trader proposed ${result.summary.proposedOrders} paper orders; next run ${result.summary.nextRunAt ?? "unknown"}`,
    output: {
      universeFreshness,
      snapshotRefresh,
      researchPipeline,
      forecastWriter,
      iteration: result
    } as unknown as Record<string, unknown>
  });
  store.close();
  if (options.json) {
    const output = {
      universeFreshness,
      snapshotRefresh,
      researchPipeline,
      forecastWriter,
      ...(options.compact ? compactAutoTradingIterationResult(result) : result)
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log([
      forecastWriter
        ? `Forecast writer: ${forecastWriter.written} written, ${forecastWriter.skippedExisting} existing, ${forecastWriter.skippedIneligible} ineligible`
        : "Forecast writer: skipped",
      snapshotRefresh
        ? `Snapshot refresh: ${snapshotRefresh.refreshed} refreshed, ${snapshotRefresh.skippedFresh} fresh, ${snapshotRefresh.failed} failed`
        : "Snapshot refresh: skipped",
      `Universe freshness: ${universeFreshness.reason}${universeFreshness.ageMinutes === undefined ? "" : ` (${universeFreshness.ageMinutes.toFixed(1)}m old / ${universeFreshness.maxAgeMinutes}m max)`}`,
      renderSummary(result)
    ].join("\n"));
  }
}

main().catch((error) => {
  console.error("autotrader-iteration error:", error);
  process.exit(1);
});
