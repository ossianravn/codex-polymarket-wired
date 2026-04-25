import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  runResearchRequestWorker,
  type ResearchEvidenceBundle
} from "../packages/auto-trader/src/index.js";
import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

interface CliOptions {
  dbPath?: string;
  sessionId?: string;
  limit?: number;
  evidenceFile?: string;
  json: boolean;
  noMark: boolean;
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

function parseCliArgs(): CliOptions {
  return {
    dbPath: readArg("db") ?? process.env.AUTOTRADER_STATE_DB_PATH,
    sessionId: readArg("session-id") ?? process.env.AUTOTRADER_SESSION_ID,
    limit: readNumberArg("limit"),
    evidenceFile: readArg("evidence-file") ?? process.env.AUTOTRADER_RESEARCH_EVIDENCE_FILE,
    json: process.argv.includes("--json"),
    noMark: process.argv.includes("--no-mark")
  };
}

async function loadEvidenceBundles(filePath: string | undefined): Promise<ResearchEvidenceBundle[] | undefined> {
  if (!filePath) {
    return undefined;
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as ResearchEvidenceBundle[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { evidenceBundles?: unknown }).evidenceBundles)) {
    return (parsed as { evidenceBundles: ResearchEvidenceBundle[] }).evidenceBundles;
  }
  throw new Error("Evidence file must be an array or an object with evidenceBundles array.");
}

function renderText(result: ReturnType<typeof runResearchRequestWorker>): string {
  const lines = result.requests.slice(0, 10).map((request) =>
    `- [${request.status}] ${request.marketKey}: ${request.reasonCodes.join(", ")}${request.researchRunId ? ` (${request.researchRunId})` : ""}`
  );
  return [
    `Research worker: ${result.generatedAt}`,
    `Scanned decisions: ${result.scannedDecisions}`,
    `Pending requests: ${result.pendingRequests}`,
    `Recorded research runs: ${result.recordedResearchRuns}`,
    `Skipped without evidence: ${result.skippedWithoutEvidence}`,
    `Skipped already completed: ${result.skippedAlreadyCompleted}`,
    `Skipped invalid evidence: ${result.skippedInvalidEvidence}`,
    ...(lines.length > 0 ? ["Requests:", ...lines] : ["Requests: none"])
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const config = loadRuntimeConfig();
  const dbPath = options.dbPath ?? config.stateDbPath;
  const evidenceBundles = await loadEvidenceBundles(options.evidenceFile);
  const store = openStateStore(dbPath);
  try {
    const result = runResearchRequestWorker(store, {
      sessionId: options.sessionId,
      limit: options.limit,
      evidenceBundles,
      markDecisionPayload: !options.noMark
    });
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
  console.error("autotrader-research-worker error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

