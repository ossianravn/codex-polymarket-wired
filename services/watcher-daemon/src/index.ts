export interface WatchSubscription {
  kind: "market" | "user" | "rtds";
  identifier: string;
}

export interface AlertRecord {
  id: string;
  severity: "info" | "warn" | "critical";
  category: "price_move" | "spread_widening" | "new_comment" | "related_market_drift" | "resolution";
  title: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Suggested responsibilities:
 * - subscribe to market websocket channels for book/price updates
 * - subscribe to user websocket channels for fills and order changes
 * - subscribe to RTDS topics for comments and activity
 * - materialize compact alert records into a local cache
 * - expose those alerts to the MCP layer through `get_live_alerts`
 */
export async function startWatcher(): Promise<void> {
  console.log("TODO: implement watcher daemon");
}
