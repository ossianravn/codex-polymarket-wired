import "dotenv/config";

import { spawnSync } from "node:child_process";
import process from "node:process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type AgentProvider = "openai" | "codex_cli" | "dry_hold";

interface AgentCommandOptions {
  provider: AgentProvider;
  model: string;
  apiKey?: string;
  apiBaseUrl: string;
  codexBin: string;
  codexPrefixArgs: string[];
  codexProfile?: string;
  promptPath?: string;
  briefPath?: string;
  planOut?: string;
  timeoutMs: number;
  dryHoldReason: string;
}

interface AgentDecisionPlan {
  kind?: "polymarket_autotrader_agent_decision_plan_v1";
  sessionId: string;
  generatedAt?: string;
  agentName?: string;
  decisions: Array<{
    decisionRef?: string;
    marketKey?: string;
    action: "paper_buy_yes" | "paper_sell_yes" | "live_buy_yes" | "live_sell_yes" | "hold" | "research_required" | "skip";
    confidence: number;
    rationale: string;
    limitPrice?: number;
    maxSpendUsdc?: number;
    shares?: number;
    nextCheckMinutes?: number;
    evidenceRefs?: string[];
  }>;
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

function envStringArray(name: string): string[] {
  const value = envString(name);
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Fall through to whitespace splitting for simple local overrides.
  }
  return value.split(/\s+/u).map((item) => item.trim()).filter(Boolean);
}

function readArgValue(argv: string[], index: number): string | undefined {
  const arg = argv[index];
  const equals = arg.indexOf("=");
  return equals >= 0 ? arg.slice(equals + 1) : argv[index + 1];
}

function consumedNext(argv: string[], index: number): boolean {
  return !argv[index].includes("=");
}

function parseArgs(argv = process.argv.slice(2)): AgentCommandOptions {
  const options: AgentCommandOptions = {
    provider: (envString("AUTOTRADER_AGENT_PROVIDER", "openai") as AgentProvider) ?? "openai",
    model: envString("AUTOTRADER_AGENT_MODEL", "gpt-5.2") ?? "gpt-5.2",
    apiKey: envString("OPENAI_API_KEY"),
    apiBaseUrl: envString("AUTOTRADER_AGENT_API_BASE_URL", "https://api.openai.com/v1/responses") ?? "https://api.openai.com/v1/responses",
    codexBin: envString("AUTOTRADER_CODEX_BIN", "codex") ?? "codex",
    codexPrefixArgs: envStringArray("AUTOTRADER_CODEX_PREFIX_ARGS"),
    codexProfile: envString("AUTOTRADER_CODEX_PROFILE"),
    promptPath: envString("AUTOTRADER_AGENT_PROMPT_PATH"),
    briefPath: envString("AUTOTRADER_AGENT_BRIEF_PATH"),
    planOut: envString("AUTOTRADER_AGENT_PLAN_OUT"),
    timeoutMs: envNumber("AUTOTRADER_AGENT_TIMEOUT_MS", 120_000),
    dryHoldReason: envString("AUTOTRADER_AGENT_DRY_HOLD_REASON", "dry_hold_provider_selected") ?? "dry_hold_provider_selected"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--provider" || arg.startsWith("--provider=")) {
      options.provider = readArgValue(argv, index) as AgentProvider;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--model" || arg.startsWith("--model=")) {
      options.model = readArgValue(argv, index) ?? options.model;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--api-base-url" || arg.startsWith("--api-base-url=")) {
      options.apiBaseUrl = readArgValue(argv, index) ?? options.apiBaseUrl;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--codex-bin" || arg.startsWith("--codex-bin=")) {
      options.codexBin = readArgValue(argv, index) ?? options.codexBin;
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--codex-profile" || arg.startsWith("--codex-profile=")) {
      options.codexProfile = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--prompt" || arg.startsWith("--prompt=")) {
      options.promptPath = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--brief" || arg.startsWith("--brief=")) {
      options.briefPath = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--plan-out" || arg.startsWith("--plan-out=")) {
      options.planOut = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    }
  }
  options.timeoutMs = Math.max(1_000, Math.min(10 * 60_000, Number(options.timeoutMs)));
  if (options.provider !== "openai" && options.provider !== "codex_cli" && options.provider !== "dry_hold") {
    throw new Error(`Unsupported AUTOTRADER_AGENT_PROVIDER '${options.provider}'.`);
  }
  return options;
}

async function readPromptAndBrief(options: AgentCommandOptions): Promise<{ prompt: string; brief?: Record<string, unknown> }> {
  const prompt = options.promptPath
    ? await readFile(options.promptPath, "utf8")
    : "Return a Polymarket autotrader decision plan JSON.";
  const brief = options.briefPath
    ? JSON.parse(await readFile(options.briefPath, "utf8")) as Record<string, unknown>
    : undefined;
  return { prompt, brief };
}

function sessionIdFromBrief(brief: Record<string, unknown> | undefined): string {
  const session = brief?.session;
  if (session && typeof session === "object" && typeof (session as { sessionId?: unknown }).sessionId === "string") {
    return (session as { sessionId: string }).sessionId;
  }
  const envSession = envString("AUTOTRADER_AGENT_SESSION_ID");
  if (envSession) {
    return envSession;
  }
  throw new Error("Unable to determine sessionId from brief or AUTOTRADER_AGENT_SESSION_ID.");
}

function dryHoldPlan(brief: Record<string, unknown> | undefined, reason: string): AgentDecisionPlan {
  const candidates = Array.isArray(brief?.candidates) ? brief.candidates as Array<Record<string, unknown>> : [];
  return {
    kind: "polymarket_autotrader_agent_decision_plan_v1",
    sessionId: sessionIdFromBrief(brief),
    generatedAt: new Date().toISOString(),
    agentName: "dry-hold-agent",
    decisions: candidates.slice(0, 25).map((candidate) => ({
      decisionRef: typeof candidate.decisionRef === "string" ? candidate.decisionRef : undefined,
      marketKey: typeof candidate.marketKey === "string" ? candidate.marketKey : undefined,
      action: "hold",
      confidence: 0,
      rationale: `No trade: ${reason}.`
    }))
  };
}

function decisionPlanSchema(sessionId: string): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "sessionId", "generatedAt", "agentName", "decisions"],
    properties: {
      kind: { type: "string", enum: ["polymarket_autotrader_agent_decision_plan_v1"] },
      sessionId: { type: "string", const: sessionId },
      generatedAt: { type: ["string", "null"] },
      agentName: { type: "string" },
      decisions: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "decisionRef",
            "marketKey",
            "action",
            "confidence",
            "rationale",
            "limitPrice",
            "maxSpendUsdc",
            "shares",
            "nextCheckMinutes",
            "evidenceRefs"
          ],
          properties: {
            decisionRef: { type: ["string", "null"] },
            marketKey: { type: ["string", "null"] },
            action: {
              type: "string",
              enum: ["paper_buy_yes", "paper_sell_yes", "hold", "research_required", "skip"]
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
            limitPrice: { type: ["number", "null"], minimum: 0, maximum: 1 },
            maxSpendUsdc: { type: ["number", "null"], minimum: 0 },
            shares: { type: ["number", "null"], minimum: 0 },
            nextCheckMinutes: { type: ["number", "null"], minimum: 1, maximum: 1440 },
            evidenceRefs: {
              type: ["array", "null"],
              items: { type: "string" }
            }
          }
        }
      }
    }
  };
}

function extractResponseText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [];
    for (const part of content) {
      if (typeof part.text === "string") {
        return part.text;
      }
    }
  }
  const choices = Array.isArray(response.choices) ? response.choices as Array<Record<string, unknown>> : [];
  const firstMessage = choices[0]?.message;
  if (firstMessage && typeof firstMessage === "object" && typeof (firstMessage as { content?: unknown }).content === "string") {
    return (firstMessage as { content: string }).content;
  }
  throw new Error("Model response did not contain output text.");
}

function parseAgentDecisionPlanText(text: string): AgentDecisionPlan {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed) as AgentDecisionPlan;
}

function shouldUseShellForCommand(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep) && !command.includes("/");
}

function validatePlan(plan: AgentDecisionPlan, expectedSessionId: string): AgentDecisionPlan {
  if (plan.sessionId !== expectedSessionId) {
    throw new Error(`Agent plan session ${plan.sessionId} does not match expected session ${expectedSessionId}.`);
  }
  if (!Array.isArray(plan.decisions)) {
    throw new Error("Agent plan decisions must be an array.");
  }
  const decisions: AgentDecisionPlan["decisions"] = [];
  for (const decision of plan.decisions) {
    if (decision.action === "live_buy_yes" || decision.action === "live_sell_yes") {
      throw new Error("Agent command refuses live actions; live preview/execution has a separate gate.");
    }
    if (!Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1) {
      throw new Error("Agent decision confidence must be between 0 and 1.");
    }
    if (!decision.rationale || decision.rationale.trim().length < 8) {
      throw new Error("Agent decision rationale is required.");
    }
    decisions.push({
      decisionRef: typeof decision.decisionRef === "string" ? decision.decisionRef : undefined,
      marketKey: typeof decision.marketKey === "string" ? decision.marketKey : undefined,
      action: decision.action,
      confidence: decision.confidence,
      rationale: decision.rationale,
      limitPrice: typeof decision.limitPrice === "number" ? decision.limitPrice : undefined,
      maxSpendUsdc: typeof decision.maxSpendUsdc === "number" ? decision.maxSpendUsdc : undefined,
      shares: typeof decision.shares === "number" ? decision.shares : undefined,
      nextCheckMinutes: typeof decision.nextCheckMinutes === "number" ? decision.nextCheckMinutes : undefined,
      evidenceRefs: Array.isArray(decision.evidenceRefs) ? decision.evidenceRefs.filter((ref) => typeof ref === "string") : undefined
    });
  }
  return {
    kind: "polymarket_autotrader_agent_decision_plan_v1",
    sessionId: plan.sessionId,
    generatedAt: typeof plan.generatedAt === "string" ? plan.generatedAt : new Date().toISOString(),
    agentName: typeof plan.agentName === "string" ? plan.agentName : "autotrader-agent-command",
    decisions
  };
}

async function runOpenAiAgent(options: AgentCommandOptions, prompt: string, brief: Record<string, unknown> | undefined): Promise<AgentDecisionPlan> {
  if (!options.apiKey) {
    throw new Error("OPENAI_API_KEY is required for AUTOTRADER_AGENT_PROVIDER=openai.");
  }
  const sessionId = sessionIdFromBrief(brief);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(options.apiBaseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        instructions: [
          "You are a Polymarket paper-trading agent.",
          "Return only a JSON decision plan. Do not request or imply live order submission.",
          "Use paper_buy_yes, paper_sell_yes, hold, research_required, or skip only.",
          "Respect all budget and risk caps shown in the prompt; the executor will enforce them."
        ].join("\n"),
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "polymarket_autotrader_agent_decision_plan_v1",
            strict: true,
            schema: decisionPlanSchema(sessionId)
          }
        },
        store: false
      })
    });
    const json = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const error = JSON.stringify(json);
      throw new Error(`OpenAI Responses API failed with ${response.status}: ${error}`);
    }
    return validatePlan(parseAgentDecisionPlanText(extractResponseText(json)), sessionId);
  } finally {
    clearTimeout(timeout);
  }
}

async function runCodexCliAgent(options: AgentCommandOptions, prompt: string, brief: Record<string, unknown> | undefined): Promise<AgentDecisionPlan> {
  const sessionId = sessionIdFromBrief(brief);
  const tempDir = await mkdtemp(path.join(tmpdir(), "poly-codex-agent-"));
  const schemaPath = path.join(tempDir, "decision-plan.schema.json");
  const outputPath = path.join(tempDir, "decision-plan.json");
  try {
    await writeFile(schemaPath, `${JSON.stringify(decisionPlanSchema(sessionId), null, 2)}\n`, "utf8");
    const codexPrompt = [
      "You are the model-only decision subagent for a Polymarket paper-trading daemon.",
      "Do not edit files, do not run commands, do not submit orders, and do not request live execution.",
      "Return only the decision-plan JSON matching the provided schema.",
      "Allowed actions: paper_buy_yes, paper_sell_yes, hold, research_required, skip.",
      "",
      "Autotrader prompt:",
      prompt,
      "",
      "Decision brief JSON:",
      JSON.stringify(brief ?? {}, null, 2)
    ].join("\n");
    const args = [
      ...options.codexPrefixArgs,
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "--color",
      "never"
    ];
    if (options.model) {
      args.push("--model", options.model);
    }
    if (options.codexProfile) {
      args.push("--profile", options.codexProfile);
    }
    args.push("-");
    const useShell = shouldUseShellForCommand(options.codexBin);
    const child = spawnSync(options.codexBin, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      input: codexPrompt,
      shell: useShell,
      timeout: options.timeoutMs,
      env: {
        ...process.env,
        POLYMARKET_ENABLE_TRADING: "false"
      }
    });
    if (child.error || child.status !== 0) {
      const detail = child.error?.message ?? child.stderr?.trim() ?? `exit ${child.status}`;
      throw new Error(`Codex CLI agent command failed: ${detail}`);
    }
    const output = await readFile(outputPath, "utf8");
    return validatePlan(parseAgentDecisionPlanText(output), sessionId);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function writePlan(plan: AgentDecisionPlan, planOut: string | undefined): Promise<void> {
  const text = `${JSON.stringify(plan, null, 2)}\n`;
  if (planOut) {
    await writeFile(planOut, text, "utf8");
  }
  process.stdout.write(text);
}

async function main(): Promise<void> {
  if (process.env.POLYMARKET_ENABLE_TRADING === "true") {
    throw new Error("autotrader-agent-command refuses POLYMARKET_ENABLE_TRADING=true.");
  }
  const options = parseArgs();
  const { prompt, brief } = await readPromptAndBrief(options);
  const sessionId = sessionIdFromBrief(brief);
  const plan = options.provider === "dry_hold"
    ? dryHoldPlan(brief, options.dryHoldReason)
    : options.provider === "codex_cli"
      ? await runCodexCliAgent(options, prompt, brief)
      : await runOpenAiAgent(options, prompt, brief);
  await writePlan(validatePlan(plan, sessionId), options.planOut);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
