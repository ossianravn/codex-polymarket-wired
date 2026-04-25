# autonomous trading

The autonomous trading implementation is a mode-aware control plane. It turns a user mandate into persisted session state, timeframe-aware candidate filtering, paper fills, marked paper positions, live decision gates, exit decisions, realized paper PnL, and follow-up scheduling.

It does not submit live orders. Live execution remains gated behind `preview_limit_order`, `preview_marketable_order`, and `submit_previewed_order`.

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

## live execution modes

The session mode controls execution:

- `paper` records simulated entries/exits and is blocked from live execution.
- `live_guarded` produces live entry/exit decisions and a preview-ready order request, but requires explicit approval after `preview_limit_order`.
- `live_autonomous` produces live entry/exit decisions that can submit only after the same guarded preview and policy checks pass.

Use `get_auto_trading_execution_gate` with a session id and decision id to inspect the bridge from a persisted decision into `preview_limit_order` input. The gate returns blockers, whether approval is required, and whether autonomous submission is eligible after preview policy passes.

## MCP tools

- `start_auto_trading_session`
- `run_auto_trading_iteration`
- `get_auto_trading_session`
- `get_auto_trading_execution_gate`

These tools persist session, decision, paper-fill, and paper-position records. They return compact decision payloads by default so autonomous agents do not ingest raw market snapshots unless explicitly requested with `compact: false`. Paper experimentation remains safe because paper mode does not call live order submission.

## live execution boundary

Before live autonomy, add:

- paper/live reconciliation reports
- explicit transition from paper decisions to preview generation
- kill switch and session pause/resume tools
- hard prohibition on live submission unless `mode` and risk config both allow it
