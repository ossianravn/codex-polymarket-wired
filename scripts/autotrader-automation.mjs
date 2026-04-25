import process from "node:process";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { dueStatus, materialChangeFingerprint, materialPaperChanges } from "./autotrader-scheduler.mjs";

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
    respectNextRunAt: envBoolean("AUTOTRADER_RESPECT_NEXT_RUN_AT", true),
    schedulerSlackSeconds: envNumber("AUTOTRADER_SCHEDULER_SLACK_SECONDS", 30),
    heartbeatScript: envString("AUTOTRADER_HEARTBEAT_SCRIPT", "scripts/autotrader-heartbeat.mjs"),
    dryRun: envBoolean("AUTOTRADER_AUTOMATION_DRY_RUN", false)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--latest-report") {
      options.latestReportPath = next;
      index += 1;
    } else if (arg.startsWith("--latest-report=")) {
      options.latestReportPath = arg.split("=")[1];
    } else if (arg === "--ignore-next-run-at" || arg === "--force") {
      options.respectNextRunAt = false;
    } else if (arg === "--respect-next-run-at") {
      options.respectNextRunAt = true;
    } else if (arg === "--scheduler-slack-seconds") {
      options.schedulerSlackSeconds = Number(next);
      index += 1;
    } else if (arg.startsWith("--scheduler-slack-seconds=")) {
      options.schedulerSlackSeconds = Number(arg.split("=")[1]);
    } else if (arg === "--heartbeat-script") {
      options.heartbeatScript = next;
      index += 1;
    } else if (arg.startsWith("--heartbeat-script=")) {
      options.heartbeatScript = arg.split("=")[1];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
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

function parseJsonOrText(text) {
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function acknowledgeMaterialChanges(latestReportPath) {
  const latest = await readJsonIfExists(latestReportPath);
  const changes = materialPaperChanges(latest);
  if (!latest || changes.length === 0) {
    return undefined;
  }
  const ack = {
    ...latest,
    materialChangesAcknowledgedAt: new Date().toISOString(),
    materialChangesAckFingerprint: materialChangeFingerprint(changes)
  };
  await writeFile(latestReportPath, `${JSON.stringify(ack, null, 2)}\n`, "utf8");
  return {
    materialChangesAcknowledgedAt: ack.materialChangesAcknowledgedAt,
    materialChangesAckFingerprint: ack.materialChangesAckFingerprint,
    materialChanges: changes
  };
}

async function main() {
  const options = parseArgs();
  const latestReportPath = absolutePath(options.latestReportPath);
  const latest = await readJsonIfExists(latestReportPath);
  const gate = dueStatus(latest, options);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    latestReportPath,
    automationDecision: gate.automationDecision,
    gate,
    heartbeat: null
  };

  if (!gate.shouldRunHeartbeat || gate.safetyIssue || options.dryRun) {
    if (gate.automationDecision === "notify_material_change" && !options.dryRun) {
      report.materialChangeAck = await acknowledgeMaterialChanges(latestReportPath);
    }
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const heartbeatScript = absolutePath(options.heartbeatScript);
  const child = spawnSync(process.execPath, [heartbeatScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      POLYMARKET_ENABLE_TRADING: "false",
      AUTOTRADER_PREVIEW_LIMIT: process.env.AUTOTRADER_PREVIEW_LIMIT ?? "0",
      AUTOTRADER_REFRESH_SNAPSHOTS: process.env.AUTOTRADER_REFRESH_SNAPSHOTS ?? "true",
      AUTOTRADER_REFRESH_SNAPSHOT_LIMIT: process.env.AUTOTRADER_REFRESH_SNAPSHOT_LIMIT ?? "50",
      AUTOTRADER_REFRESH_SNAPSHOT_MAX_AGE_MINUTES: process.env.AUTOTRADER_REFRESH_SNAPSHOT_MAX_AGE_MINUTES ?? "5",
      AUTOTRADER_RESPECT_NEXT_RUN_AT: process.env.AUTOTRADER_RESPECT_NEXT_RUN_AT ?? "true"
    }
  });
  report.heartbeat = {
    exitCode: child.status,
    signal: child.signal,
    error: child.error
      ? {
        name: child.error.name,
        message: child.error.message,
        code: child.error.code
      }
      : undefined,
    stdout: parseJsonOrText(child.stdout ?? ""),
    stderr: child.stderr?.trim() || undefined
  };
  if (child.status === 0) {
    report.materialChangeAck = await acknowledgeMaterialChanges(latestReportPath);
  }
  report.ok = child.status === 0;
  console.log(JSON.stringify(report, null, 2));
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
