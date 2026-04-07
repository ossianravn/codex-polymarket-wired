export interface ExecutionPolicy {
  enabled: boolean;
  allowPassiveQuotes: boolean;
  allowInventoryRebalancing: boolean;
  heartbeatEnabled: boolean;
  maxOrderUsd: number;
}

export interface PendingAction {
  type: "submit_preview" | "cancel_order" | "cancel_market" | "cancel_all";
  payload: Record<string, unknown>;
}

/**
 * Suggested responsibilities:
 * - consume approved preview IDs or policy-approved actions
 * - maintain heartbeat liveness when passive orders are meant to persist
 * - perform cancel/replace loops for maker-style strategies
 * - keep a durable audit log of every live action
 *
 * Keep this service separate from Codex app automations.
 */
export async function startExecutor(): Promise<void> {
  console.log("TODO: implement executor daemon");
}
