import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import {
  runAutoTradingSimulation,
  type AutoTradingRiskProfile,
  type AutoTradingSimulationResult
} from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

interface CliOptions {
  budgetUsdc: number;
  timeframeHours: number;
  riskProfile: AutoTradingRiskProfile;
  ticks: number;
  tickMinutes: number;
  json: boolean;
}

function parseCliArgs(argv = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {
    budgetUsdc: 50,
    timeframeHours: 24,
    riskProfile: "balanced",
    ticks: 4,
    tickMinutes: 360,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--budget-usdc") {
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
    } else if (arg === "--ticks") {
      options.ticks = Number(next);
      index += 1;
    } else if (arg.startsWith("--ticks=")) {
      options.ticks = Number(arg.split("=")[1]);
    } else if (arg === "--tick-minutes") {
      options.tickMinutes = Number(next);
      index += 1;
    } else if (arg.startsWith("--tick-minutes=")) {
      options.tickMinutes = Number(arg.split("=")[1]);
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  return options;
}

function renderSimulationSummary(result: AutoTradingSimulationResult): string {
  const fillLines = result.fills.slice(0, 10).map((fill) => (
    `- tick ${fill.tick}: $${fill.costUsdc.toFixed(2)} ${fill.title ?? fill.marketKey} @ ${fill.price} (${fill.shares} shares)`
  ));
  const positionLines = result.positions.map((position) => (
    `- ${position.title ?? position.marketKey}: value $${position.currentValueUsdc.toFixed(2)}, PnL $${position.unrealizedPnlUsdc.toFixed(2)} (${position.unrealizedPnlPct.toFixed(2)}%)`
  ));
  return [
    `Auto-trader simulation: ${result.simulationId}`,
    `Session: ${result.sessionId}`,
    `Ticks: ${result.summary.ticks}`,
    `Final value: $${result.summary.finalPortfolioValueUsdc.toFixed(2)} from $${result.summary.initialCashUsdc.toFixed(2)}`,
    `Return: ${result.summary.returnPct.toFixed(2)}%`,
    `Fills: ${result.summary.fillCount}; positions: ${result.summary.positionCount}`,
    ...(fillLines.length > 0 ? ["Fills:", ...fillLines] : ["Fills: none"]),
    ...(positionLines.length > 0 ? ["Positions:", ...positionLines] : ["Positions: none"])
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const tempDir = mkdtempSync(path.join(tmpdir(), "poly-autotrader-sim-"));
  const store = openStateStore(path.join(tempDir, "simulation.sqlite"));
  try {
    const result = runAutoTradingSimulation(store, {
      startAt: new Date("2026-04-25T12:00:00.000Z"),
      ticks: options.ticks,
      tickMinutes: options.tickMinutes,
      limit: 8,
      mandate: {
        budgetUsdc: options.budgetUsdc,
        timeframeHours: options.timeframeHours,
        riskProfile: options.riskProfile,
        mode: "paper"
      },
      markets: [
        {
          marketKey: "condition:synthetic-catalyst",
          title: "Synthetic catalyst market resolves upward",
          prices: [0.24, 0.31, 0.46, 0.62, 0.78],
          categoryGroup: "simulation",
          opportunityMode: "execution-ready",
          endHoursFromStart: Math.max(8, options.timeframeHours),
          liquidityUsd: 75_000,
          spreadCents: 1,
          tradeOpportunityScore: 88,
          researchPriorityScore: 84,
          tradabilityScore: 90,
          catalystScore: 92,
          riskScore: 14
        },
        {
          marketKey: "condition:synthetic-ambiguous",
          title: "Synthetic ambiguous market stays blocked",
          prices: [0.42, 0.40, 0.39, 0.41],
          categoryGroup: "simulation",
          opportunityMode: "execution-ready",
          endHoursFromStart: Math.max(8, options.timeframeHours),
          liquidityUsd: 60_000,
          spreadCents: 2,
          resolutionAmbiguityScore: 90,
          tradeOpportunityScore: 80,
          researchPriorityScore: 78
        },
        {
          marketKey: "condition:synthetic-long-horizon",
          title: "Synthetic long-horizon market is outside mandate",
          prices: [0.18, 0.19, 0.21, 0.22],
          categoryGroup: "simulation",
          opportunityMode: "execution-ready",
          endHoursFromStart: options.timeframeHours * 12,
          liquidityUsd: 120_000,
          spreadCents: 1,
          tradeOpportunityScore: 86,
          researchPriorityScore: 82,
          tradabilityScore: 88
        }
      ]
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderSimulationSummary(result));
    }
  } finally {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("autotrader-simulation error:", error);
  process.exit(1);
});
