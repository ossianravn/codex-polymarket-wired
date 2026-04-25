import process from "node:process";
import path from "node:path";
import { readFile } from "node:fs/promises";

function envString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function envNumber(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    latestReportPath: envString("AUTOTRADER_LATEST_REPORT_PATH", "state/autotrader-heartbeat-latest.json"),
    observationLogPath: envString("AUTOTRADER_OBSERVATION_LOG_PATH", "state/autotrader-heartbeat.jsonl"),
    historyLimit: envNumber("AUTOTRADER_STATUS_HISTORY_LIMIT", 5),
    json: envBoolean("AUTOTRADER_STATUS_JSON", false)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--latest-report") {
      options.latestReportPath = next;
      index += 1;
    } else if (arg.startsWith("--latest-report=")) {
      options.latestReportPath = arg.split("=")[1];
    } else if (arg === "--observation-log") {
      options.observationLogPath = next;
      index += 1;
    } else if (arg.startsWith("--observation-log=")) {
      options.observationLogPath = arg.split("=")[1];
    } else if (arg === "--history-limit") {
      options.historyLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--history-limit=")) {
      options.historyLimit = Number(arg.split("=")[1]);
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  return options;
}

function absolutePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readJsonlTail(filePath, limit) {
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(0, limit))
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function renderText(status) {
  if (!status.latest) {
    return [
      "Autotrader status: no observations yet.",
      `Latest report: ${status.paths.latestReportPath}`,
      `Observation log: ${status.paths.observationLogPath}`
    ].join("\n");
  }

  const latest = status.latest;
  const changes = latest.materialChanges?.length ? latest.materialChanges.join(", ") : "none";
  const actionCounts = latest.actionCounts
    ? Object.entries(latest.actionCounts).map(([key, value]) => `${key}:${value}`).join(", ")
    : "unknown";
  return [
    `Autotrader status: ${latest.noSubmitInvariantHeld ? "safe-no-submit" : "SAFETY VIOLATION"}`,
    `Generated: ${latest.generatedAt}`,
    `Session: ${latest.sessionId ?? "unknown"}${latest.startedThisRun ? " (started this run)" : ""}`,
    `Scheduler: ${latest.schedulerSkipped ? `deferred (${latest.schedulerReason ?? "not_due"}, due in ${latest.schedulerDueInSeconds ?? "unknown"}s)` : (latest.schedulerReason ?? "ran")}`,
    `Material changes: ${changes}`,
    `Candidates: ${latest.dryRunCandidates ?? 0} dry-run; previews: ${latest.previewAttempts ?? 0}; submitted: ${latest.submittedOrders ?? 0}`,
    `Preview IDs: ${(latest.previewIds ?? []).join(", ") || "none"}`,
    `Actions: ${actionCounts}`,
    `Next run: ${latest.nextRunAt ?? "unknown"}`,
    `History records loaded: ${status.history.length}`
  ].join("\n");
}

async function main() {
  const options = parseArgs();
  const latestReportPath = absolutePath(options.latestReportPath);
  const observationLogPath = absolutePath(options.observationLogPath);
  const latest = await readJsonIfExists(latestReportPath);
  const history = await readJsonlTail(observationLogPath, options.historyLimit);
  const status = {
    ok: Boolean(latest),
    paths: {
      latestReportPath,
      observationLogPath
    },
    latest,
    history
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(renderText(status));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
