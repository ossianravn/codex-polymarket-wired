import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";

import {
  applyAutoTradingAgentDecisionPlan,
  buildAutoTradingAgentBrief,
  evaluateUniverseFreshness,
  normalizeAutoTradingMandate,
  refreshAutoTradingMarketSnapshots,
  runAutoTradingIteration,
  type AutoTradingAgentDecisionPlan,
  type AutoTradingMandateInput,
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
  candidateLimit: number;
  planFile?: string;
  briefOut?: string;
  promptOut?: string;
  refreshSnapshots: boolean;
  refreshSnapshotLimit: number;
  maxUniverseAgeMinutes: number;
  allowStaleUniverse: boolean;
  json: boolean;
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
    sessionId: process.env.AUTOTRADER_SESSION_ID,
    budgetUsdc: envNumber("AUTOTRADER_BUDGET_USDC", Number.NaN),
    timeframeHours: envNumber("AUTOTRADER_TIMEFRAME_HOURS", Number.NaN),
    riskProfile: process.env.AUTOTRADER_RISK_PROFILE as AutoTradingRiskProfile | undefined,
    mode: process.env.AUTOTRADER_MODE as CliOptions["mode"] | undefined,
    limit: envNumber("AUTOTRADER_LIMIT", 25),
    candidateLimit: envNumber("AUTOTRADER_AGENT_CANDIDATE_LIMIT", 12),
    planFile: process.env.AUTOTRADER_AGENT_PLAN_FILE,
    briefOut: process.env.AUTOTRADER_AGENT_BRIEF_OUT,
    promptOut: process.env.AUTOTRADER_AGENT_PROMPT_OUT,
    refreshSnapshots: envBoolean("AUTOTRADER_REFRESH_SNAPSHOTS", false),
    refreshSnapshotLimit: envNumber("AUTOTRADER_REFRESH_SNAPSHOT_LIMIT", 50),
    maxUniverseAgeMinutes: envNumber("AUTOTRADER_MAX_UNIVERSE_AGE_MINUTES", 10),
    allowStaleUniverse: envBoolean("AUTOTRADER_ALLOW_STALE_UNIVERSE", false),
    json: false
  };
  if (!Number.isFinite(options.budgetUsdc as number)) {
    options.budgetUsdc = undefined;
  }
  if (!Number.isFinite(options.timeframeHours as number)) {
    options.timeframeHours = undefined;
  }
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
    } else if (arg === "--candidate-limit") {
      options.candidateLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--candidate-limit=")) {
      options.candidateLimit = Number(arg.split("=")[1]);
    } else if (arg === "--plan-file") {
      options.planFile = next;
      index += 1;
    } else if (arg.startsWith("--plan-file=")) {
      options.planFile = arg.split("=")[1];
    } else if (arg === "--brief-out") {
      options.briefOut = next;
      index += 1;
    } else if (arg.startsWith("--brief-out=")) {
      options.briefOut = arg.split("=")[1];
    } else if (arg === "--prompt-out") {
      options.promptOut = next;
      index += 1;
    } else if (arg.startsWith("--prompt-out=")) {
      options.promptOut = arg.split("=")[1];
    } else if (arg === "--refresh-snapshots") {
      options.refreshSnapshots = true;
    } else if (arg === "--max-universe-age-minutes") {
      options.maxUniverseAgeMinutes = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-universe-age-minutes=")) {
      options.maxUniverseAgeMinutes = Number(arg.split("=")[1]);
    } else if (arg === "--allow-stale-universe") {
      options.allowStaleUniverse = true;
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  options.limit = Math.max(1, Math.min(100, Number(options.limit)));
  options.candidateLimit = Math.max(1, Math.min(50, Number(options.candidateLimit)));
  options.refreshSnapshotLimit = Math.max(1, Math.min(250, Number(options.refreshSnapshotLimit)));
  options.maxUniverseAgeMinutes = Math.max(1, Math.min(24 * 60, Number(options.maxUniverseAgeMinutes)));
  return options;
}

async function loadPlan(filePath: string): Promise<AutoTradingAgentDecisionPlan> {
  return JSON.parse(await readFile(filePath, "utf8")) as AutoTradingAgentDecisionPlan;
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  if (!options.sessionId && (options.budgetUsdc === undefined || options.timeframeHours === undefined || !options.riskProfile)) {
    throw new Error("Provide --session-id or a new mandate with --budget-usdc, --timeframe-hours, and --risk-profile.");
  }
  if (process.env.POLYMARKET_ENABLE_TRADING === "true") {
    throw new Error("autotrader-agent-loop refuses POLYMARKET_ENABLE_TRADING=true; this script never submits live orders.");
  }
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  try {
    const universeFreshness = evaluateUniverseFreshness(
      store.getLatestUniverseRun(),
      { maxAgeMinutes: options.maxUniverseAgeMinutes }
    );
    if (!universeFreshness.isFresh && !options.allowStaleUniverse && !options.refreshSnapshots) {
      const output = {
        status: "blocked",
        blocker: "stale_universe_run",
        universeFreshness
      };
      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(`Agent loop blocked: universe discovery is ${universeFreshness.reason}.`);
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
    const snapshotRefresh = options.refreshSnapshots
      ? await refreshAutoTradingMarketSnapshots(store, config, {
        runId: universeFreshness.latestRunId,
        mandate,
        limit: options.refreshSnapshotLimit,
        maxAgeMinutes: 5
      })
      : undefined;
    const iteration = runAutoTradingIteration(store, {
      sessionId: options.sessionId,
      mandate: options.sessionId ? undefined : mandateInput,
      limit: options.limit,
      persist: false
    });
    const brief = buildAutoTradingAgentBrief({
      iteration,
      candidateLimit: options.candidateLimit
    });
    if (options.briefOut) {
      await writeFile(options.briefOut, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
    }
    if (options.promptOut && brief.prompt) {
      await writeFile(options.promptOut, `${brief.prompt}\n`, "utf8");
    }
    const plan = options.planFile ? await loadPlan(options.planFile) : undefined;
    const applyResult = plan
      ? applyAutoTradingAgentDecisionPlan(store, brief, plan)
      : undefined;
    store.recordAutomationRun({
      automationName: "autotrader-agent-loop",
      status: "completed",
      projectMode: "local",
      findingsCount: brief.candidates.length,
      summary: applyResult
        ? `agent plan recorded ${applyResult.recorded}; blocked ${applyResult.blocked}`
        : `agent brief generated with ${brief.candidates.length} candidates`,
      output: {
        universeFreshness,
        snapshotRefresh,
        brief,
        applyResult
      } as unknown as Record<string, unknown>
    });
    const output = {
      universeFreshness,
      snapshotRefresh,
      brief,
      applyResult
    };
    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }
    console.log([
      `Agent brief: ${brief.candidates.length} candidates for ${brief.session.sessionId}`,
      `Budget: $${brief.ledger.spentUsdc.toFixed(2)} spent, $${brief.ledger.remainingBudgetUsdc.toFixed(2)} remaining; PnL $${brief.ledger.totalPnlUsdc.toFixed(2)}`,
      options.briefOut ? `Brief written: ${options.briefOut}` : "Brief written: stdout disabled; pass --brief-out to persist",
      options.promptOut ? `Prompt written: ${options.promptOut}` : "Prompt written: not requested",
      applyResult
        ? `Applied plan: ${applyResult.recorded} recorded, ${applyResult.blocked} blocked; liveSubmissionBlocked=true`
        : "Applied plan: none"
    ].join("\n"));
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error("autotrader-agent-loop error:", error);
  process.exit(1);
});
