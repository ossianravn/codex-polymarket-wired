# codex-polymarket

A **skill-first Codex plugin prototype** for Polymarket watchlist triage, market classification, research, analysis, guarded trade previews, and scheduled automation.

This repo now includes a working MCP server prototype rather than only a scaffold. Public reads are implemented in TypeScript with direct HTTP calls to Polymarket's public APIs. Authenticated trading is bridged through a small Python helper that uses Polymarket's official Python CLOB client.

## What is included

- `.codex-plugin/plugin.json` — plugin manifest
- `.mcp.json` — MCP server registration for the bundled Polymarket MCP server
- `skills/` — reusable Codex skills for opportunity classification, research, strategy, order tickets, risk review, and automations
- `servers/polymarket-mcp/` — working MCP server, tool schemas, and Python trading helper
- `packages/polymarket-core/` — shared API wrappers, normalization, preview storage, and helper utilities
- `packages/policy-engine/` — risk limit loading and trade-policy evaluation, including thesis-level caps
- `packages/state-store/` — local SQLite source of truth for markets, alerts, research, classifications, thesis links, portfolio snapshots, previews, and orders
- `packages/strategy-engine/` — state-driven strategy candidate ranking, thesis-aware suppression, and execution queue generation
- `services/` — watcher/executor services, including a poll-based watcher and a stateful executor that consume SQLite directly
- `configs/` — watchlist, classification, risk-limit, and strategy-policy templates
- `examples/automations/` — prompt files to paste into the Codex app automation UI
- `.codex/agents/` — project-scoped subagents for rules, catalysts, microstructure, linked-market mapping, and portfolio overlap
- `docs/` — architecture notes, MCP tool summary, automation guidance, and relevant Polymarket repos

## What works now

The repo now has a durable local state layer. Live reads, watcher scans, research runs, classifications, thesis links, portfolio snapshots, previews, and submitted orders can all land in the same SQLite database.

### Read tools

- `search_markets`
- `get_market_snapshot`
- `get_orderbook`
- `get_price_history`
- `get_recent_trades`
- `get_open_orders` *(requires auth)*
- `get_positions`
- `get_rewards_status`
- `get_live_alerts`
- `get_state_summary`
- `get_market_state`
- `get_portfolio_risk_summary`
- `get_strategy_candidates`
- `get_execution_queue`

### Write tools

- `record_development`
- `record_research_synthesis`
- `record_classification`
- `record_thesis_link`
- `preview_limit_order`
- `preview_marketable_order`
- `submit_previewed_order`
- `cancel_orders`
- `cancel_market_orders`
- `cancel_all_orders`

## Execution model

This repo is intentionally **preview-first**.

1. Use a skill or direct MCP call to analyze the market.
2. Generate a preview with `preview_limit_order` or `preview_marketable_order`.
3. Review policy warnings, balance checks, tick-size normalization, thesis exposure checks, and execution notes.
4. Submit only with `submit_previewed_order`.

This keeps the default UX aligned with "think, show, then act" rather than one-shot trading.

A good upstream skill stack is:

```txt
watchlist-scan -> opportunity-classifier -> market-memo / deep-market-research -> strategy-draft -> order-ticket
```

## Architecture

### Skills
Use Codex skills for:
- opportunity classification and watchlist triage
- market memos
- deep market research
- strategy drafts
- order tickets
- portfolio risk review
- watchlist scans
- resolution watch
- maker rewards review

Suggested stack:
`opportunity-classifier -> market-memo / deep-market-research -> strategy-draft -> order-ticket`

### MCP server
Use the MCP layer for:
- live Polymarket reads
- previewable execution
- cancellation tools
- cached watcher alerts
- persisted local state summaries
- thesis and portfolio risk inspection

### Watcher / executor split
Use scheduled Codex app automations for recurring opportunity triage, research, and monitoring.
The watcher daemon now has a poll-based implementation that persists alert state into SQLite and mirrors it into the legacy JSON cache for compatibility.
The executor daemon now consumes persisted classifications, research runs, thesis links, portfolio snapshots, previews, and orders directly from SQLite, syncs live open orders and positions back into the local state store when credentials are available, and produces a deterministic execution queue.
Use the watcher/executor services later for anything truly real-time such as websocket ingestion, quote maintenance, or heartbeat-based safety loops.

### Recommended skill flow
Use the new upstream triage layer like this:
- `opportunity-classifier` -> `market-memo` for quick summaries
- `opportunity-classifier` -> `deep-market-research` for A/B names that need fair-value work
- `strategy-draft` only after research or when a prior already exists
- `order-ticket` only for guarded execution after strategy work

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install the Python trading helper dependencies

```bash
npm run setup:python-helper
```

This installs the packages listed in `servers/polymarket-mcp/helpers/requirements.txt`.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then fill in the values you need.

For read-only research, you can leave trading credentials blank.
For live authenticated trading, set at least one of these modes:

#### Mode A: full CLOB API credentials already available
- `POLYMARKET_API_KEY`
- `POLYMARKET_API_SECRET`
- `POLYMARKET_API_PASSPHRASE`

#### Mode B: derive API credentials from a signer
- `POLYMARKET_PRIVATE_KEY`
- optionally `POLYMARKET_FUNDER`
- keep `POLYMARKET_AUTO_DERIVE_API_CREDS=true`

You must also explicitly opt into writes:

```env
POLYMARKET_ENABLE_TRADING=true
```

### 4. Review policy limits and state path

Edit:
- `configs/risk-limits.yaml`
- `configs/watchlists.yaml`
- `configs/classification-policies.yaml`
- `configs/strategy-policies.yaml`

The default local SQLite database path is:

```env
POLYMARKET_STATE_DB_PATH=state/polymarket.sqlite
```

The policy engine currently checks:
- trading enable flag
- geoblock requirement flag
- max single-order notional
- max per-market exposure
- max per-thesis exposure
- max markets per thesis
- max gross exposure
- max open-order count
- markets nearing resolution
- blocked tags

`configs/classification-policies.yaml` is read by the `opportunity-classifier` skill and automation prompts. It is advisory at the skill layer and is not yet enforced by the TypeScript policy engine.

The opportunity-classifier policy file adds:
- allowed or blocked structural types
- score thresholds for modelability, tradability, and ambiguity
- handoff defaults for memo, research, strategy, or execution

`configs/strategy-policies.yaml` now also controls:
- max thesis exposure for new entries
- max markets per thesis
- whether lower-ranked same-thesis entries are suppressed
- whether active same-thesis orders should block fresh entries
- the penalty applied to priority scores as thesis exposure grows

### 5. Start the MCP server locally

```bash
npm run dev:mcp
```

The server speaks MCP over stdio.

### 6. Optionally run the watcher once

```bash
npm run watcher:once
```

### 7. Inspect the local state summary

```bash
npm run state:summary
```

### 8. Inspect thesis and portfolio risk

```bash
npm run state:summary
```

Or via MCP:
- `get_market_state`
- `get_portfolio_risk_summary`

### 9. Inspect the derived execution queue

```bash
npm run state:queue
```

### 10. Run the executor once in dry-run mode

```bash
npm run executor:once -- --json
```

### 11. Run the startup smoke test

```bash
npm run smoke:mcp
```
