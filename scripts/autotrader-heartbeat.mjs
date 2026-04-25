import process from "node:process";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { schedulerDecision } from "./autotrader-scheduler.mjs";

const REQUIRED_TOOLS = [
  "ingest_market_universe",
  "start_auto_trading_session",
  "list_auto_trading_sessions",
  "run_auto_trading_iteration",
  "get_auto_trading_session",
  "run_auto_trading_executor"
];

function envString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function envNumber(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sessionId: envString("AUTOTRADER_SESSION_ID", undefined),
    sessionName: envString("AUTOTRADER_SESSION_NAME", "autotrader heartbeat live_guarded no submit"),
    stateDbPath: envString("AUTOTRADER_STATE_DB_PATH", "state/autotrader-heartbeat.sqlite"),
    ingest: envBoolean("AUTOTRADER_INGEST", true),
    source: envString("AUTOTRADER_UNIVERSE_SOURCE", "composite"),
    universePages: envNumber("AUTOTRADER_UNIVERSE_PAGES", 1),
    pageSize: envNumber("AUTOTRADER_PAGE_SIZE", 100),
    enrichTopN: envNumber("AUTOTRADER_ENRICH_TOP_N", 0),
    budgetUsdc: envNumber("AUTOTRADER_BUDGET_USDC", 30),
    timeframeHours: envNumber("AUTOTRADER_TIMEFRAME_HOURS", 24),
    riskProfile: envString("AUTOTRADER_RISK_PROFILE", "aggressive"),
    mode: envString("AUTOTRADER_MODE", "live_guarded"),
    maxSingleOrderUsdc: envNumber("AUTOTRADER_MAX_SINGLE_ORDER_USDC", 5),
    maxOpenPositions: envNumber("AUTOTRADER_MAX_OPEN_POSITIONS", 3),
    maxMarketHorizonHours: envNumber("AUTOTRADER_MAX_MARKET_HORIZON_HOURS", 72),
    minLiquidityUsdc: envNumber("AUTOTRADER_MIN_LIQUIDITY_USDC", 1000),
    maxSpreadCents: envNumber("AUTOTRADER_MAX_SPREAD_CENTS", 12),
    stopLossUsdc: envNumber("AUTOTRADER_STOP_LOSS_USDC", 10),
    limit: envNumber("AUTOTRADER_LIMIT", 25),
    refreshSnapshots: envBoolean("AUTOTRADER_REFRESH_SNAPSHOTS", true),
    refreshSnapshotLimit: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_LIMIT", 50),
    refreshSnapshotMaxAgeMinutes: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_MAX_AGE_MINUTES", 5),
    executorLimit: envNumber("AUTOTRADER_EXECUTOR_LIMIT", 5),
    previewLimit: envNumber("AUTOTRADER_PREVIEW_LIMIT", 1),
    respectNextRunAt: envBoolean("AUTOTRADER_RESPECT_NEXT_RUN_AT", true),
    schedulerSlackSeconds: envNumber("AUTOTRADER_SCHEDULER_SLACK_SECONDS", 30),
    researchSourceFile: envString("AUTOTRADER_RESEARCH_SOURCE_FILE", undefined),
    observationLogPath: envString("AUTOTRADER_OBSERVATION_LOG_PATH", "state/autotrader-heartbeat.jsonl"),
    latestReportPath: envString("AUTOTRADER_LATEST_REPORT_PATH", "state/autotrader-heartbeat-latest.json")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--session-id") {
      options.sessionId = next;
      index += 1;
    } else if (arg.startsWith("--session-id=")) {
      options.sessionId = arg.split("=")[1];
    } else if (arg === "--session-name") {
      options.sessionName = next;
      index += 1;
    } else if (arg.startsWith("--session-name=")) {
      options.sessionName = arg.split("=")[1];
    } else if (arg === "--state-db") {
      options.stateDbPath = next;
      index += 1;
    } else if (arg.startsWith("--state-db=")) {
      options.stateDbPath = arg.split("=")[1];
    } else if (arg === "--no-ingest") {
      options.ingest = false;
    } else if (arg === "--source") {
      options.source = next;
      index += 1;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1];
    } else if (arg === "--universe-pages") {
      options.universePages = Number(next);
      index += 1;
    } else if (arg.startsWith("--universe-pages=")) {
      options.universePages = Number(arg.split("=")[1]);
    } else if (arg === "--page-size") {
      options.pageSize = Number(next);
      index += 1;
    } else if (arg.startsWith("--page-size=")) {
      options.pageSize = Number(arg.split("=")[1]);
    } else if (arg === "--enrich-top-n") {
      options.enrichTopN = Number(next);
      index += 1;
    } else if (arg.startsWith("--enrich-top-n=")) {
      options.enrichTopN = Number(arg.split("=")[1]);
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
      options.riskProfile = next;
      index += 1;
    } else if (arg.startsWith("--risk-profile=")) {
      options.riskProfile = arg.split("=")[1];
    } else if (arg === "--mode") {
      options.mode = next;
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg === "--max-single-order-usdc") {
      options.maxSingleOrderUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-single-order-usdc=")) {
      options.maxSingleOrderUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--max-open-positions") {
      options.maxOpenPositions = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-open-positions=")) {
      options.maxOpenPositions = Number(arg.split("=")[1]);
    } else if (arg === "--max-market-horizon-hours") {
      options.maxMarketHorizonHours = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-market-horizon-hours=")) {
      options.maxMarketHorizonHours = Number(arg.split("=")[1]);
    } else if (arg === "--min-liquidity-usdc") {
      options.minLiquidityUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--min-liquidity-usdc=")) {
      options.minLiquidityUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--max-spread-cents") {
      options.maxSpreadCents = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-spread-cents=")) {
      options.maxSpreadCents = Number(arg.split("=")[1]);
    } else if (arg === "--stop-loss-usdc") {
      options.stopLossUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--stop-loss-usdc=")) {
      options.stopLossUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
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
    } else if (arg === "--executor-limit") {
      options.executorLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--executor-limit=")) {
      options.executorLimit = Number(arg.split("=")[1]);
    } else if (arg === "--preview-limit") {
      options.previewLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--preview-limit=")) {
      options.previewLimit = Number(arg.split("=")[1]);
    } else if (arg === "--no-preview") {
      options.previewLimit = 0;
    } else if (arg === "--ignore-next-run-at" || arg === "--force") {
      options.respectNextRunAt = false;
    } else if (arg === "--respect-next-run-at") {
      options.respectNextRunAt = true;
    } else if (arg === "--scheduler-slack-seconds") {
      options.schedulerSlackSeconds = Number(next);
      index += 1;
    } else if (arg.startsWith("--scheduler-slack-seconds=")) {
      options.schedulerSlackSeconds = Number(arg.split("=")[1]);
    } else if (arg === "--research-source-file") {
      options.researchSourceFile = next;
      index += 1;
    } else if (arg.startsWith("--research-source-file=")) {
      options.researchSourceFile = arg.split("=")[1];
    } else if (arg === "--observation-log") {
      options.observationLogPath = next;
      index += 1;
    } else if (arg.startsWith("--observation-log=")) {
      options.observationLogPath = arg.split("=")[1];
    } else if (arg === "--latest-report") {
      options.latestReportPath = next;
      index += 1;
    } else if (arg.startsWith("--latest-report=")) {
      options.latestReportPath = arg.split("=")[1];
    }
  }
  options.refreshSnapshotLimit = Math.max(1, Math.min(250, Number(options.refreshSnapshotLimit)));
  options.refreshSnapshotMaxAgeMinutes = Math.max(0, Math.min(24 * 60, Number(options.refreshSnapshotMaxAgeMinutes)));
  return options;
}

function makeTransport(options) {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["./node_modules/tsx/dist/cli.mjs", "./servers/polymarket-mcp/src/server.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: {
      ...process.env,
      POLYMARKET_ENABLE_TRADING: "false",
      POLYMARKET_REQUIRE_PREVIEW: "true",
      POLYMARKET_REQUIRE_GEOBLOCK_CHECK: "true",
      POLYMARKET_STATE_DB_PATH: options.stateDbPath
    }
  });
}

function textFromResult(result) {
  if (!Array.isArray(result?.content)) {
    return "";
  }
  return result.content
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function compactToolResult(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const text = textFromResult(result);
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function callTool(client, name, args) {
  const startedAt = Date.now();
  const result = await client.callTool({ name, arguments: args });
  if (result?.isError) {
    throw new Error(`${name} failed: ${textFromResult(result) || "Tool returned isError=true"}`);
  }
  return {
    elapsedMs: Date.now() - startedAt,
    output: compactToolResult(result)
  };
}

function countActions(decisions = []) {
  return decisions.reduce((counts, decision) => {
    const action = decision?.action ?? "unknown";
    counts[action] = (counts[action] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeExecutor(output) {
  const results = Array.isArray(output?.results) ? output.results : [];
  return {
    candidateCount: output?.candidateCount ?? 0,
    executedCount: output?.executedCount ?? 0,
    statuses: results.reduce((counts, item) => {
      const status = item?.execution?.status ?? "no_execution";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {}),
    previewIds: results.map((item) => item?.previewId).filter(Boolean),
    submitted: results.filter((item) => item?.execution?.status === "submitted").length
  };
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : undefined;
}

function roundedNumber(value, decimals = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : undefined;
}

function paperDecisionDetails(decisions = [], action) {
  return decisions
    .filter((decision) => decision?.action === action)
    .map((decision) => ({
      marketKey: decision.marketKey,
      title: decision.title,
      eventTitle: decision.market?.eventTitle,
      eventSlug: decision.market?.eventSlug,
      categoryGroup: decision.market?.categoryGroup,
      endDate: decision.market?.endDate,
      score: finiteNumber(decision.score),
      allocatedBudgetUsdc: finiteNumber(decision.allocatedBudgetUsdc),
      targetPrice: finiteNumber(decision.targetPrice),
      shares: finiteNumber(decision.shares),
      nextCheckAt: decision.nextCheckAt,
      reasonCodes: Array.isArray(decision.reasonCodes) ? decision.reasonCodes : [],
      blockers: Array.isArray(decision.blockers) ? decision.blockers : []
    }));
}

function iterationFinancialSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return undefined;
  }
  return {
    mode: summary.mode,
    riskProfile: summary.riskProfile,
    budgetUsdc: finiteNumber(summary.budgetUsdc),
    spentUsdc: finiteNumber(summary.spentUsdc),
    positionValueUsdc: finiteNumber(summary.positionValueUsdc),
    unrealizedPnlUsdc: finiteNumber(summary.unrealizedPnlUsdc),
    realizedPnlUsdc: finiteNumber(summary.realizedPnlUsdc),
    totalPnlUsdc: finiteNumber(summary.totalPnlUsdc),
    portfolioValueUsdc: finiteNumber(summary.portfolioValueUsdc),
    openPositions: finiteNumber(summary.openPositions),
    proposedBudgetUsdc: finiteNumber(summary.proposedBudgetUsdc),
    remainingBudgetUsdc: finiteNumber(summary.remainingBudgetUsdc),
    eligibleMarkets: finiteNumber(summary.eligibleMarkets),
    proposedOrders: finiteNumber(summary.proposedOrders),
    exitOrders: finiteNumber(summary.exitOrders),
    researchRequired: finiteNumber(summary.researchRequired),
    blocked: finiteNumber(summary.blocked),
    riskBlockedNewBuys: summary.riskBlockedNewBuys,
    nextRunAt: summary.nextRunAt
  };
}

function hoursUntilIso(nowIso, endIso) {
  if (typeof endIso !== "string" || !endIso.trim()) {
    return undefined;
  }
  const nowMs = Date.parse(nowIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(nowMs) || !Number.isFinite(endMs)) {
    return undefined;
  }
  return Number(((endMs - nowMs) / (1000 * 60 * 60)).toFixed(3));
}

function positionAction(position, decisionsByMarketKey) {
  const decision = decisionsByMarketKey.get(position.marketKey);
  if (decision?.action === "paper_sell_yes") {
    return "exit_proposed";
  }
  if (decision?.action === "paper_buy_yes") {
    return "added_this_iteration";
  }
  return position.status === "open" ? "hold" : "closed";
}

function positionReasonCodes(position, decision) {
  if (Array.isArray(decision?.reasonCodes) && decision.reasonCodes.length > 0) {
    return decision.reasonCodes;
  }
  if (position.status === "closed") {
    return ["position_closed"];
  }
  return ["paper_position_monitor"];
}

function buildPositionDiagnostics(ledger, decisions = [], generatedAt = new Date().toISOString()) {
  const positions = Array.isArray(ledger?.positions) ? ledger.positions : [];
  const decisionsByMarketKey = new Map(
    decisions
      .filter((decision) => typeof decision?.marketKey === "string")
      .map((decision) => [decision.marketKey, decision])
  );
  return positions
    .filter((position) => position?.status === "open")
    .map((position) => {
      const decision = decisionsByMarketKey.get(position.marketKey);
      const action = positionAction(position, decisionsByMarketKey);
      const endDate = typeof position.metadata?.endDate === "string" ? position.metadata.endDate : undefined;
      const entryScore = finiteNumber(position.metadata?.score);
      const currentPrice = finiteNumber(position.currentPrice);
      const averagePrice = finiteNumber(position.averagePrice);
      const priceMoveCents = currentPrice !== undefined && averagePrice !== undefined
        ? Number(((currentPrice - averagePrice) * 100).toFixed(3))
        : undefined;
      return {
        marketKey: position.marketKey,
        title: position.title,
        action,
        status: position.status,
        shares: roundedNumber(position.shares, 4),
        averagePrice: roundedNumber(averagePrice),
        currentPrice: roundedNumber(currentPrice),
        priceMoveCents,
        costUsdc: roundedNumber(position.costUsdc),
        currentValueUsdc: roundedNumber(position.currentValueUsdc),
        unrealizedPnlUsdc: roundedNumber(position.unrealizedPnlUsdc),
        unrealizedPnlPct: roundedNumber(position.unrealizedPnlPct),
        entryScore: roundedNumber(entryScore, 2),
        currentDecisionScore: roundedNumber(decision?.score, 2),
        endDate,
        hoursToEnd: hoursUntilIso(generatedAt, endDate),
        eventKey: typeof position.metadata?.eventKey === "string" ? position.metadata.eventKey : undefined,
        tokenId: typeof position.metadata?.tokenId === "string" ? position.metadata.tokenId : undefined,
        openedAt: position.openedAt,
        updatedAt: position.updatedAt,
        reasonCodes: positionReasonCodes(position, decision),
        blockers: Array.isArray(decision?.blockers) ? decision.blockers : []
      };
    })
    .sort((left, right) => {
      const actionRank = actionRankForPositionDiagnostic(left.action) - actionRankForPositionDiagnostic(right.action);
      if (actionRank !== 0) return actionRank;
      return (left.unrealizedPnlUsdc ?? 0) - (right.unrealizedPnlUsdc ?? 0);
    });
}

function normalizePositionDiagnostics(positionDiagnostics = []) {
  return positionDiagnostics.map((position) => ({
    ...position,
    shares: roundedNumber(position.shares, 4),
    averagePrice: roundedNumber(position.averagePrice),
    currentPrice: roundedNumber(position.currentPrice),
    priceMoveCents: roundedNumber(position.priceMoveCents, 3),
    costUsdc: roundedNumber(position.costUsdc),
    currentValueUsdc: roundedNumber(position.currentValueUsdc),
    unrealizedPnlUsdc: roundedNumber(position.unrealizedPnlUsdc),
    unrealizedPnlPct: roundedNumber(position.unrealizedPnlPct),
    entryScore: roundedNumber(position.entryScore, 2),
    currentDecisionScore: roundedNumber(position.currentDecisionScore, 2),
    hoursToEnd: roundedNumber(position.hoursToEnd, 3)
  }));
}

function actionRankForPositionDiagnostic(action) {
  switch (action) {
    case "exit_proposed":
      return 0;
    case "added_this_iteration":
      return 1;
    case "hold":
      return 2;
    default:
      return 3;
  }
}

function absolutePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function sourcePacksFromJson(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.sourcePacks)) {
    return parsed.sourcePacks;
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.packs)) {
    return parsed.packs;
  }
  throw new Error("Research source file must be an array or an object with sourcePacks array.");
}

function compactObservation(report) {
  const iterationSummary = report.iteration?.summary;
  const paperBuyProposals = report.iteration?.paperBuyProposals ?? [];
  const paperExitProposals = report.iteration?.paperExitProposals ?? [];
  const positionDiagnostics = normalizePositionDiagnostics(report.portfolio?.positionDiagnostics ?? []);
  return {
    generatedAt: new Date().toISOString(),
    stateDbPath: report.environment.stateDbPath,
    sessionId: report.summary?.sessionId,
    schedulerSkipped: report.scheduler?.skipped ?? false,
    schedulerReason: report.scheduler?.reason,
    schedulerDueInSeconds: report.scheduler?.dueInSeconds,
    startedThisRun: report.summary?.startedThisRun,
    dryRunCandidates: report.summary?.dryRunCandidates,
    previewAttempts: report.summary?.previewAttempts,
    previewIds: report.summary?.previewIds ?? [],
    submittedOrders: report.summary?.submittedOrders,
    noSubmitInvariantHeld: report.summary?.noSubmitInvariantHeld,
    nextRunAt: report.summary?.nextRunAt,
    actionCounts: report.iteration?.actionCounts ?? {},
    budgetUsdc: iterationSummary?.budgetUsdc,
    spentUsdc: iterationSummary?.spentUsdc,
    positionValueUsdc: iterationSummary?.positionValueUsdc,
    unrealizedPnlUsdc: iterationSummary?.unrealizedPnlUsdc,
    realizedPnlUsdc: iterationSummary?.realizedPnlUsdc,
    totalPnlUsdc: iterationSummary?.totalPnlUsdc,
    portfolioValueUsdc: iterationSummary?.portfolioValueUsdc,
    openPositions: iterationSummary?.openPositions,
    proposedBudgetUsdc: iterationSummary?.proposedBudgetUsdc,
    remainingBudgetUsdc: iterationSummary?.remainingBudgetUsdc,
    eligibleMarkets: iterationSummary?.eligibleMarkets,
    researchBundlesReady: report.iteration?.researchPipeline?.provider?.writtenBundles,
    researchRunsRecorded: report.iteration?.researchPipeline?.worker?.recordedResearchRuns,
    snapshotRefresh: report.iteration?.snapshotRefresh,
    proposedOrders: iterationSummary?.proposedOrders,
    exitOrders: iterationSummary?.exitOrders,
    researchRequired: iterationSummary?.researchRequired,
    blocked: iterationSummary?.blocked,
    riskBlockedNewBuys: iterationSummary?.riskBlockedNewBuys,
    paperBuyProposalCount: paperBuyProposals.length,
    paperExitProposalCount: paperExitProposals.length,
    paperBuyProposals,
    paperExitProposals,
    positionDiagnostics,
    positionDiagnosticCount: positionDiagnostics.length,
    universeTotalMarkets: report.universe?.totalMarkets,
    universeRunId: report.universe?.runId
  };
}

function proposalSignature(proposals = []) {
  return proposals
    .map((proposal) => [
      proposal.marketKey ?? "",
      proposal.allocatedBudgetUsdc ?? "",
      proposal.targetPrice ?? "",
      proposal.shares ?? "",
      (proposal.reasonCodes ?? []).join("|"),
      (proposal.blockers ?? []).join("|")
    ].join(":"))
    .sort()
    .join(";");
}

function observationChanges(previous, current) {
  if (!previous) {
    return ["first_observation"];
  }
  const changes = [];
  if (previous.sessionId !== current.sessionId) {
    changes.push("session_changed");
  }
  if (current.startedThisRun) {
    changes.push("session_started");
  }
  if (current.schedulerSkipped && !previous.schedulerSkipped) {
    changes.push("heartbeat_deferred_until_next_run");
  }
  if (previous.dryRunCandidates !== current.dryRunCandidates) {
    changes.push("candidate_count_changed");
  }
  if (previous.openPositions !== current.openPositions) {
    changes.push("open_positions_changed");
  }
  if (previous.remainingBudgetUsdc !== current.remainingBudgetUsdc) {
    changes.push("remaining_budget_changed");
  }
  if (previous.realizedPnlUsdc !== current.realizedPnlUsdc) {
    changes.push("realized_pnl_changed");
  }
  if (previous.totalPnlUsdc !== current.totalPnlUsdc) {
    changes.push("total_pnl_changed");
  }
  if (previous.paperBuyProposalCount !== current.paperBuyProposalCount) {
    changes.push("paper_buy_proposal_count_changed");
  } else if (proposalSignature(previous.paperBuyProposals) !== proposalSignature(current.paperBuyProposals)) {
    changes.push("paper_buy_proposals_changed");
  }
  if (previous.paperExitProposalCount !== current.paperExitProposalCount) {
    changes.push("paper_exit_proposal_count_changed");
  } else if (proposalSignature(previous.paperExitProposals) !== proposalSignature(current.paperExitProposals)) {
    changes.push("paper_exit_proposals_changed");
  }
  if (previous.previewAttempts !== current.previewAttempts) {
    changes.push("preview_attempt_count_changed");
  }
  const previousPreviewIds = new Set(previous.previewIds ?? []);
  const newPreviewIds = (current.previewIds ?? []).filter((previewId) => !previousPreviewIds.has(previewId));
  if (newPreviewIds.length > 0) {
    changes.push("new_preview_created");
  }
  if ((current.submittedOrders ?? 0) > 0) {
    changes.push("submitted_orders_detected");
  }
  if (current.noSubmitInvariantHeld === false) {
    changes.push("no_submit_invariant_failed");
  }
  return changes;
}

async function persistObservation(report, options) {
  const latestPath = absolutePath(options.latestReportPath);
  const logPath = absolutePath(options.observationLogPath);
  const previous = await readJsonIfExists(latestPath);
  const current = compactObservation(report);
  const materialChanges = observationChanges(previous, current);
  const record = {
    ...current,
    materialChanges
  };
  await mkdir(path.dirname(latestPath), { recursive: true });
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(latestPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await writeFile(logPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
  return {
    latestReportPath: latestPath,
    observationLogPath: logPath,
    materialChanges
  };
}

function sessionIsUsable(session, options) {
  if (!session || session.status !== "active" || session.mode !== options.mode) {
    return false;
  }
  if (options.sessionName && session.name !== options.sessionName) {
    return false;
  }
  const endsAt = Date.parse(session.endsAt);
  return Number.isFinite(endsAt) && endsAt > Date.now();
}

async function findOrCreateSession(client, options, report) {
  if (options.sessionId) {
    const existing = await callTool(client, "get_auto_trading_session", {
      session_id: options.sessionId,
      decision_limit: 25,
      compact: true
    });
    report.sessionLookup = {
      source: "session_id",
      elapsedMs: existing.elapsedMs,
      sessionId: options.sessionId
    };
    return { sessionId: options.sessionId, started: false, iterationOutput: undefined };
  }

  const listed = await callTool(client, "list_auto_trading_sessions", {
    status: "active",
    mode: options.mode,
    include_expired: false,
    limit: 100
  });
  const sessions = Array.isArray(listed.output?.sessions) ? listed.output.sessions : [];
  const reusable = sessions.find((session) => sessionIsUsable(session, options));
  report.sessionLookup = {
    source: "list_auto_trading_sessions",
    elapsedMs: listed.elapsedMs,
    activeCount: listed.output?.count ?? sessions.length,
    reusedSessionId: reusable?.sessionId
  };
  if (reusable?.sessionId) {
    return { sessionId: reusable.sessionId, started: false, iterationOutput: undefined };
  }

  const started = await callTool(client, "start_auto_trading_session", {
    name: options.sessionName,
    budget_usdc: options.budgetUsdc,
    timeframe_hours: options.timeframeHours,
    risk_profile: options.riskProfile,
    mode: options.mode,
    max_single_order_usdc: options.maxSingleOrderUsdc,
    max_open_positions: options.maxOpenPositions,
    max_market_horizon_hours: Math.max(options.maxMarketHorizonHours, options.timeframeHours),
    min_liquidity_usdc: options.minLiquidityUsdc,
    max_spread_cents: options.maxSpreadCents,
    stop_loss_usdc: Math.min(options.stopLossUsdc, options.budgetUsdc),
    refresh_snapshots: options.refreshSnapshots,
    refresh_snapshot_limit: options.refreshSnapshotLimit,
    refresh_snapshot_max_age_minutes: options.refreshSnapshotMaxAgeMinutes,
    limit: options.limit,
    compact: true
  });
  const sessionId = started.output?.session?.sessionId ?? started.output?.sessionId;
  if (!sessionId) {
    throw new Error("Could not derive session ID from start_auto_trading_session.");
  }
  const decisions = Array.isArray(started.output?.candidates) ? started.output.candidates : [];
  report.sessionStarted = {
    elapsedMs: started.elapsedMs,
    sessionId,
    actionCounts: countActions(decisions),
    proposedOrders: started.output?.summary?.proposedOrders,
    nextRunAt: started.output?.summary?.nextRunAt
  };
  return { sessionId, started: true, iterationOutput: started.output };
}

async function main() {
  const options = parseArgs();
  const latestPath = absolutePath(options.latestReportPath);
  const previousObservation = await readJsonIfExists(latestPath);
  const scheduler = schedulerDecision(previousObservation, options);
  const client = new Client({
    name: "codex-autotrader-heartbeat",
    version: "0.1.0"
  });
  const transport = makeTransport(options);
  if (transport.stderr) {
    transport.stderr.on("data", () => {
      // Drain server logs so stdio remains healthy.
    });
  }

  const report = {
    environment: {
      cwd: process.cwd(),
      node: process.version,
      stateDbPath: options.stateDbPath,
      tradingEnabled: false
    },
    options: {
      sessionName: options.sessionName,
      mode: options.mode,
      riskProfile: options.riskProfile,
      budgetUsdc: options.budgetUsdc,
      timeframeHours: options.timeframeHours,
      executorLimit: options.executorLimit,
      previewLimit: options.previewLimit,
      researchSourceFile: options.researchSourceFile ? absolutePath(options.researchSourceFile) : undefined
    },
    toolInventory: null,
    universe: null,
    sessionLookup: null,
    sessionStarted: null,
    iteration: null,
    portfolio: null,
    dryRunExecutor: null,
    previewExecutor: null,
    observation: null,
    scheduler,
    summary: null
  };

  if (scheduler.skipped) {
    const previousSummary = iterationFinancialSummary(previousObservation);
    report.iteration = {
      elapsedMs: 0,
      sessionId: previousObservation?.sessionId,
      startedThisRun: false,
      actionCounts: previousObservation?.actionCounts ?? {},
      summary: previousSummary,
      proposedOrders: previousObservation?.proposedOrders,
      exitOrders: previousObservation?.exitOrders,
      nextRunAt: scheduler.previousNextRunAt,
      paperBuyProposals: previousObservation?.paperBuyProposals ?? [],
      paperExitProposals: previousObservation?.paperExitProposals ?? []
    };
    report.portfolio = {
      elapsedMs: 0,
      source: "previous_observation",
      positionDiagnostics: previousObservation?.positionDiagnostics ?? []
    };
    report.dryRunExecutor = {
      elapsedMs: 0,
      candidateCount: previousObservation?.dryRunCandidates ?? 0,
      executedCount: 0,
      statuses: {},
      previewIds: [],
      submitted: 0
    };
    report.previewExecutor = {
      elapsedMs: 0,
      candidateCount: 0,
      executedCount: 0,
      statuses: {},
      previewIds: [],
      submitted: 0
    };
    report.summary = {
      ok: true,
      sessionId: previousObservation?.sessionId,
      startedThisRun: false,
      skippedDueToSchedule: true,
      schedulerReason: scheduler.reason,
      dryRunCandidates: previousObservation?.dryRunCandidates ?? 0,
      previewAttempts: previousObservation?.previewAttempts ?? 0,
      previewIds: previousObservation?.previewIds ?? [],
      submittedOrders: 0,
      noSubmitInvariantHeld: true,
      nextRunAt: scheduler.previousNextRunAt,
      spentUsdc: previousSummary?.spentUsdc,
      remainingBudgetUsdc: previousSummary?.remainingBudgetUsdc,
      openPositions: previousSummary?.openPositions,
      unrealizedPnlUsdc: previousSummary?.unrealizedPnlUsdc,
      realizedPnlUsdc: previousSummary?.realizedPnlUsdc,
      totalPnlUsdc: previousSummary?.totalPnlUsdc,
      portfolioValueUsdc: previousSummary?.portfolioValueUsdc,
      paperBuyProposalCount: previousObservation?.paperBuyProposalCount ?? 0,
      paperExitProposalCount: previousObservation?.paperExitProposalCount ?? 0
    };
    report.observation = await persistObservation(report, options);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    const missing = REQUIRED_TOOLS.filter((name) => !toolNames.includes(name));
    report.toolInventory = {
      count: toolNames.length,
      missing,
      required: REQUIRED_TOOLS
    };
    if (missing.length > 0) {
      throw new Error(`Missing required MCP tools: ${missing.join(", ")}`);
    }

    if (options.ingest) {
      const universe = await callTool(client, "ingest_market_universe", {
        active_only: true,
        include_closed: false,
        source: options.source,
        page_size: options.pageSize,
        limit_pages: options.universePages,
        min_liquidity_usdc: options.minLiquidityUsdc,
        enrich_top_n: options.enrichTopN,
        enrichment_profile: options.enrichTopN > 0 ? "microstructure" : "none"
      });
      report.universe = {
        elapsedMs: universe.elapsedMs,
        runId: universe.output?.runId ?? universe.output?.run_id,
        totalMarkets: universe.output?.totalMarkets ?? universe.output?.total_markets,
        enrichedMarkets: universe.output?.enrichedMarkets ?? universe.output?.enriched_markets
      };
    }

    const session = await findOrCreateSession(client, options, report);
    const researchSourcePacks = options.researchSourceFile
      ? sourcePacksFromJson(await readJsonIfExists(absolutePath(options.researchSourceFile)))
      : undefined;
    const iteration = session.iterationOutput
      ? { elapsedMs: 0, output: session.iterationOutput }
      : await callTool(client, "run_auto_trading_iteration", {
        session_id: session.sessionId,
        limit: options.limit,
        refresh_snapshots: options.refreshSnapshots,
        refresh_snapshot_limit: options.refreshSnapshotLimit,
        refresh_snapshot_max_age_minutes: options.refreshSnapshotMaxAgeMinutes,
        research_source_packs: researchSourcePacks,
        compact: true
      });
    const decisions = Array.isArray(iteration.output?.candidates) ? iteration.output.candidates : [];
    const summary = iterationFinancialSummary(iteration.output?.summary);
    report.iteration = {
      elapsedMs: iteration.elapsedMs,
      sessionId: session.sessionId,
      startedThisRun: session.started,
      actionCounts: countActions(decisions),
      researchPipeline: iteration.output?.researchPipeline,
      snapshotRefresh: iteration.output?.snapshotRefresh,
      summary,
      proposedOrders: summary?.proposedOrders,
      exitOrders: summary?.exitOrders,
      nextRunAt: summary?.nextRunAt,
      paperBuyProposals: paperDecisionDetails(decisions, "paper_buy_yes"),
      paperExitProposals: paperDecisionDetails(decisions, "paper_sell_yes")
    };

    const portfolio = await callTool(client, "get_auto_trading_session", {
      session_id: session.sessionId,
      decision_limit: 100,
      compact: false
    });
    report.portfolio = {
      elapsedMs: portfolio.elapsedMs,
      source: "get_auto_trading_session",
      decisionCount: portfolio.output?.decisionCount,
      ledgerSummary: portfolio.output?.ledger?.summary,
      positionDiagnostics: buildPositionDiagnostics(
        portfolio.output?.ledger,
        decisions,
        iteration.output?.generatedAt
      )
    };

    const dryRunExecutor = await callTool(client, "run_auto_trading_executor", {
      session_id: session.sessionId,
      limit: options.executorLimit,
      auto_submit: false,
      dry_run: true
    });
    report.dryRunExecutor = {
      elapsedMs: dryRunExecutor.elapsedMs,
      ...summarizeExecutor(dryRunExecutor.output)
    };

    if (options.previewLimit > 0) {
      const previewExecutor = await callTool(client, "run_auto_trading_executor", {
        session_id: session.sessionId,
        limit: options.previewLimit,
        auto_submit: false,
        dry_run: false
      });
      report.previewExecutor = {
        elapsedMs: previewExecutor.elapsedMs,
        ...summarizeExecutor(previewExecutor.output)
      };
    }

    const submittedOrders = (report.previewExecutor?.submitted ?? 0);
    report.summary = {
      ok: true,
      sessionId: session.sessionId,
      startedThisRun: session.started,
      dryRunCandidates: report.dryRunExecutor.candidateCount,
      previewAttempts: report.previewExecutor?.executedCount ?? 0,
      previewIds: report.previewExecutor?.previewIds ?? [],
      submittedOrders,
      noSubmitInvariantHeld: submittedOrders === 0,
      nextRunAt: report.iteration.nextRunAt,
      spentUsdc: summary?.spentUsdc,
      remainingBudgetUsdc: summary?.remainingBudgetUsdc,
      openPositions: summary?.openPositions,
      unrealizedPnlUsdc: summary?.unrealizedPnlUsdc,
      realizedPnlUsdc: summary?.realizedPnlUsdc,
      totalPnlUsdc: summary?.totalPnlUsdc,
      portfolioValueUsdc: summary?.portfolioValueUsdc,
      paperBuyProposalCount: report.iteration.paperBuyProposals.length,
      paperExitProposalCount: report.iteration.paperExitProposals.length
    };
    if (!report.summary.noSubmitInvariantHeld) {
      throw new Error("Heartbeat invariant failed: executor submitted an order while POLYMARKET_ENABLE_TRADING=false.");
    }
    report.observation = await persistObservation(report, options);
  } finally {
    await transport.close().catch(() => {});
  }

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
