import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";

type AgentProvider = "openai" | "dry_hold";

interface AgentCommandOptions {
  provider: AgentProvider;
  model: string;
  apiKey?: string;
  apiBaseUrl: string;
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
  if (options.provider !== "openai" && options.provider !== "dry_hold") {
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
    required: ["kind", "sessionId", "agentName", "decisions"],
    properties: {
      kind: { type: "string", enum: ["polymarket_autotrader_agent_decision_plan_v1"] },
      sessionId: { type: "string", const: sessionId },
      generatedAt: { type: "string" },
      agentName: { type: "string" },
      decisions: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action", "confidence", "rationale"],
          properties: {
            decisionRef: { type: "string" },
            marketKey: { type: "string" },
            action: {
              type: "string",
              enum: ["paper_buy_yes", "paper_sell_yes", "hold", "research_required", "skip"]
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
            limitPrice: { type: "number", minimum: 0, maximum: 1 },
            maxSpendUsdc: { type: "number", minimum: 0 },
            shares: { type: "number", minimum: 0 },
            nextCheckMinutes: { type: "number", minimum: 1, maximum: 1440 },
            evidenceRefs: {
              type: "array",
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

function validatePlan(plan: AgentDecisionPlan, expectedSessionId: string): AgentDecisionPlan {
  if (plan.sessionId !== expectedSessionId) {
    throw new Error(`Agent plan session ${plan.sessionId} does not match expected session ${expectedSessionId}.`);
  }
  if (!Array.isArray(plan.decisions)) {
    throw new Error("Agent plan decisions must be an array.");
  }
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
  }
  return {
    kind: "polymarket_autotrader_agent_decision_plan_v1",
    generatedAt: plan.generatedAt ?? new Date().toISOString(),
    agentName: plan.agentName ?? "autotrader-agent-command",
    ...plan
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
    return validatePlan(JSON.parse(extractResponseText(json)) as AgentDecisionPlan, sessionId);
  } finally {
    clearTimeout(timeout);
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
    : await runOpenAiAgent(options, prompt, brief);
  await writePlan(validatePlan(plan, sessionId), options.planOut);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
