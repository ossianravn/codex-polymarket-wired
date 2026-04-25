import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import {
  generateResearchSourcePacks,
  type ResearchAgentCommandOptions
} from "./autotrader-research-agent-command.js";
import {
  buildResearchEvidenceBundles,
  buildResearchEvidenceTemplate,
  runIndependentForecastWriter,
  runResearchEvidencePipeline,
  type ResearchEvidenceTemplateResult,
  type ResearchRequestEvidenceTemplate,
  type ResearchSourcePack
} from "../packages/auto-trader/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

interface CliOptions {
  dbPath?: string;
  sessionId?: string;
  limit?: number;
  sourceFile?: string;
  sourceProvider?: ResearchAgentCommandOptions["provider"];
  agentModel?: string;
  agentTimeoutMs?: number;
  codexBin?: string;
  codexProfile?: string;
  templateFile?: string;
  outFile?: string;
  record: boolean;
  writeForecasts: boolean;
  forecastRunId?: string;
  overwriteForecasts: boolean;
  json: boolean;
}

function readArg(name: string, argv = process.argv.slice(2)): string | undefined {
  const prefixed = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefixed));
  if (inline) {
    return inline.slice(prefixed.length);
  }
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readNumberArg(name: string): number | undefined {
  const value = readArg(name);
  if (value === undefined) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function readJsonStringArrayEnv(name: string): string[] {
  const value = process.env[name];
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return value.split(/\s+/u).map((item) => item.trim()).filter(Boolean);
  }
}

function parseCliArgs(): CliOptions {
  return {
    dbPath: readArg("db") ?? process.env.AUTOTRADER_STATE_DB_PATH,
    sessionId: readArg("session-id") ?? process.env.AUTOTRADER_SESSION_ID,
    limit: readNumberArg("limit"),
    sourceFile: readArg("source-file") ?? process.env.AUTOTRADER_RESEARCH_SOURCE_FILE,
    sourceProvider: (readArg("source-provider") ?? process.env.AUTOTRADER_RESEARCH_AGENT_PROVIDER) as ResearchAgentCommandOptions["provider"] | undefined,
    agentModel: readArg("agent-model") ?? process.env.AUTOTRADER_RESEARCH_AGENT_MODEL,
    agentTimeoutMs: readNumberArg("agent-timeout-ms"),
    codexBin: readArg("codex-bin"),
    codexProfile: readArg("codex-profile") ?? process.env.AUTOTRADER_CODEX_PROFILE,
    templateFile: readArg("template-file") ?? process.env.AUTOTRADER_RESEARCH_TEMPLATE_FILE,
    outFile: readArg("out") ?? readArg("evidence-file") ?? process.env.AUTOTRADER_RESEARCH_EVIDENCE_FILE,
    record: process.argv.includes("--record"),
    writeForecasts: process.argv.includes("--write-forecasts"),
    forecastRunId: readArg("run-id") ?? process.env.AUTOTRADER_FORECAST_RUN_ID,
    overwriteForecasts: process.argv.includes("--overwrite-forecasts"),
    json: process.argv.includes("--json")
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function sourcePacksFromJson(parsed: unknown): ResearchSourcePack[] {
  if (Array.isArray(parsed)) {
    return parsed as ResearchSourcePack[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { sourcePacks?: unknown }).sourcePacks)) {
    return (parsed as { sourcePacks: ResearchSourcePack[] }).sourcePacks;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { packs?: unknown }).packs)) {
    return (parsed as { packs: ResearchSourcePack[] }).packs;
  }
  throw new Error("Source file must be an array or an object with sourcePacks array.");
}

function templatesFromJson(parsed: unknown): ResearchEvidenceTemplateResult | ResearchRequestEvidenceTemplate[] {
  if (Array.isArray(parsed)) {
    return parsed as ResearchRequestEvidenceTemplate[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { templates?: unknown }).templates)) {
    return parsed as ResearchEvidenceTemplateResult;
  }
  throw new Error("Template file must be a template result object or templates array.");
}

function renderText(result: {
  provider: ReturnType<typeof buildResearchEvidenceBundles>;
  research?: NonNullable<ReturnType<typeof runResearchEvidencePipeline>["worker"]>;
  forecasts?: ReturnType<typeof runIndependentForecastWriter>;
}): string {
  const lines = [
    `Research provider: ${result.provider.generatedAt}`,
    `Templates scanned: ${result.provider.scannedTemplates}`,
    `Source packs: ${result.provider.sourcePacks}`,
    `Evidence bundles ready: ${result.provider.writtenBundles}`,
    `Skipped missing source: ${result.provider.skippedMissingSourcePack}`,
    `Skipped invalid: ${result.provider.skippedInvalid}`
  ];
  if (result.research) {
    lines.push(
      `Recorded research runs: ${result.research.recordedResearchRuns}`,
      `Invalid evidence records: ${result.research.skippedInvalidEvidence}`
    );
  }
  if (result.forecasts) {
    lines.push(
      `Forecasts written: ${result.forecasts.written}`,
      `Forecasts skipped existing: ${result.forecasts.skippedExisting}`
    );
  }
  const issues = result.provider.issues.slice(0, 10).map((issue) =>
    `- [${issue.status}] ${issue.marketKey}: ${issue.reasonCodes.join(", ")}`
  );
  return [...lines, ...(issues.length > 0 ? ["Issues:", ...issues] : [])].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  if (!options.sourceFile && !options.sourceProvider) {
    throw new Error("Missing --source-file with independent research source packs, or --source-provider=codex_cli|openai.");
  }
  if (
    options.sourceProvider &&
    options.sourceProvider !== "codex_cli" &&
    options.sourceProvider !== "openai"
  ) {
    throw new Error(`Unsupported --source-provider '${options.sourceProvider}'.`);
  }
  const config = loadRuntimeConfig();
  const dbPath = options.dbPath ?? config.stateDbPath;
  const store = openStateStore(dbPath);
  try {
    const templates = options.templateFile
      ? templatesFromJson(await readJsonFile<unknown>(options.templateFile))
      : buildResearchEvidenceTemplate(store, {
        sessionId: options.sessionId,
        limit: options.limit
      });
    const sourcePacks = options.sourceFile
      ? sourcePacksFromJson(await readJsonFile<unknown>(options.sourceFile))
      : (await generateResearchSourcePacks(templates, {
        provider: options.sourceProvider ?? "codex_cli",
        model: options.agentModel ?? process.env.AUTOTRADER_RESEARCH_AGENT_MODEL ?? "gpt-5.2",
        apiKey: process.env.OPENAI_API_KEY,
        apiBaseUrl: process.env.AUTOTRADER_RESEARCH_AGENT_API_BASE_URL ?? "https://api.openai.com/v1/responses",
        codexBin: options.codexBin ?? process.env.AUTOTRADER_CODEX_BIN ?? "codex",
        codexPrefixArgs: readJsonStringArrayEnv("AUTOTRADER_CODEX_PREFIX_ARGS"),
        codexProfile: options.codexProfile,
        timeoutMs: options.agentTimeoutMs ?? Number(process.env.AUTOTRADER_RESEARCH_AGENT_TIMEOUT_MS ?? 90_000),
        limit: options.limit ?? Number(process.env.AUTOTRADER_RESEARCH_AGENT_LIMIT ?? 6)
      })).sourcePacks;
    const pipeline = options.record
      ? runResearchEvidencePipeline(store, {
        templates,
        sessionId: options.sessionId,
        limit: options.limit,
        sourcePacks,
        automationName: "autotrader-research-provider"
      })
      : undefined;
    const provider = pipeline?.provider ?? buildResearchEvidenceBundles({
      templates,
      sourcePacks,
      automationName: "autotrader-research-provider"
    });
    if (options.outFile) {
      await writeFile(options.outFile, `${JSON.stringify({ evidenceBundles: provider.evidenceBundles }, null, 2)}\n`, "utf8");
    }
    const research = pipeline?.worker;
    const forecasts = options.writeForecasts
      ? runIndependentForecastWriter(store, {
        runId: options.forecastRunId,
        limit: options.limit,
        overwrite: options.overwriteForecasts
      })
      : undefined;
    const result = { provider, research, forecasts };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderText(result));
    }
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error("autotrader-research-provider error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
