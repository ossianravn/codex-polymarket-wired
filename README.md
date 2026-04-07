# codex-polymarket

A **skill-first Codex plugin prototype** for Polymarket watchlist triage, market classification, research, analysis, guarded trade previews, and scheduled automation.

This repo now includes a working MCP server prototype rather than only a scaffold. Public reads are implemented in TypeScript with direct HTTP calls to Polymarket's public APIs. Authenticated trading is bridged through a small Python helper that uses Polymarket's official Python CLOB client.

## What is included

- `.codex-plugin/plugin.json` — plugin manifest
- `.mcp.json` — MCP server registration for the bundled Polymarket MCP server
- `skills/` — reusable Codex skills for opportunity classification, research, strategy, order tickets, risk review, and automations
- `servers/polymarket-mcp/` — working MCP server, tool schemas, and Python trading helper
- `packages/polymarket-core/` — shared API wrappers, normalization, preview storage, and helper utilities
- `packages/policy-engine/` — risk limit loading and trade-policy evaluation
- `services/` — watcher/executor scaffolding for later always-on automation
- `configs/` — watchlist, classification, risk-limit, and strategy-policy templates
- `examples/automations/` — prompt files to paste into the Codex app automation UI
- `docs/` — architecture notes, MCP tool summary, automation guidance, and relevant Polymarket repos

## What works now

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

### Write tools

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
3. Review policy warnings, balance checks, tick-size normalization, and execution notes.
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

### Watcher / executor split
Use scheduled Codex app automations for recurring opportunity triage, research, and monitoring.
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

### 4. Review policy limits

Edit:
- `configs/risk-limits.yaml`
- `configs/watchlists.yaml`
- `configs/classification-policies.yaml`
- `configs/strategy-policies.yaml`

The policy engine currently checks:
- trading enable flag
- geoblock requirement flag
- max single-order notional
- max per-market exposure
- max gross exposure
- max open-order count
- markets nearing resolution
- blocked tags

`configs/classification-policies.yaml` is read by the `opportunity-classifier` skill and automation prompts. It is advisory at the skill layer and is not yet enforced by the TypeScript policy engine.

The opportunity-classifier policy file adds:
- allowed or blocked structural types
- score thresholds for modelability, tradability, and ambiguity
- handoff defaults for memo, research, strategy, or execution

### 5. Start the MCP server locally

```bash
npm run dev:mcp
```

The server speaks MCP over stdio.

### 6. Run the startup smoke test

```bash
npm run smoke:mcp
```

## MCP implementation notes

### Public read path

The server fetches public Polymarket data directly in TypeScript from:
- Gamma API
- Data API
- public CLOB read endpoints

### Authenticated write path

The server calls `servers/polymarket-mcp/helpers/trading_helper.py` for:
- authenticated open-order inspection
- balance/allowance inspection
- order-scoring checks
- order submission
- order cancellations

This helper is intentionally thin and can be replaced later if you move to a pure TypeScript trading stack.

## Codex automations

The plugin is designed so **skills are the automation surface**.

Use the examples in `examples/automations/` for:
- opportunity triage
- watchlist scans
- catalyst drift checks
- portfolio risk reviews
- resolution watch
- strategy refreshes

Recommended v1 stance:
- keep app automations read-heavy
- use `opportunity-classifier` upstream of `deep-market-research` and `strategy-draft`
- use them for triage and research
- prefer `watchlist-scan -> opportunity-classifier -> deep-market-research` for unattended workflows
- keep `POLYMARKET_ENABLE_TRADING=false` for unattended runs
- reserve real-time execution for a separate daemon with hard controls

## Important safety notes

This is still a prototype.

Before using it live, add or harden:
- durable audit logging
- idempotency / replay protection
- persistent preview storage
- full allowance and funder-account validation
- websocket-backed alert caching
- stronger compliance / category blocking
- failure-tested cancel and kill-switch paths

## Useful files

- `skills/opportunity-classifier/` — upstream classification, segmentation, and triage skill
- `configs/classification-policies.yaml` — score thresholds, hard filters, and handoff defaults for the classifier
- `servers/polymarket-mcp/src/server.ts` — MCP server implementation
- `servers/polymarket-mcp/helpers/trading_helper.py` — Python trading bridge
- `packages/polymarket-core/src/index.ts` — shared Polymarket helpers
- `packages/policy-engine/src/index.ts` — risk and policy checks
- `servers/polymarket-mcp/src/tool-specs.ts` — input schema summary
- `examples/automations/` — app automation prompt templates including opportunity triage

A good read-heavy automation chain is:
`watchlist-scan -> opportunity-classifier -> deep-market-research` for A/B names only.

## Next improvements

Good next steps after this prototype:
1. persist previews in SQLite or Postgres
2. add watcher-daemon websocket ingestion and alert cache writing
3. add structured audit logs for every preview, submit, and cancel
4. add builder-mode remote signing support
5. replace the Python bridge with a pure TypeScript trading path if desired
6. add a batch metrics helper for opportunity classification once the taxonomy stabilizes
