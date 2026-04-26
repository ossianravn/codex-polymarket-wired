import "dotenv/config";

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type {
  ResearchEvidenceTemplateResult,
  ResearchRequestEvidenceTemplate,
  ResearchSourcePack
} from "../packages/auto-trader/src/index.js";

type ResearchAgentProvider = "openai" | "codex_cli";

export interface ResearchAgentCommandOptions {
  provider: ResearchAgentProvider;
  model: string;
  apiKey?: string;
  apiBaseUrl: string;
  codexBin: string;
  codexPrefixArgs: string[];
  codexProfile?: string;
  templatePath?: string;
  outPath?: string;
  timeoutMs: number;
  limit: number;
}

interface ResearchSourcePackPlan {
  kind?: "polymarket_autotrader_research_source_packs_v1";
  generatedAt?: string;
  agentName?: string;
  sourcePacks: ResearchSourcePack[];
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
  const arg = argv[index] ?? "";
  const equals = arg.indexOf("=");
  return equals >= 0 ? arg.slice(equals + 1) : argv[index + 1];
}

function consumedNext(argv: string[], index: number): boolean {
  return !(argv[index] ?? "").includes("=");
}

export function parseResearchAgentCommandArgs(argv = process.argv.slice(2)): ResearchAgentCommandOptions {
  const options: ResearchAgentCommandOptions = {
    provider: (envString("AUTOTRADER_RESEARCH_AGENT_PROVIDER", "codex_cli") as ResearchAgentProvider) ?? "codex_cli",
    model: envString("AUTOTRADER_RESEARCH_AGENT_MODEL", "gpt-5.2") ?? "gpt-5.2",
    apiKey: envString("OPENAI_API_KEY"),
    apiBaseUrl: envString("AUTOTRADER_RESEARCH_AGENT_API_BASE_URL", "https://api.openai.com/v1/responses") ?? "https://api.openai.com/v1/responses",
    codexBin: envString("AUTOTRADER_CODEX_BIN", "codex") ?? "codex",
    codexPrefixArgs: envStringArray("AUTOTRADER_CODEX_PREFIX_ARGS"),
    codexProfile: envString("AUTOTRADER_CODEX_PROFILE"),
    templatePath: envString("AUTOTRADER_RESEARCH_TEMPLATE_FILE"),
    outPath: envString("AUTOTRADER_RESEARCH_SOURCE_FILE"),
    timeoutMs: envNumber("AUTOTRADER_RESEARCH_AGENT_TIMEOUT_MS", 180_000),
    limit: envNumber("AUTOTRADER_RESEARCH_AGENT_LIMIT", 6)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--provider" || arg.startsWith("--provider=")) {
      options.provider = readArgValue(argv, index) as ResearchAgentProvider;
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
    } else if (arg === "--template-file" || arg === "--template" || arg.startsWith("--template-file=") || arg.startsWith("--template=")) {
      options.templatePath = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--out" || arg === "--source-file" || arg.startsWith("--out=") || arg.startsWith("--source-file=")) {
      options.outPath = readArgValue(argv, index);
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      options.limit = Number(readArgValue(argv, index));
      if (consumedNext(argv, index)) index += 1;
    }
  }

  options.timeoutMs = Math.max(1_000, Math.min(10 * 60_000, Number(options.timeoutMs)));
  options.limit = Math.max(1, Math.min(25, Number(options.limit)));
  if (options.provider !== "openai" && options.provider !== "codex_cli") {
    throw new Error(`Unsupported AUTOTRADER_RESEARCH_AGENT_PROVIDER '${options.provider}'.`);
  }
  return options;
}

function templatesArray(
  templates: ResearchEvidenceTemplateResult | ResearchRequestEvidenceTemplate[]
): ResearchRequestEvidenceTemplate[] {
  return Array.isArray(templates) ? templates : templates.templates;
}

async function readTemplates(pathName: string): Promise<ResearchRequestEvidenceTemplate[]> {
  const parsed = JSON.parse(await readFile(pathName, "utf8")) as ResearchEvidenceTemplateResult | ResearchRequestEvidenceTemplate[];
  return templatesArray(parsed);
}

function sourcePackSchema(templateMarketKeys: string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "generatedAt", "agentName", "sourcePacks"],
    properties: {
      kind: { type: "string", enum: ["polymarket_autotrader_research_source_packs_v1"] },
      generatedAt: { type: ["string", "null"] },
      agentName: { type: "string" },
      sourcePacks: {
        type: "array",
        maxItems: Math.max(1, templateMarketKeys.length),
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "marketKey",
            "title",
            "question",
            "thesis",
            "fairValueLow",
            "fairValueBase",
            "fairValueHigh",
            "supportsYes",
            "supportsNo",
            "openQuestions",
            "providers",
            "notes",
            "completedAt",
            "numericalAnchors",
            "counterCase",
            "sourceCutoff"
          ],
          properties: {
            marketKey: { type: "string", enum: templateMarketKeys },
            title: { type: ["string", "null"] },
            question: { type: ["string", "null"] },
            thesis: { type: "string" },
            fairValueLow: { type: "number", minimum: 0.001, maximum: 0.999 },
            fairValueBase: { type: "number", minimum: 0.001, maximum: 0.999 },
            fairValueHigh: { type: "number", minimum: 0.001, maximum: 0.999 },
            supportsYes: {
              type: "array",
              minItems: 1,
              items: { "$ref": "#/$defs/evidenceItem" }
            },
            supportsNo: {
              type: "array",
              minItems: 1,
              items: { "$ref": "#/$defs/evidenceItem" }
            },
            openQuestions: { type: "array", items: { type: "string" } },
            providers: { type: "array", minItems: 1, items: { type: "string" } },
            notes: { type: "string" },
            completedAt: { type: ["string", "null"] },
            numericalAnchors: { type: "array", minItems: 1, items: { type: "string" } },
            counterCase: { type: "string" },
            sourceCutoff: { type: ["string", "null"] }
          }
        }
      }
    },
    $defs: {
      evidenceItem: {
        type: "object",
        additionalProperties: false,
        required: ["source", "title", "url", "summary", "stance", "confidence"],
        properties: {
          source: { type: "string" },
          title: { type: "string" },
          url: { type: ["string", "null"] },
          summary: { type: "string" },
          stance: { type: "string", enum: ["supports_yes", "supports_no", "neutral"] },
          confidence: { type: ["string", "number"] }
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
  throw new Error("Model response did not contain output text.");
}

function parsePlanText(text: string): ResearchSourcePackPlan {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed) as ResearchSourcePackPlan;
}

function shouldUseShellForCommand(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command) && !command.includes(path.sep) && !command.includes("/");
}

function venueContaminationTokens(): string[] {
  return [
    "venue price",
    "venue market price",
    "exchange market price",
    "market-implied",
    "market implied",
    "polymarket odds",
    "polymarket price",
    "orderbook",
    "order book",
    "best bid",
    "best ask",
    "midpoint"
  ];
}

function planText(pack: ResearchSourcePack): string {
  return [
    pack.title,
    pack.question,
    pack.thesis,
    pack.notes,
    pack.counterCase,
    ...(pack.numericalAnchors ?? []),
    ...(pack.providers ?? []),
    ...(pack.supportsYes ?? []).flatMap((item) => [item.source, item.title, item.summary]),
    ...(pack.supportsNo ?? []).flatMap((item) => [item.source, item.title, item.summary])
  ].map((value) => String(value ?? "").toLowerCase()).join("\n");
}

function validateSourcePackPlan(
  plan: ResearchSourcePackPlan,
  templates: ResearchRequestEvidenceTemplate[],
  now = new Date()
): ResearchSourcePackPlan {
  const allowedKeys = new Set(templates.map((template) => template.marketKey));
  const sourcePacks: ResearchSourcePack[] = [];
  for (const pack of plan.sourcePacks ?? []) {
    if (!allowedKeys.has(pack.marketKey)) {
      throw new Error(`Research source pack references unknown marketKey: ${pack.marketKey}`);
    }
    const fairValueLow = Number(pack.fairValueLow);
    const fairValueBase = Number(pack.fairValueBase);
    const fairValueHigh = Number(pack.fairValueHigh);
    if (
      !Number.isFinite(fairValueLow) ||
      !Number.isFinite(fairValueBase) ||
      !Number.isFinite(fairValueHigh) ||
      fairValueLow <= 0 ||
      fairValueBase <= 0 ||
      fairValueHigh <= 0 ||
      fairValueLow > fairValueBase ||
      fairValueBase > fairValueHigh ||
      fairValueHigh >= 1
    ) {
      throw new Error(`Invalid fair-value interval for ${pack.marketKey}.`);
    }
    if (!pack.thesis?.trim()) {
      throw new Error(`Missing thesis for ${pack.marketKey}.`);
    }
    if ((pack.supportsYes ?? []).length < 1 || (pack.supportsNo ?? []).length < 1) {
      throw new Error(`Research source pack for ${pack.marketKey} must include yes and no evidence.`);
    }
    if ((pack.numericalAnchors ?? []).length < 1) {
      throw new Error(`Research source pack for ${pack.marketKey} must include numerical anchors.`);
    }
    const text = planText(pack);
    if (venueContaminationTokens().some((token) => text.includes(token))) {
      throw new Error(`Research source pack for ${pack.marketKey} contains venue-price contamination.`);
    }
    sourcePacks.push({
      ...pack,
      completedAt: pack.completedAt ?? now.toISOString(),
      sourceCutoff: pack.sourceCutoff ?? now.toISOString()
    });
  }
  return {
    kind: "polymarket_autotrader_research_source_packs_v1",
    generatedAt: typeof plan.generatedAt === "string" ? plan.generatedAt : now.toISOString(),
    agentName: typeof plan.agentName === "string" ? plan.agentName : "autotrader-research-agent-command",
    sourcePacks
  };
}

function compactTemplates(templates: ResearchRequestEvidenceTemplate[]): Array<Record<string, unknown>> {
  return templates.map((template) => ({
    marketKey: template.marketKey,
    title: template.title,
    question: template.researchQuestion,
    priority: template.priority,
    dueAt: template.dueAt,
    endDate: template.marketContext.endDate,
    outcomes: template.marketContext.outcomes,
    eventTitle: template.marketContext.eventTitle,
    eventSlug: template.marketContext.eventSlug,
    categoryGroup: template.marketContext.categoryGroup,
    structuralType: template.marketContext.structuralType,
    resolutionText: template.marketContext.resolutionText,
    reasonCodes: template.reasonCodes.slice(0, 12),
    forecastBlockers: template.forecastBlockers
  }));
}

function makeResearchPrompt(templates: ResearchRequestEvidenceTemplate[]): string {
  return [
    "You are an independent research forecaster for a paper-only Polymarket autotrader.",
    "Return sourcePacks JSON only. Do not submit orders, request live execution, or use trading-screen data.",
    "Use only external evidence and source reasoning. Forbidden as fair-value evidence: Polymarket odds, venue prices, orderbook, best bid, best ask, spread, recent venue trades, and market-implied probabilities.",
    "If you cannot form a source-backed forecast for a template, omit that template rather than fabricating evidence.",
    "Each source pack must include a probability interval, at least one supports_yes item, at least one supports_no item, numericalAnchors, and a counterCase.",
    "",
    "Compact pending research templates:",
    JSON.stringify(compactTemplates(templates), null, 2)
  ].join("\n");
}

async function runOpenAiResearchAgent(options: ResearchAgentCommandOptions, templates: ResearchRequestEvidenceTemplate[]): Promise<ResearchSourcePackPlan> {
  if (!options.apiKey) {
    throw new Error("OPENAI_API_KEY is required for AUTOTRADER_RESEARCH_AGENT_PROVIDER=openai.");
  }
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
        instructions: "You produce independent, source-backed research source packs for a paper-only autotrader. Return only schema-valid JSON.",
        input: makeResearchPrompt(templates),
        text: {
          format: {
            type: "json_schema",
            name: "polymarket_autotrader_research_source_packs_v1",
            strict: true,
            schema: sourcePackSchema(templates.map((template) => template.marketKey))
          }
        },
        store: false
      })
    });
    const json = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`OpenAI Responses API failed with ${response.status}: ${JSON.stringify(json)}`);
    }
    return validateSourcePackPlan(parsePlanText(extractResponseText(json)), templates);
  } finally {
    clearTimeout(timeout);
  }
}

async function runCodexCliResearchAgent(options: ResearchAgentCommandOptions, templates: ResearchRequestEvidenceTemplate[]): Promise<ResearchSourcePackPlan> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "poly-codex-research-agent-"));
  const schemaPath = path.join(tempDir, "research-source-packs.schema.json");
  const outputPath = path.join(tempDir, "research-source-packs.json");
  try {
    await writeFile(schemaPath, `${JSON.stringify(sourcePackSchema(templates.map((template) => template.marketKey)), null, 2)}\n`, "utf8");
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
    const child = spawnSync(options.codexBin, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      input: makeResearchPrompt(templates),
      shell: shouldUseShellForCommand(options.codexBin),
      timeout: options.timeoutMs,
      env: {
        ...process.env,
        POLYMARKET_ENABLE_TRADING: "false"
      }
    });
    if (child.error || child.status !== 0) {
      const detail = child.error?.message ?? child.stderr?.trim() ?? `exit ${child.status}`;
      throw new Error(`Codex CLI research agent failed: ${detail}`);
    }
    return validateSourcePackPlan(parsePlanText(await readFile(outputPath, "utf8")), templates);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function generateResearchSourcePacks(
  templates: ResearchEvidenceTemplateResult | ResearchRequestEvidenceTemplate[],
  options: ResearchAgentCommandOptions
): Promise<ResearchSourcePackPlan> {
  const selectedTemplates = templatesArray(templates).slice(0, options.limit);
  if (selectedTemplates.length === 0) {
    return {
      kind: "polymarket_autotrader_research_source_packs_v1",
      generatedAt: new Date().toISOString(),
      agentName: "autotrader-research-agent-command",
      sourcePacks: []
    };
  }
  return options.provider === "codex_cli"
    ? runCodexCliResearchAgent(options, selectedTemplates)
    : runOpenAiResearchAgent(options, selectedTemplates);
}

async function main(): Promise<void> {
  if (process.env.POLYMARKET_ENABLE_TRADING === "true") {
    throw new Error("autotrader-research-agent-command refuses POLYMARKET_ENABLE_TRADING=true.");
  }
  const options = parseResearchAgentCommandArgs();
  if (!options.templatePath) {
    throw new Error("Missing --template-file with pending research templates.");
  }
  const plan = await generateResearchSourcePacks(await readTemplates(options.templatePath), options);
  const text = `${JSON.stringify(plan, null, 2)}\n`;
  if (options.outPath) {
    await writeFile(options.outPath, text, "utf8");
  }
  process.stdout.write(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
