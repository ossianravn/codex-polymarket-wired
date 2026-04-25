import process from "node:process";

import {
  compactAutoTradingIterationResult,
  runAutoTradingIteration,
  type AutoTradingRiskProfile
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
  json: boolean;
  compact: boolean;
}

function parseCliArgs(argv = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {
    limit: 25,
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
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--compact") {
      options.compact = true;
    }
  }
  return options;
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
    `Paper PnL: $${result.summary.unrealizedPnlUsdc.toFixed(2)} unrealized across ${result.summary.openPositions} open positions`,
    `This iteration: $${result.summary.proposedBudgetUsdc.toFixed(2)} proposed`,
    `Orders: ${result.summary.proposedOrders}; research: ${result.summary.researchRequired}; blocked: ${result.summary.blocked}`,
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
  const result = runAutoTradingIteration(store, {
    sessionId: options.sessionId,
    mandate: options.sessionId
      ? undefined
      : {
        name: options.name,
        budgetUsdc: options.budgetUsdc as number,
        timeframeHours: options.timeframeHours as number,
        riskProfile: options.riskProfile as AutoTradingRiskProfile,
        mode: options.mode ?? "paper"
      },
    limit: options.limit
  });
  store.recordAutomationRun({
    automationName: "autotrader-iteration",
    status: "completed",
    projectMode: "local",
    findingsCount: result.candidates.length,
    summary: `auto-trader proposed ${result.summary.proposedOrders} paper orders; next run ${result.summary.nextRunAt ?? "unknown"}`,
    output: result as unknown as Record<string, unknown>
  });
  store.close();
  if (options.json) {
    const output = options.compact ? compactAutoTradingIterationResult(result) : result;
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(renderSummary(result));
  }
}

main().catch((error) => {
  console.error("autotrader-iteration error:", error);
  process.exit(1);
});
