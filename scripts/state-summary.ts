import process from "node:process";

import { loadRuntimeConfig, resolveMarketByIdentifier, type IdentifierType } from "../packages/polymarket-core/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const store = openStateStore(config.stateDbPath);
  const [identifierType, identifier] = process.argv.slice(2) as [IdentifierType | undefined, string | undefined];

  if (identifierType && identifier) {
    const snapshot = await resolveMarketByIdentifier(config, identifierType, identifier, {
      includeComments: false,
      includeOrderbookSummary: true,
      includeRelatedMarkets: false
    });
    const { marketKey } = store.recordMarketSnapshot(snapshot);
    console.log(JSON.stringify({ marketKey, state: store.getMarketState({ marketKey }) }, null, 2));
    return;
  }

  console.log(JSON.stringify(store.getStateSummary(10), null, 2));
}

main().catch((error) => {
  console.error("state-summary error:", error);
  process.exit(1);
});
