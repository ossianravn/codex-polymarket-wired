import process from "node:process";
import path from "node:path";
import { readFile } from "node:fs/promises";

import { dueStatus, latestSessionObservation } from "./autotrader-scheduler.mjs";

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
    latestReportPath: envString("AUTOTRADER_LATEST_REPORT_PATH", "state/autotrader-heartbeat-latest.json"),
    observationLogPath: envString("AUTOTRADER_OBSERVATION_LOG_PATH", "state/autotrader-heartbeat.jsonl"),
    historyLimit: envNumber("AUTOTRADER_STATUS_HISTORY_LIMIT", 5),
    dueStatus: envBoolean("AUTOTRADER_DUE_STATUS", false),
    respectNextRunAt: envBoolean("AUTOTRADER_RESPECT_NEXT_RUN_AT", true),
    schedulerSlackSeconds: envNumber("AUTOTRADER_SCHEDULER_SLACK_SECONDS", 30),
    json: envBoolean("AUTOTRADER_STATUS_JSON", false)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--latest-report") {
      options.latestReportPath = next;
      index += 1;
    } else if (arg.startsWith("--latest-report=")) {
      options.latestReportPath = arg.split("=")[1];
    } else if (arg === "--observation-log") {
      options.observationLogPath = next;
      index += 1;
    } else if (arg.startsWith("--observation-log=")) {
      options.observationLogPath = arg.split("=")[1];
    } else if (arg === "--history-limit") {
      options.historyLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--history-limit=")) {
      options.historyLimit = Number(arg.split("=")[1]);
    } else if (arg === "--due-status") {
      options.dueStatus = true;
    } else if (arg === "--ignore-next-run-at" || arg === "--force") {
      options.respectNextRunAt = false;
    } else if (arg === "--respect-next-run-at") {
      options.respectNextRunAt = true;
    } else if (arg === "--scheduler-slack-seconds") {
      options.schedulerSlackSeconds = Number(next);
      index += 1;
    } else if (arg.startsWith("--scheduler-slack-seconds=")) {
      options.schedulerSlackSeconds = Number(arg.split("=")[1]);
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  return options;
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

async function readJsonlTail(filePath, limit) {
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(0, limit))
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function renderText(status) {
  if (!status.latest) {
    return [
      "Autotrader status: no observations yet.",
      `Latest report: ${status.paths.latestReportPath}`,
      `Observation log: ${status.paths.observationLogPath}`
    ].join("\n");
  }

  const latest = latestSessionObservation(status.latest) ?? status.latest;
  const changes = latest.materialChanges?.length ? latest.materialChanges.join(", ") : "none";
  const actionCounts = latest.actionCounts
    ? Object.entries(latest.actionCounts).map(([key, value]) => `${key}:${value}`).join(", ")
    : "unknown";
  const hasBudget = Number.isFinite(latest.budgetUsdc) || Number.isFinite(latest.remainingBudgetUsdc);
  const openPositionCount = Array.isArray(latest.openPositions)
    ? latest.openPositions.length
    : latest.openPositions ?? latest.summary?.openPositions;
  const budgetLine = hasBudget
    ? `Budget: $${(latest.spentUsdc ?? 0).toFixed(4)} spent, $${(latest.remainingBudgetUsdc ?? 0).toFixed(4)} remaining / $${(latest.budgetUsdc ?? 0).toFixed(4)} total`
    : "Budget: unknown";
  const pnlLine = hasBudget
    ? `Paper PnL: $${(latest.unrealizedPnlUsdc ?? 0).toFixed(6)} unrealized, $${(latest.realizedPnlUsdc ?? 0).toFixed(6)} realized, $${(latest.totalPnlUsdc ?? 0).toFixed(6)} total; open positions: ${openPositionCount ?? "unknown"}`
    : "Paper PnL: unknown";
  const execution = latest.paperExecutionReport;
  const executionLine = execution
    ? `Paper execution: ${execution.orderCount ?? 0} orders; fill rate ${((execution.notionalFillRate ?? 0) * 100).toFixed(2)}%; missed ${execution.missedCount ?? 0}; partial ${execution.partialFillCount ?? 0}; rejected ${execution.rejectedCount ?? 0}`
    : "Paper execution: unknown";
  const agentLoop = latest.agentLoop;
  const agentLine = agentLoop?.enabled
    ? `Agent loop: on; candidates ${agentLoop.candidateCount ?? 0}; plan ${agentLoop.planProvided ? "provided" : "missing"}; recorded ${agentLoop.applied?.recorded ?? 0}; blocked ${agentLoop.applied?.blocked ?? 0}`
    : "Agent loop: off";
  return [
    `Autotrader status: ${(status.latest.noSubmitInvariantHeld ?? latest.noSubmitInvariantHeld) ? "safe-no-submit" : "SAFETY VIOLATION"}`,
    `Generated: ${latest.generatedAt ?? status.latest.generatedAt}`,
    `Session: ${latest.sessionId ?? "unknown"}${latest.startedThisRun ? " (started this run)" : ""}`,
    `Scheduler: ${latest.schedulerSkipped ? `deferred (${latest.schedulerReason ?? "not_due"}, due in ${latest.schedulerDueInSeconds ?? "unknown"}s)` : (latest.schedulerReason ?? "ran")}`,
    `Material changes: ${changes}`,
    `Candidates: ${latest.dryRunCandidates ?? 0} dry-run; previews: ${latest.previewAttempts ?? 0}; submitted: ${latest.submittedOrders ?? 0}`,
    budgetLine,
    pnlLine,
    executionLine,
    agentLine,
    `Paper proposals: ${latest.paperBuyProposalCount ?? 0} buy, ${latest.paperExitProposalCount ?? 0} exit`,
    `Position diagnostics: ${latest.positionDiagnosticCount ?? 0}`,
    `Preview IDs: ${(latest.previewIds ?? []).join(", ") || "none"}`,
    `Actions: ${actionCounts}`,
    `Next run: ${latest.summary?.nextRunAt ?? latest.nextRunAt ?? "unknown"}`,
    `History records loaded: ${status.history.length}`
  ].join("\n");
}

function renderDueStatusText(report) {
  if (!report.ok) {
    return [
      "Autotrader due status: no observation found.",
      "Decision: run_heartbeat"
    ].join("\n");
  }
  const dueSuffix = report.scheduler.dueInSeconds === undefined ? "" : ` (${report.scheduler.dueInSeconds}s)`;
  return [
    `Autotrader due status: ${report.automationDecision}`,
    `Session: ${report.sessionId ?? "unknown"}`,
    `Due: ${report.due ? "yes" : "no"}${dueSuffix}`,
    `Next run: ${report.nextRunAt ?? "unknown"}`,
    `Notify: ${report.shouldNotify ? "yes" : "no"}`,
    `Material paper changes: ${report.materialPaperChanges.length ? report.materialPaperChanges.join(", ") : "none"}`,
    `Safety issue: ${report.safetyIssue ? "yes" : "no"}`,
    `Budget: $${(report.spentUsdc ?? 0).toFixed(4)} spent, $${(report.remainingBudgetUsdc ?? 0).toFixed(4)} remaining`,
    `Open positions: ${report.openPositions ?? "unknown"}; PnL: $${(report.unrealizedPnlUsdc ?? 0).toFixed(6)} unrealized, $${(report.realizedPnlUsdc ?? 0).toFixed(6)} realized`,
    report.paperExecutionReport
      ? `Paper execution: ${report.paperExecutionReport.orderCount ?? 0} orders; fill rate ${((report.paperExecutionReport.notionalFillRate ?? 0) * 100).toFixed(2)}%; missed ${report.paperExecutionReport.missedCount ?? 0}; partial ${report.paperExecutionReport.partialFillCount ?? 0}; rejected ${report.paperExecutionReport.rejectedCount ?? 0}`
      : "Paper execution: unknown",
    `Paper proposals: ${report.paperBuyProposalCount ?? 0} buy, ${report.paperExitProposalCount ?? 0} exit`,
    `Position diagnostics: ${report.positionDiagnosticCount ?? 0}`
  ].join("\n");
}

async function main() {
  const options = parseArgs();
  const latestReportPath = absolutePath(options.latestReportPath);
  const observationLogPath = absolutePath(options.observationLogPath);
  const latest = await readJsonIfExists(latestReportPath);
  if (options.dueStatus) {
    const report = dueStatus(latest, options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderDueStatusText(report));
    }
    return;
  }
  const history = await readJsonlTail(observationLogPath, options.historyLimit);
  const status = {
    ok: Boolean(latest),
    paths: {
      latestReportPath,
      observationLogPath
    },
    latest,
    history
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(renderText(status));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
