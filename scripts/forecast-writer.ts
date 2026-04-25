import { runIndependentForecastWriter } from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

function readArg(name: string): string | undefined {
  const prefixed = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefixed));
  if (inline) {
    return inline.slice(prefixed.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readNumberArg(name: string): number | undefined {
  const value = readArg(name);
  if (value === undefined) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

const dbPath = readArg("db") ?? process.env.AUTOTRADER_STATE_DB_PATH ?? "state/polymarket.sqlite";
const store = openStateStore(dbPath);

try {
  const result = runIndependentForecastWriter(store, {
    runId: readArg("run-id"),
    limit: readNumberArg("limit"),
    minLiquidityUsdc: readNumberArg("min-liquidity-usdc"),
    maxSpreadCents: readNumberArg("max-spread-cents"),
    overwrite: process.argv.includes("--overwrite")
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}
