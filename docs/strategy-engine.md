# strategy engine

The strategy engine is the bridge between persisted research state and actionable execution planning.

## what it reads

It consumes only persisted local SQLite state:
- latest market snapshot
- latest classification
- latest research run and evidence
- recent alerts and developments
- latest thesis link for the market
- submitted orders and previews
- persisted portfolio snapshots and positions

## what it produces

Two read-only views:
- **strategy candidates** — ranked markets that are ready for research, strategy drafting, or preview generation
- **execution queue** — deterministic actions such as research refresh, draft strategy, prepare preview, monitor live orders, or cancel stale orders

## decision rules

The engine combines:
- `configs/strategy-policies.yaml`
- `configs/risk-limits.yaml`
- persisted classifications, research, thesis links, portfolio state, and orders

The core decision sequence is:
1. Block or de-prioritize markets with blocked tags, classifier disqualifiers, or near-resolution timing.
2. Surface stale live orders for cancellation before proposing new work.
3. Require research when fair value is missing or stale.
4. Require explicit two-sided evidence and related-market checks when configured.
5. Promote markets to `strategy-ready` or `preview-ready` only when stored edge, liquidity, and spread meet policy thresholds.
6. Apply thesis-aware portfolio checks before allowing fresh entries.

## thesis-aware suppression

The engine now treats a thesis as a first-class coordination unit.
When multiple markets share the same thesis key, it can:
- suppress lower-ranked same-thesis entries when a stronger sibling is already actionable
- penalize candidate priority as thesis exposure rises
- block new entries when thesis exposure or thesis market count exceed configured caps
- keep waiting candidates visible without turning them into duplicate preview recommendations

This prevents the queue from recommending several highly correlated trades at once just because each market looks good in isolation.

## executor daemon

`services/executor-daemon/` now uses this engine directly. In dry-run mode it:
- syncs live open orders into SQLite when credentials are available
- syncs live positions into persisted portfolio snapshots when an owner address is configured
- marks locally-open orders that are no longer on venue as `not_on_venue`
- emits a queue for monitoring, research refresh, preview prep, or stale-order cancellation

With `--apply-cancels`, it can issue explicit cancel requests for stale live orders and write the resulting lifecycle update back into SQLite.

## mcp tools

The MCP server exposes the same state-driven logic through:
- `get_strategy_candidates`
- `get_execution_queue`
- `get_portfolio_risk_summary`

These tools are intentionally read-only and do not place or cancel orders themselves.
