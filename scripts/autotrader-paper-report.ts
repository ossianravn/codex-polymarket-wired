import process from "node:process";

import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore, type StoredPaperTradingExecutionReport } from "../packages/state-store/src/index.js";

interface Options {
  sessionId?: string;
  since?: string;
  limit: number;
  json: boolean;
}

function parseArgs(argv = process.argv.slice(2)): Options {
  const options: Options = {
    sessionId: process.env.AUTOTRADER_SESSION_ID,
    since: process.env.AUTOTRADER_PAPER_REPORT_SINCE,
    limit: Number(process.env.AUTOTRADER_PAPER_REPORT_LIMIT ?? 20),
    json: ["1", "true", "yes", "on"].includes(String(process.env.AUTOTRADER_PAPER_REPORT_JSON ?? "").toLowerCase())
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--session-id") {
      options.sessionId = next;
      index += 1;
    } else if (arg.startsWith("--session-id=")) {
      options.sessionId = arg.slice("--session-id=".length);
    } else if (arg === "--since") {
      options.since = next;
      index += 1;
    } else if (arg.startsWith("--since=")) {
      options.since = arg.slice("--since=".length);
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  options.limit = Math.max(1, Math.min(100, Number.isFinite(options.limit) ? options.limit : 20));
  return options;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function topCounts(counts: Record<string, number>, limit = 8): string {
  const entries = Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}:${value}`).join(", ") : "none";
}

function renderText(report: StoredPaperTradingExecutionReport): string {
  const recent = report.recentOrders.slice(0, Math.min(10, report.recentOrders.length)).map((order) => {
    const reasonCodes = Array.isArray(order.metadata.reasonCodes)
      ? order.metadata.reasonCodes.map(String).join(",")
      : "none";
    return [
      `- ${order.createdAt} ${order.status} ${order.side} ${order.marketKey}`,
      `  requested=$${order.requestedNotionalUsdc.toFixed(4)} filled=$${order.filledNotionalUsdc.toFixed(4)}`,
      `  reasons=${reasonCodes}`
    ].join("\n");
  });
  return [
    "Paper execution report",
    `Generated: ${report.generatedAt}`,
    `Session: ${report.sessionId ?? "all"}`,
    `Since: ${report.since ?? "all time"}`,
    `Orders: ${report.orderCount}; full=${report.fullFillCount}; partial=${report.partialFillCount}; missed=${report.missedCount}; rejected=${report.rejectedCount}; expired=${report.expiredCount}`,
    `Notional: $${report.filledNotionalUsdc.toFixed(4)} filled / $${report.requestedNotionalUsdc.toFixed(4)} requested; fill rate=${percent(report.notionalFillRate)}; missed=$${report.missedNotionalUsdc.toFixed(4)}`,
    `Average order fill ratio: ${percent(report.averageOrderFillRatio)}`,
    `Statuses: ${topCounts(report.statusCounts)}`,
    `Reasons: ${topCounts(report.reasonCodeCounts)}`,
    `Warnings: ${topCounts(report.warningCounts)}`,
    "Recent orders:",
    recent.length > 0 ? recent.join("\n") : "- none"
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs();
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  try {
    const sessionId = options.sessionId?.trim() || store.listAutoTradingSessions({ status: "active", limit: 1 }).at(0)?.sessionId;
    const report = store.getPaperTradingExecutionReport({
      sessionId,
      since: options.since,
      limit: options.limit
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(renderText(report));
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
