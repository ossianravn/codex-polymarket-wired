import path from "node:path";

import { loadRuntimeConfig } from "../packages/polymarket-core/src/index.js";
import { loadRiskLimits } from "../packages/policy-engine/src/index.js";
import { buildExecutionQueue, loadStrategyPolicies } from "../packages/strategy-engine/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  const limits = await loadRiskLimits(path.resolve(config.cwd, "configs/risk-limits.yaml"));
  const policies = await loadStrategyPolicies(path.resolve(config.cwd, "configs/strategy-policies.yaml"));
  const queue = buildExecutionQueue(store, policies, limits, {
    limit: 50,
    includeWaiting: process.argv.includes("--include-waiting")
  });
  console.log(JSON.stringify({ stateDbPath: config.stateDbPath, count: queue.length, queue }, null, 2));
}

main().catch((error) => {
  console.error("execution-queue error:", error);
  process.exit(1);
});
