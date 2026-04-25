import process from "node:process";

import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const output: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      output[key] = true;
      continue;
    }
    output[key] = next;
    index += 1;
  }
  return output;
}

function numberArg(args: Record<string, string | boolean>, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  try {
    const result = store.pruneUniverseRuns({
      keepLatestCompletedRuns: numberArg(args, "keep-latest-universe-runs") ?? 3,
      maxCompletedRunAgeHours: numberArg(args, "max-completed-run-age-hours"),
      maxIncompleteRunAgeHours: numberArg(args, "max-incomplete-run-age-hours") ?? 24,
      dryRun: args["dry-run"] === true
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error("state-maintenance error:", error);
  process.exit(1);
});
