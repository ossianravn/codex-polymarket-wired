import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AgentProvider = "dry_hold" | "openai";

export interface PaperAgentOnceOptions {
  sessionId?: string;
  budgetUsdc: string;
  timeframeHours: string;
  riskProfile: string;
  provider: AgentProvider;
  model?: string;
  apiBaseUrl?: string;
  stateDbPath: string;
  force: boolean;
  fast: boolean;
  candidateLimit: string;
  planFile: string;
  briefOut: string;
  promptOut: string;
  json: boolean;
}

function envString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function readArgValue(argv: string[], index: number): string | undefined {
  const arg = argv[index] ?? "";
  const equals = arg.indexOf("=");
  return equals >= 0 ? arg.slice(equals + 1) : argv[index + 1];
}

function consumesNext(argv: string[], index: number): boolean {
  return !argv[index]?.includes("=");
}

function quoteShellArg(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '\\"')}"`;
}

function repoRootFromHere(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function parsePaperAgentOnceArgs(argv = process.argv.slice(2)): PaperAgentOnceOptions {
  const root = repoRootFromHere();
  const options: PaperAgentOnceOptions = {
    sessionId: envString("AUTOTRADER_SESSION_ID"),
    budgetUsdc: envString("AUTOTRADER_BUDGET_USDC", "30") ?? "30",
    timeframeHours: envString("AUTOTRADER_TIMEFRAME_HOURS", "24") ?? "24",
    riskProfile: envString("AUTOTRADER_RISK_PROFILE", "aggressive") ?? "aggressive",
    provider: (envString("AUTOTRADER_AGENT_PROVIDER", "dry_hold") as AgentProvider) ?? "dry_hold",
    model: envString("AUTOTRADER_AGENT_MODEL"),
    apiBaseUrl: envString("AUTOTRADER_AGENT_API_BASE_URL"),
    stateDbPath: envString("AUTOTRADER_STATE_DB_PATH", path.join(root, "state", "polymarket.sqlite")) ?? path.join(root, "state", "polymarket.sqlite"),
    force: false,
    fast: false,
    candidateLimit: envString("AUTOTRADER_AGENT_CANDIDATE_LIMIT", "12") ?? "12",
    planFile: envString("AUTOTRADER_AGENT_PLAN_FILE", "state/autotrader-agent-plan.json") ?? "state/autotrader-agent-plan.json",
    briefOut: envString("AUTOTRADER_AGENT_BRIEF_OUT", "state/autotrader-daemon-agent-brief.json") ?? "state/autotrader-daemon-agent-brief.json",
    promptOut: envString("AUTOTRADER_AGENT_PROMPT_OUT", "state/autotrader-daemon-agent-prompt.md") ?? "state/autotrader-daemon-agent-prompt.md",
    json: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--session-id" || arg.startsWith("--session-id=")) {
      options.sessionId = readArgValue(argv, index);
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--budget" || arg === "--budget-usdc" || arg.startsWith("--budget=") || arg.startsWith("--budget-usdc=")) {
      options.budgetUsdc = readArgValue(argv, index) ?? options.budgetUsdc;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--timeframe-hours" || arg.startsWith("--timeframe-hours=")) {
      options.timeframeHours = readArgValue(argv, index) ?? options.timeframeHours;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--risk-profile" || arg.startsWith("--risk-profile=")) {
      options.riskProfile = readArgValue(argv, index) ?? options.riskProfile;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--provider" || arg.startsWith("--provider=")) {
      options.provider = (readArgValue(argv, index) as AgentProvider | undefined) ?? options.provider;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--model" || arg.startsWith("--model=")) {
      options.model = readArgValue(argv, index);
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--api-base-url" || arg.startsWith("--api-base-url=")) {
      options.apiBaseUrl = readArgValue(argv, index);
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--state-db-path" || arg.startsWith("--state-db-path=")) {
      options.stateDbPath = readArgValue(argv, index) ?? options.stateDbPath;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--candidate-limit" || arg.startsWith("--candidate-limit=")) {
      options.candidateLimit = readArgValue(argv, index) ?? options.candidateLimit;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--plan-file" || arg.startsWith("--plan-file=")) {
      options.planFile = readArgValue(argv, index) ?? options.planFile;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--brief-out" || arg.startsWith("--brief-out=")) {
      options.briefOut = readArgValue(argv, index) ?? options.briefOut;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--prompt-out" || arg.startsWith("--prompt-out=")) {
      options.promptOut = readArgValue(argv, index) ?? options.promptOut;
      if (consumesNext(argv, index)) index += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--fast") {
      options.fast = true;
    } else if (arg === "--no-json") {
      options.json = false;
    }
  }

  if (options.provider !== "dry_hold" && options.provider !== "openai") {
    throw new Error(`Unsupported AUTOTRADER_AGENT_PROVIDER: ${options.provider}`);
  }
  return options;
}

export function buildAgentCommand(options: PaperAgentOnceOptions): string {
  const parts = [
    quoteShellArg(process.execPath),
    "--import",
    "tsx",
    quoteShellArg(".\\scripts\\autotrader-agent-command.ts"),
    `--provider=${options.provider}`
  ];
  if (options.model) {
    parts.push(`--model=${quoteShellArg(options.model)}`);
  }
  if (options.apiBaseUrl) {
    parts.push(`--api-base-url=${quoteShellArg(options.apiBaseUrl)}`);
  }
  return parts.join(" ");
}

export function buildDaemonArgs(options: PaperAgentOnceOptions): string[] {
  const args = [
    "--import",
    "tsx",
    ".\\scripts\\autotrader-daemon.ts",
    "--once",
    "--agent-loop",
    `--agent-candidate-limit=${options.candidateLimit}`,
    "--agent-plan-file",
    options.planFile,
    "--agent-brief-out",
    options.briefOut,
    "--agent-prompt-out",
    options.promptOut
  ];

  if (options.force) {
    args.push("--force");
  }
  if (options.fast) {
    args.push("--no-auto-refresh-universe", "--no-refresh-snapshots", "--no-auto-forecast");
  }
  if (options.json) {
    args.push("--json");
  }
  return args;
}

export function buildDaemonEnv(options: PaperAgentOnceOptions): NodeJS.ProcessEnv {
  if (!options.sessionId) {
    throw new Error("AUTOTRADER_SESSION_ID or --session-id is required for paper-agent once runs.");
  }
  return {
    ...process.env,
    AUTOTRADER_SESSION_ID: options.sessionId,
    AUTOTRADER_MODE: "paper",
    AUTOTRADER_BUDGET_USDC: options.budgetUsdc,
    AUTOTRADER_TIMEFRAME_HOURS: options.timeframeHours,
    AUTOTRADER_RISK_PROFILE: options.riskProfile,
    AUTOTRADER_STATE_DB_PATH: options.stateDbPath,
    AUTOTRADER_AGENT_COMMAND: buildAgentCommand(options),
    AUTOTRADER_AGENT_PROVIDER: options.provider,
    POLYMARKET_ENABLE_TRADING: "false"
  };
}

export function runPaperAgentOnce(options: PaperAgentOnceOptions): number {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    cwd: repoRootFromHere(),
    env: buildDaemonEnv(options),
    encoding: "utf8",
    stdio: "inherit"
  };
  const result = spawnSync(process.execPath, buildDaemonArgs(options), spawnOptions);
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

async function main(): Promise<void> {
  const options = parsePaperAgentOnceArgs();
  process.exitCode = runPaperAgentOnce(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
