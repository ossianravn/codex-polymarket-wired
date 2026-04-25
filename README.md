# codex-polymarket

`codex-polymarket` is a skill-first Codex plugin for researching Polymarket markets, classifying opportunities, tracking local state, reviewing portfolio risk, and preparing guarded trades.

This repository contains a working MCP server, a local SQLite state store, a strategy engine, Codex skills, watcher/executor daemons, and automation examples. The intended operating model is:

1. discover or classify markets,
2. do research and strategy work,
3. create a guarded preview,
4. submit only when explicitly intended.

It is not a blind auto-trader. The repo is built around a preview-first, stateful, auditable workflow.

## What This Repo Contains

- `.codex-plugin/plugin.json`
  The Codex plugin manifest.
- `.mcp.json`
  MCP server registration for the bundled Polymarket server.
- `skills/`
  User-facing Codex skills for watchlist scanning, classification, research, strategy, order tickets, and portfolio review.
- `servers/polymarket-mcp/`
  The MCP server and the Python trading helper used for authenticated trading actions.
- `packages/polymarket-core/`
  Shared Polymarket HTTP clients, normalization, preview handling, and runtime config loading.
- `packages/market-universe/`
  Full-universe ingestion, deterministic first-pass facets and scores, candidate profiles, and selective CLOB enrichment.
- `packages/auto-trader/`
  Autonomous trading sessions that convert budget, timeframe, and risk profile into persisted paper/live decisions, fills, marked paper positions, exits, realized paper PnL, and mode-aware live execution gates.
- `packages/policy-engine/`
  Risk-limit and execution-policy checks, including thesis-level caps.
- `packages/state-store/`
  Local SQLite source of truth for market state, research, classifications, thesis links, portfolio snapshots, previews, and orders.
- `packages/strategy-engine/`
  Read-only state-driven ranking and execution-queue generation.
- `packages/research-engine/`
  Persistence helpers for research syntheses and developments.
- `services/watcher-daemon/`
  Poll-based watcher that persists alerts into SQLite and mirrors alerts to the legacy JSON cache.
- `services/executor-daemon/`
  Stateful executor loop that syncs venue state and derives a deterministic execution queue.
- `configs/`
  Watchlist, classification, strategy, and risk policy files.
- `examples/automations/`
  Codex automation prompt templates.
- `.codex/agents/`
  Project-scoped specialist subagent definitions.
- `docs/`
  Supporting architecture and operational documentation.

## Core Capabilities

### Market reads

- search and resolve markets
- fetch normalized market snapshots
- inspect live orderbooks
- fetch price history
- inspect recent trade flow
- inspect authenticated bookmarked markets
- inspect authenticated open orders
- inspect positions
- inspect rewards or order scoring context
- read cached watcher alerts

### Stateful research and orchestration

- persist market snapshots into SQLite
- ingest and persist full-universe discovery runs
- facet, filter, and shortlist the active market universe
- record structured developments and catalysts
- record research syntheses and evidence
- record opportunity classifications
- record thesis links between related markets
- sync website bookmarks into the local watchlist config
- inspect state summaries and per-market state
- compute portfolio and thesis-level exposure summaries
- derive ranked strategy candidates and execution queues from persisted state

### Guarded trading

- preview limit orders
- preview marketable orders
- persist previews
- submit only from a preview
- persist submitted orders
- cancel specific orders, market orders, or all orders

## Full-universe bet discovery

Use `$bet-discovery` or the MCP universe tools to ingest the full active Polymarket universe, compute deterministic facets and triage scores, and shortlist markets for deeper classification and research.

Typical flow:

1. `ingest_market_universe`
2. `get_universe_facets`
3. `list_market_universe`, `get_bet_candidates`, or `get_universe_event_clusters`
4. `$opportunity-classifier`
5. `$deep-market-research`
6. `$strategy-draft`
7. `$order-ticket`

Universe discovery is read-only. It does not place or preview trades.

`get_universe_event_clusters` is for many-participant setups such as elections, tournaments, Eurovision, awards, and other events with many related markets. Its `outsider-convexity` profile looks for clusters with multiple cheap, tradeable outsider markets that can re-rate sharply if a participant over-performs.

## Autonomous paper trading

Use `autotrader:once` or the MCP auto-trading tools to start a trading session from a budget, timeframe, and risk profile. The planner filters the latest persisted universe run by end date, liquidity, spread, ambiguity, and risk posture, then records proposed actions, idempotent paper fills in paper mode, marked paper positions, exit decisions, realized paper PnL, and next-check times in SQLite.

```bash
npm run autotrader:once -- --budget-usdc 50 --timeframe-hours 72 --risk-profile balanced
```

Use `--json --compact` for short agent-facing dry-run output.

Use `autotrader:simulate` for an offline synthetic replay that runs multiple paper-planning ticks, simulates fills, and reports marked paper PnL.

```bash
npm run autotrader:simulate -- --budget-usdc 50 --timeframe-hours 24 --risk-profile balanced
```

For custom flags in this Windows development environment, prefer:

```bash
node --import tsx ./scripts/autotrader-simulation.ts --budget-usdc 50 --timeframe-hours 24 --risk-profile balanced --ticks 4 --tick-minutes 360
```

This is paper-only. It does not call live order submission.

For live modes, decisions become mode-aware:

- `live_guarded` emits live decisions that can be converted into guarded previews, but the execution gate reports that explicit approval is required after preview.
- `live_autonomous` emits live decisions that are eligible for autonomous submission only after the standard preview and policy checks pass.
- `paper` decisions are blocked from live execution by the execution gate.

Use `execute_auto_trading_decision` to apply that mode behavior to a stored decision. It creates the guarded preview, records execution audit state on the decision, stops at `awaiting_approval` for `live_guarded`, and only submits in `live_autonomous` when preview policy, trading config, and credentials all pass.

Use `run_auto_trading_executor` to process pending live-mode decisions in batches. It supports `dry_run` for eligibility checks and `auto_submit=false` for autonomous sessions that should create previews without submitting.

Use `npm run smoke:autotrader-mcp` to run a no-submit MCP smoke: seed an ending-soon universe, start a tiny `live_guarded` session, dry-run executor eligibility, create one guarded preview, and assert that zero orders were submitted.

Use `npm run autotrader:heartbeat` for the recurring no-submit runner. It resumes an active named `live_guarded` session when available, otherwise starts a new 24-hour aggressive mandate, refreshes the composite universe, runs one planning iteration, dry-runs executor eligibility, creates at most one guarded preview, and asserts zero submitted orders.

Heartbeat automations can configure the mandate through environment variables such as `AUTOTRADER_BUDGET_USDC`, `AUTOTRADER_TIMEFRAME_HOURS`, `AUTOTRADER_RISK_PROFILE`, `AUTOTRADER_SESSION_NAME`, `AUTOTRADER_STATE_DB_PATH`, `AUTOTRADER_EXECUTOR_LIMIT`, and `AUTOTRADER_PREVIEW_LIMIT`. The runner still forces `POLYMARKET_ENABLE_TRADING=false` internally.

Each heartbeat also writes durable observation state to `state/autotrader-heartbeat.jsonl` and `state/autotrader-heartbeat-latest.json` by default. Use `AUTOTRADER_OBSERVATION_LOG_PATH` and `AUTOTRADER_LATEST_REPORT_PATH` to override those paths. The `observation.materialChanges` field is intended for scheduled reports.

## MCP Tool Surface

The bundled MCP server currently exposes:

### Read tools

- `search_markets`
- `get_market_snapshot`
- `get_orderbook`
- `get_price_history`
- `get_recent_trades`
- `get_bookmarked_markets`
- `get_open_orders`
- `get_positions`
- `get_rewards_status`
- `get_live_alerts`
- `get_state_summary`
- `get_market_state`
- `get_portfolio_risk_summary`
- `get_strategy_candidates`
- `get_execution_queue`
- `ingest_market_universe`
- `list_market_universe`
- `get_universe_facets`
- `get_bet_candidates`
- `get_universe_event_clusters`
- `get_auto_trading_session`
- `list_auto_trading_sessions`
- `get_auto_trading_execution_gate`
- `execute_auto_trading_decision`
- `run_auto_trading_executor`
- `enrich_universe_markets`

### Write tools

- `record_development`
- `record_research_synthesis`
- `record_classification`
- `record_thesis_link`
- `sync_bookmarked_markets_to_watchlist`
- `promote_universe_markets_to_watchlist`
- `start_auto_trading_session`
- `run_auto_trading_iteration`
- `preview_limit_order`
- `preview_marketable_order`
- `submit_previewed_order`
- `cancel_orders`
- `cancel_market_orders`
- `cancel_all_orders`

The schema source of truth is [`servers/polymarket-mcp/src/tool-specs.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/servers/polymarket-mcp/src/tool-specs.ts).

## Watchlists And Website Bookmarks

The watcher daemon still reads local watchlists from [`configs/watchlists.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/watchlists.yaml). That file remains the source of truth for monitoring.

There are now two ways to populate it:

- edit [`configs/watchlists.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/watchlists.yaml) directly
- call `sync_bookmarked_markets_to_watchlist` to pull the authenticated user's Polymarket website favorites into a managed watchlist group such as `bookmarks`

The read-side companion tool is `get_bookmarked_markets`, which queries the official authenticated endpoint [`GET /rewards/user/markets`](https://docs.polymarket.com/api-reference/rewards/get-user-earnings-and-markets-configuration) with `favorite_markets=true`.

Important detail: bookmark syncing is additive to the local watchlist system, not a replacement for it. If the authenticated account has zero favorited markets, the sync tool returns cleanly and leaves [`configs/watchlists.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/watchlists.yaml) unchanged.

## Architecture In Plain English

There are four main layers:

1. Skills
   Skills are the human-facing orchestration layer. They decide how to use MCP tools for watchlist scans, classification, research, strategy drafting, and portfolio review.

2. MCP server
   The MCP layer exposes live reads, state tools, and guarded trading tools to Codex.

3. State store
   SQLite is the durable memory for the repo. It keeps append-only market snapshots plus structured research, classifications, thesis links, alerts, previews, orders, and portfolio snapshots.

4. Strategy engine
   The strategy engine reads only persisted local state and produces ranked candidates plus an execution queue. It is where thesis-aware suppression and queue generation happen.

The current operating shape is:

```txt
watchlist-scan
  -> opportunity-classifier
  -> market-memo / deep-market-research
  -> strategy-draft
  -> order-ticket
  -> preview_limit_order / preview_marketable_order
  -> submit_previewed_order
```

## State Model

By default the local database lives at:

```txt
state/polymarket.sqlite
```

Override it with:

```env
POLYMARKET_STATE_DB_PATH=state/polymarket.sqlite
```

The state store persists:

- canonical market records
- append-only market snapshots
- watcher alerts
- developments and catalysts
- research runs and evidence items
- classifications
- thesis links
- portfolio snapshots and positions
- order previews
- submitted orders
- automation runs
- agent runs

This lets the repo behave like a stateful research/execution assistant instead of restarting from zero on every prompt.

## Thesis-Aware Risk Model

The repo does not treat each market in isolation.

A thesis is a shared narrative or correlated risk bucket such as:
- one election cluster,
- one macro path,
- one corporate delivery narrative,
- one cabinet formation process.

Markets can be linked to the same thesis key. The strategy engine and preview policy checks then use that to:

- cap total thesis exposure,
- cap the number of active markets per thesis,
- suppress weaker sibling opportunities,
- penalize priority as thesis exposure rises,
- block new previews when the thesis budget is already exhausted.

This matters because several individually attractive contracts can still represent the same underlying bet.

## Requirements

### Node

Use a modern Node version with built-in `node:sqlite` support. In practice, this means Node 22+.

`node:sqlite` is still experimental in current Node releases, so you should expect the standard experimental warning in local runs.

### Python

Authenticated trading paths depend on the Python helper in [`servers/polymarket-mcp/helpers/trading_helper.py`](C:/CodexApp/poly-plugin/codex-polymarket-wired/servers/polymarket-mcp/helpers/trading_helper.py).

Read-only market research works without trading credentials, but live authenticated order inspection, scoring, submission, and cancellation depend on Python plus the helper requirements.

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Create the environment file

```bash
cp .env.example .env
```

On Windows, copy the file manually if you prefer.

### 3. Install Python helper dependencies

```bash
npm run setup:python-helper
```

If `python3` is not the correct interpreter on your machine, set `POLYMARKET_PYTHON_BIN` in `.env` to the full path of a working `python.exe`.

### 4. Configure environment variables

The environment template lives at [`\.env.example`](C:/CodexApp/poly-plugin/codex-polymarket-wired/.env.example).

Important variables:

- `POLYMARKET_PRIVATE_KEY`
- `POLYMARKET_API_KEY`
- `POLYMARKET_API_SECRET`
- `POLYMARKET_API_PASSPHRASE`
- `POLYMARKET_FUNDER`
- `POLYMARKET_PROXY_ADDRESS`
- `POLYMARKET_SIGNATURE_TYPE`
- `POLYMARKET_AUTO_DERIVE_API_CREDS`
- `POLYMARKET_ENABLE_TRADING`
- `POLYMARKET_REQUIRE_PREVIEW`
- `POLYMARKET_REQUIRE_GEOBLOCK_CHECK`
- `POLYMARKET_PYTHON_BIN`
- `POLYMARKET_PY_HELPER_PATH`
- `POLYMARKET_ALERT_CACHE_PATH`
- `POLYMARKET_STATE_DB_PATH`

Optional external research provider variables:

- `TAVILY_API_KEY`
- `PERPLEXITY_API_KEY`
- `NEWSAPI_API_KEY`

Optional builder-mode variables:

- `BUILDER_API_KEY`
- `BUILDER_SECRET`
- `BUILDER_PASSPHRASE`
- `BUILDER_REMOTE_SIGNER_URL`
- `BUILDER_REMOTE_SIGNER_TOKEN`

### 5. Choose an auth mode

#### Mode A: full CLOB API credentials

Fill:

- `POLYMARKET_API_KEY`
- `POLYMARKET_API_SECRET`
- `POLYMARKET_API_PASSPHRASE`

#### Mode B: derive API credentials from a signer

Fill:

- `POLYMARKET_PRIVATE_KEY`
- `POLYMARKET_FUNDER` if needed for your account mode
- `POLYMARKET_SIGNATURE_TYPE`
- `POLYMARKET_AUTO_DERIVE_API_CREDS=true`

L2 API credentials authenticate trading requests, but order placement still requires a signer/private key to sign the order payload. Keep the private key outside model-visible prompts and never log it.

### 6. Review policy files

Review these files before live usage:

- [`configs/risk-limits.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/risk-limits.yaml)
- [`configs/classification-policies.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/classification-policies.yaml)
- [`configs/strategy-policies.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/strategy-policies.yaml)
- [`configs/watchlists.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/watchlists.yaml)

Important risk controls include:

- trading enable flag
- preview-before-submit requirement
- geoblock checks
- max single-order notional
- max per-market exposure
- max per-thesis exposure
- max markets per thesis
- max gross exposure
- max open orders
- near-resolution blocking
- blocked tags

### 7. Start the MCP server

```bash
npm run dev:mcp
```

The server speaks MCP over stdio.

## Useful Commands

### Validation

```bash
npm run typecheck
npm test
npm run smoke:mcp
```

### Watcher

```bash
npm run watcher:once
npm run dev:watcher
```

### State inspection

```bash
npm run state:summary
npm run state:queue
```

### Executor

```bash
npm run executor:once -- --json
npm run dev:executor
```

## Watcher And Executor

### Watcher daemon

The watcher is currently a polling watcher. It compares the latest live snapshot against prior persisted state, emits structured alerts, writes them to SQLite, and mirrors them into the legacy JSON alert cache for compatibility.

### Executor daemon

The executor is stateful. In dry-run mode it can:

- sync live open orders into SQLite when credentials exist
- sync live positions into portfolio snapshots when an owner address is configured
- reconcile locally known orders that are no longer on venue
- build a deterministic queue for research refresh, strategy work, preview preparation, live-order monitoring, and stale-order cleanup

With `--apply-cancels`, it can issue explicit stale-order cancellations and write the resulting lifecycle updates back into state.

## Skills And Automations

The repo is designed so that skills are the main automation surface.

Common roles:

- `watchlist-scan`
  Detect material market changes.
- `opportunity-classifier`
  Score and triage markets before deeper work.
- `market-memo`
  Write a compact single-market memo.
- `deep-market-research`
  Build a fair-value view and evidence map.
- `strategy-draft`
  Convert thesis plus market state into an execution plan.
- `portfolio-risk-review`
  Review positions, open orders, and concentration.
- `order-ticket`
  Prepare an execution-ready order plan without directly placing it.

Recommended recurring discovery chain:

```txt
watchlist-scan -> opportunity-classifier -> deep-market-research
```

For state-writing automations, prefer local project mode rather than isolated worktrees. Worktrees are good for code changes, but they fragment a local SQLite database.

## Project-Scoped Subagents

The repo includes project-scoped subagent definitions under [`\.codex/agents`](C:/CodexApp/poly-plugin/codex-polymarket-wired/.codex/agents).

Current specialists:

- `rules_auditor`
- `catalyst_researcher`
- `microstructure_analyst`
- `related_market_mapper`
- `portfolio_correlator`

Use them for bounded read-heavy work such as:

- ambiguous resolution criteria
- catalyst mapping
- microstructure-sensitive names
- related-market inconsistency checks
- overlap with existing positions

The parent thread should still own final reconciliation and persistence into SQLite.

## Safety Model

This repo is intentionally conservative by default.

- read-heavy usage works without trading credentials
- previews are separated from submits
- policy checks run before preview approval
- thesis-level limits are checked before new orders are allowed
- unattended Codex automations should stay read-heavy
- direct background execution loops are separate from Codex app automations

The intended UX is:

1. research the market,
2. classify and rank it,
3. check portfolio and thesis context,
4. create a preview,
5. inspect warnings and policy decisions,
6. submit only if you explicitly want live execution.

## What Has Been Verified In This Repo

This repo has local verification coverage for:

- TypeScript compilation
- MCP startup smoke test
- core orderbook parsing regressions
- preview helper normalization regressions
- strategy-engine queue and thesis-suppression logic
- state summary and execution queue scripts

Live Polymarket behavior depends on your configured credentials, balances, allowances, and geoblock status.

## Important Files

- [`README.md`](C:/CodexApp/poly-plugin/codex-polymarket-wired/README.md)
- [`servers/polymarket-mcp/src/server.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/servers/polymarket-mcp/src/server.ts)
- [`servers/polymarket-mcp/src/tool-specs.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/servers/polymarket-mcp/src/tool-specs.ts)
- [`packages/polymarket-core/src/index.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/packages/polymarket-core/src/index.ts)
- [`packages/policy-engine/src/index.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/packages/policy-engine/src/index.ts)
- [`packages/state-store/src/index.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/packages/state-store/src/index.ts)
- [`packages/strategy-engine/src/index.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/packages/strategy-engine/src/index.ts)
- [`services/watcher-daemon/src/index.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/services/watcher-daemon/src/index.ts)
- [`services/executor-daemon/src/index.ts`](C:/CodexApp/poly-plugin/codex-polymarket-wired/services/executor-daemon/src/index.ts)
- [`configs/risk-limits.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/risk-limits.yaml)
- [`configs/strategy-policies.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/strategy-policies.yaml)
- [`configs/classification-policies.yaml`](C:/CodexApp/poly-plugin/codex-polymarket-wired/configs/classification-policies.yaml)

## Limitations And Next Steps

This is still a prototype.

Areas you may still want to harden:

- durable audit logging beyond current SQLite records
- more explicit migration/version handling for state schema changes
- websocket-backed watcher ingestion
- stronger authenticated reconciliation and venue error handling
- builder-mode signing hardening if you use remote signing
- broader automated end-to-end coverage around live order lifecycle changes
