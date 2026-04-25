# autonomous trading

The autonomous trading implementation is a mode-aware control plane. It turns a user mandate into persisted session state, timeframe-aware candidate filtering, paper fills, marked paper positions, live decision gates, exit decisions, realized paper PnL, and follow-up scheduling.

It does not submit live orders. Live execution remains gated behind `preview_limit_order`, `preview_marketable_order`, and `submit_previewed_order`.

For the staged path from this paper/preview control plane to production-grade autonomous trading, see `docs/autonomous-trading-production-readiness-plan.md`. For the narrower paper-only wrap-up target, see `docs/autotrader-paper-mvp-wrap-up.md`.

## mandate

An autonomous trading mandate contains:

```yaml
budget_usdc: 50
timeframe_hours: 72
risk_profile: conservative # conservative | balanced | aggressive
mode: paper                # paper | live_guarded | live_autonomous
```

Optional constraints:

```yaml
max_single_order_usdc: 5
max_open_positions: 6
max_market_horizon_hours: 96
min_liquidity_usdc: 5000
max_spread_cents: 5
take_profit_pct: 25
position_stop_loss_pct: 15
position_stop_loss_grace_minutes: 20
paper_reentry_cooldown_minutes: 30
time_exit_hours: 1
stop_loss_usdc: 10
```

Risk profiles set defaults for:

- max single-order fraction of budget
- max open paper positions
- allowed market horizon relative to the session timeframe
- minimum hours before resolution
- liquidity, spread, tradability, research-priority, and ambiguity thresholds
- take-profit, per-position stop-loss, time-exit, and session stop-loss thresholds
- heartbeat cadence
- whether longshots are allowed

## iteration

Each iteration:

1. Loads the latest persisted universe run.
2. Filters markets by mandate timeframe, end date, liquidity, spread, ambiguity, tradability, and risk profile.
3. Scores remaining candidates using trade-opportunity, research-priority, tradability, catalyst, horizon fit, and risk penalty.
4. Marks open paper positions from the latest persisted universe prices.
5. Produces paper `sell yes` exits for take-profit, stop-loss, or near-resolution time-exit cases.
6. Blocks new paper buys when the session stop-loss threshold is breached.
7. Produces paper `buy yes` proposals for the strongest remaining candidates.
8. Persists idempotent paper fills, aggregates open positions by session/market, and closes paper positions with realized PnL.
9. Emits a next-run timestamp for heartbeat or per-market scheduling.

## commands

Start a new paper session:

```bash
npm run autotrader:once -- --budget-usdc 50 --timeframe-hours 72 --risk-profile aggressive
```

Run another iteration for an existing session:

```bash
npm run autotrader:once -- --session-id <session-id>
```

Return JSON:

```bash
npm run autotrader:once -- --session-id <session-id> --json
```

Return compact JSON for agent-facing dry runs:

```bash
npm run autotrader:once -- --session-id <session-id> --json --compact
```

## Offline simulation

Use `autotrader:simulate` to test the autonomous loop without live APIs, credentials, or real orders. It creates a temporary SQLite database, seeds synthetic universe snapshots over several ticks, runs the planner each tick, simulates paper fills from proposed `paper_buy_yes` decisions, and marks positions to the synthetic price path.

```bash
npm run autotrader:simulate -- --budget-usdc 50 --timeframe-hours 24 --risk-profile balanced
```

Return full simulation JSON:

```bash
node --import tsx ./scripts/autotrader-simulation.ts --budget-usdc 50 --timeframe-hours 24 --risk-profile balanced --ticks 4 --tick-minutes 360 --json
```

In this Windows development environment, use the direct `node --import tsx` form when passing custom flags; the local npm wrapper can drop forwarded arguments.

The simulation is deterministic and intentionally conservative as a test harness. It is not a backtest against historical Polymarket order books, and its paper fills assume proposed passive orders get filled at the planner target price.

## Independent forecast gate

Entry proposals require an independent fair-value artifact before the planner compares against venue price. The artifact lives at `market.rawJson.independentForecast` and must be sealed before it can unlock `paper_buy_yes` or live buy decisions:

```json
{
  "independentForecast": {
    "sealed": true,
    "probability": 0.58,
    "uncertainty": 0.03,
    "forecastedAt": "2026-04-25T12:00:00.000Z",
    "expiresAt": "2026-04-26T12:00:00.000Z",
    "numericalChecks": ["base-rate and timeline feasibility check"],
    "usesVenuePrice": false
  }
}
```

The auto-trader blocks entry candidates as `research_required` when the forecast is missing, unsealed, stale, expired, contaminated by venue price, lacks numerical checks, or has insufficient uncertainty-adjusted edge. Venue price, spread, and orderbook data are used only after this artifact exists, and only for edge and execution checks.

Use `forecast:write` to annotate the latest persisted universe run with sealed screening forecasts:

```bash
node --import tsx ./scripts/forecast-writer.ts --limit 100 --min-liquidity-usdc 1000 --max-spread-cents 12
```

The writer uses non-price universe evidence only: structural type, catalyst/modelability scores, ambiguity/risk scores, resolution metadata, and reason codes. It deliberately records `method: "screening_forecast_v0"` and a counter-case so deeper research can replace it later. Screening forecasts can unlock paper entries only; live-mode entries remain blocked until a deeper non-screening forecast method replaces the artifact. It skips existing forecasts unless `--overwrite` is provided.

`start_auto_trading_session` and `run_auto_trading_iteration` call this writer by default through `auto_forecast=true`, so paper sessions can produce candidates after a universe scan while still respecting the forecast-before-price guard. Pass `auto_forecast=false` when testing the hard research gate itself.

When candidates are blocked by the independent forecast gate, the autotrader emits `researchRequest` payloads. Use `autotrader:research-worker` to consume those requests from persisted decisions and record `research_runs` from an independent evidence bundle:

```bash
node --import tsx ./scripts/autotrader-research-worker.ts --session-id <session-id> --evidence-file ./examples/autotrader-research-evidence.example.json --json
```

The worker rejects evidence bundles that mention venue prices, Polymarket odds, orderbook data, bid/ask, spread, midpoint, recent venue trades, or market-implied probability. After the worker records a valid research run, run `forecast:write` again so the forecast writer can upgrade the market to `method: "deep_research_forecast_v1"`.

## live execution modes

The session mode controls execution:

- `paper` records simulated entries/exits and is blocked from live execution.
- `live_guarded` produces live entry/exit decisions and a preview-ready order request, but requires explicit approval after `preview_limit_order`.
- `live_autonomous` produces live entry/exit decisions that can submit only after the same guarded preview and policy checks pass.

Use `get_auto_trading_execution_gate` with a session id and decision id to inspect the bridge from a persisted decision into `preview_limit_order` input. The gate returns blockers, whether approval is required, and whether autonomous submission is eligible after preview policy passes.

Use `execute_auto_trading_decision` to apply the gate:

- `paper` records `blocked` execution state and does not create a live preview.
- `live_guarded` creates the guarded preview and records `awaiting_approval`.
- `live_autonomous` creates the guarded preview by default. It submits only when `auto_submit=true`, `live_autonomous_submit_confirmation="CONFIRM_LIVE_AUTONOMOUS_SUBMIT"`, the preview is submit-safe, trading is enabled in both environment and risk config, credentials exist, and the policy hash has not changed.

Each execution attempt updates the decision payload with `execution` and `executionHistory` audit fields.

Use `run_auto_trading_executor` to process pending live-mode decisions in batches. It ignores paper sessions and already-executed decisions, supports `dry_run`, stops at `awaiting_approval` for `live_guarded`, and defaults to preview-only for `live_autonomous`. Autonomous live submission requires both `auto_submit=true` and `live_autonomous_submit_confirmation="CONFIRM_LIVE_AUTONOMOUS_SUBMIT"` before the same checks used by `execute_auto_trading_decision`.

Use `npm run smoke:autotrader-mcp` for an end-to-end no-submit MCP smoke. It starts the server with `POLYMARKET_ENABLE_TRADING=false`, seeds a small composite universe, creates a 24-hour aggressive `live_guarded` session, runs the executor in `dry_run`, then creates one guarded preview with `auto_submit=false` and asserts no order was submitted.

Use `npm run autotrader:heartbeat` for recurring observation. It runs the same MCP path but resumes the active named session instead of creating duplicate sessions, refreshes the universe, runs one iteration, dry-runs executor eligibility, creates at most one guarded preview, and keeps `POLYMARKET_ENABLE_TRADING=false`.

The heartbeat runner accepts environment-variable configuration for automation contexts: `AUTOTRADER_BUDGET_USDC`, `AUTOTRADER_TIMEFRAME_HOURS`, `AUTOTRADER_RISK_PROFILE`, `AUTOTRADER_SESSION_NAME`, `AUTOTRADER_STATE_DB_PATH`, `AUTOTRADER_EXECUTOR_LIMIT`, `AUTOTRADER_PREVIEW_LIMIT`, and related universe filter variables. This avoids relying on shell-specific npm argument forwarding.

Heartbeat observations are persisted to `state/autotrader-heartbeat.jsonl` and `state/autotrader-heartbeat-latest.json` by default. Override with `AUTOTRADER_OBSERVATION_LOG_PATH` and `AUTOTRADER_LATEST_REPORT_PATH`. Scheduled monitors should key off `observation.materialChanges`.

By default, the heartbeat runner respects the prior observation's `nextRunAt`. This lets a Codex or cron automation run frequently while the script cheaply defers MCP/universe work until the session is due. Use `AUTOTRADER_RESPECT_NEXT_RUN_AT=false` or `--ignore-next-run-at` for a forced run. Use `AUTOTRADER_SCHEDULER_SLACK_SECONDS` to allow early execution near the due time.

Use `npm run autotrader:status` when an automation only needs to report the latest observation. It reads the latest snapshot and JSONL history without touching Polymarket APIs or creating previews. Use `npm run autotrader:status:json` or `AUTOTRADER_STATUS_JSON=true` for machine-readable output.

Use `npm run autotrader:due-status` for a lightweight automation gate. It reads only the latest heartbeat snapshot, returns `automationDecision` as `quiet`, `run_heartbeat`, `notify_material_change`, or `notify_safety_issue`, and never connects to the MCP server. Use `npm run autotrader:due-status:json` for machine-readable automation routing.

Use `npm run autotrader:automation` as the preferred unattended entrypoint. It runs the same due-status gate first, exits quietly for `quiet` and `notify_material_change`, refuses to run the heartbeat on `notify_safety_issue`, and only spawns `autotrader-heartbeat.mjs` when the decision is `run_heartbeat`. The child heartbeat is launched with `POLYMARKET_ENABLE_TRADING=false` and defaults `AUTOTRADER_PREVIEW_LIMIT=0`, so this entrypoint remains paper/no-submit by default.

## MCP tools

- `start_auto_trading_session`
- `run_auto_trading_iteration`
- `list_auto_trading_sessions`
- `get_auto_trading_session`
- `get_auto_trading_execution_gate`
- `execute_auto_trading_decision`
- `run_auto_trading_executor`

These tools persist session, decision, paper-fill, and paper-position records. They return compact decision payloads by default so autonomous agents do not ingest raw market snapshots unless explicitly requested with `compact: false`. Paper experimentation remains safe because paper mode does not call live order submission.

## live execution boundary

Before live autonomy, add:

- paper/live reconciliation reports
- explicit transition from paper decisions to preview generation
- kill switch and session pause/resume tools
- hard prohibition on live submission unless `mode` and risk config both allow it
