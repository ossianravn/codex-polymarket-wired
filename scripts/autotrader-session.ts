import process from "node:process";

import { normalizeAutoTradingMandate, type AutoTradingRiskProfile } from "../packages/auto-trader/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

type Command = "create-paper" | "reset-paper-ledger";

interface Options {
  command: Command;
  sessionId?: string;
  name?: string;
  budgetUsdc?: number;
  timeframeHours?: number;
  riskProfile?: AutoTradingRiskProfile;
  maxSingleOrderUsdc?: number;
  maxOpenPositions?: number;
  maxMarketHorizonHours?: number;
  minLiquidityUsdc?: number;
  maxSpreadCents?: number;
  stopLossUsdc?: number;
  heartbeatMinutes?: number;
  clearDecisions: boolean;
  json: boolean;
}

function envString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function envNumber(name: string): number | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function readArgValue(argv: string[], index: number): string | undefined {
  const arg = argv[index];
  const equals = arg.indexOf("=");
  return equals >= 0 ? arg.slice(equals + 1) : argv[index + 1];
}

function consumedNext(argv: string[], index: number): boolean {
  return !argv[index].includes("=");
}

function parseArgs(argv = process.argv.slice(2)): Options {
  const first = argv[0];
  const command: Command = first === "reset-paper-ledger" ? "reset-paper-ledger" : "create-paper";
  const startIndex = first === "create-paper" || first === "reset-paper-ledger" ? 1 : 0;
  const options: Options = {
    command,
    sessionId: envString("AUTOTRADER_SESSION_ID"),
    name: envString("AUTOTRADER_SESSION_NAME"),
    budgetUsdc: envNumber("AUTOTRADER_BUDGET_USDC"),
    timeframeHours: envNumber("AUTOTRADER_TIMEFRAME_HOURS"),
    riskProfile: envString("AUTOTRADER_RISK_PROFILE") as AutoTradingRiskProfile | undefined,
    maxSingleOrderUsdc: envNumber("AUTOTRADER_MAX_SINGLE_ORDER_USDC"),
    maxOpenPositions: envNumber("AUTOTRADER_MAX_OPEN_POSITIONS"),
    maxMarketHorizonHours: envNumber("AUTOTRADER_MAX_MARKET_HORIZON_HOURS"),
    minLiquidityUsdc: envNumber("AUTOTRADER_MIN_LIQUIDITY_USDC"),
    maxSpreadCents: envNumber("AUTOTRADER_MAX_SPREAD_CENTS"),
    stopLossUsdc: envNumber("AUTOTRADER_STOP_LOSS_USDC"),
    heartbeatMinutes: envNumber("AUTOTRADER_HEARTBEAT_MINUTES"),
    clearDecisions: false,
    json: false
  };

  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session-id" || arg.startsWith("--session-id=")) {
      options.sessionId = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--name" || arg.startsWith("--name=")) {
      options.name = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--budget-usdc" || arg.startsWith("--budget-usdc=")) {
      options.budgetUsdc = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--timeframe-hours" || arg.startsWith("--timeframe-hours=")) {
      options.timeframeHours = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--risk-profile" || arg.startsWith("--risk-profile=")) {
      options.riskProfile = readArgValue(argv, index) as AutoTradingRiskProfile;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--max-single-order-usdc" || arg.startsWith("--max-single-order-usdc=")) {
      options.maxSingleOrderUsdc = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--max-open-positions" || arg.startsWith("--max-open-positions=")) {
      options.maxOpenPositions = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--max-market-horizon-hours" || arg.startsWith("--max-market-horizon-hours=")) {
      options.maxMarketHorizonHours = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--min-liquidity-usdc" || arg.startsWith("--min-liquidity-usdc=")) {
      options.minLiquidityUsdc = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--max-spread-cents" || arg.startsWith("--max-spread-cents=")) {
      options.maxSpreadCents = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--stop-loss-usdc" || arg.startsWith("--stop-loss-usdc=")) {
      options.stopLossUsdc = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--heartbeat-minutes" || arg.startsWith("--heartbeat-minutes=")) {
      options.heartbeatMinutes = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--clear-decisions") {
      options.clearDecisions = true;
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  return options;
}

function requireNumber(value: number | undefined, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Missing required ${name}.`);
  }
  return value as number;
}

function renderText(output: Record<string, unknown>): string {
  if (output.command === "create-paper") {
    const session = output.session as Record<string, unknown>;
    return [
      "Created paper auto-trading session",
      `Session: ${session.sessionId}`,
      `Name: ${session.name ?? "unnamed"}`,
      `Budget: $${Number(session.budgetUsdc ?? 0).toFixed(2)}`,
      `Timeframe: ${session.timeframeHours}h`,
      `Risk: ${session.riskProfile}`,
      `Ends: ${session.endsAt}`
    ].join("\n");
  }
  const reset = output.reset as Record<string, unknown>;
  return [
    "Reset paper auto-trading ledger",
    `Session: ${reset.sessionId}`,
    `Deleted: ${reset.deletedOrders} orders, ${reset.deletedFills} fills, ${reset.deletedPositions} positions, ${reset.deletedDecisions} decisions`,
    `Status: ${reset.sessionStatus}`
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs();
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  try {
    let output: Record<string, unknown>;
    if (options.command === "create-paper") {
      const mandate = normalizeAutoTradingMandate({
        name: options.name,
        budgetUsdc: requireNumber(options.budgetUsdc, "--budget-usdc"),
        timeframeHours: requireNumber(options.timeframeHours, "--timeframe-hours"),
        riskProfile: options.riskProfile ?? "aggressive",
        mode: "paper",
        maxSingleOrderUsdc: options.maxSingleOrderUsdc,
        maxOpenPositions: options.maxOpenPositions,
        maxMarketHorizonHours: options.maxMarketHorizonHours,
        minLiquidityUsdc: options.minLiquidityUsdc,
        maxSpreadCents: options.maxSpreadCents,
        stopLossUsdc: options.stopLossUsdc,
        heartbeatMinutes: options.heartbeatMinutes
      });
      const session = store.createAutoTradingSession({
        sessionId: options.sessionId,
        name: options.name,
        status: "active",
        mode: "paper",
        riskProfile: mandate.riskProfile,
        budgetUsdc: mandate.budgetUsdc,
        timeframeHours: mandate.timeframeHours,
        heartbeatMinutes: mandate.heartbeatMinutes,
        mandate,
        metadata: {
          createdBy: "autotrader-session-cli",
          createdFor: "paper_validation"
        }
      });
      output = {
        ok: true,
        command: options.command,
        session,
        ledger: store.getPaperTradingLedger(session.sessionId),
        paperExecutionReport: store.getPaperTradingExecutionReport({ sessionId: session.sessionId })
      };
    } else {
      if (!options.sessionId) {
        throw new Error("Missing required --session-id for reset-paper-ledger.");
      }
      const before = store.getPaperTradingLedger(options.sessionId);
      const reset = store.resetPaperTradingSession(options.sessionId, {
        clearDecisions: options.clearDecisions,
        status: "active",
        metadata: {
          resetBy: "autotrader-session-cli"
        }
      });
      output = {
        ok: true,
        command: options.command,
        reset,
        before: before.summary,
        after: store.getPaperTradingLedger(options.sessionId).summary,
        paperExecutionReport: store.getPaperTradingExecutionReport({ sessionId: options.sessionId })
      };
    }
    console.log(options.json ? JSON.stringify(output, null, 2) : renderText(output));
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error("autotrader-session error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
