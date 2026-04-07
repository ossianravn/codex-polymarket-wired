# mcp tool schemas

The source of truth for exact MCP input schemas in this scaffold is:

- `servers/polymarket-mcp/src/tool-specs.ts`

## tool summary

### read tools
- `search_markets`
- `get_market_snapshot`
- `get_orderbook`
- `get_price_history`
- `get_recent_trades`
- `get_open_orders`
- `get_positions`
- `get_rewards_status`
- `get_live_alerts`
- `get_state_summary`
- `get_market_state`
- `get_portfolio_risk_summary`
- `get_strategy_candidates`
- `get_execution_queue`

### write tools
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

## safety model

Execution is intentionally split into:
1. a preview phase
2. a submit phase

The intended UX is:
- research the market
- build a strategy
- create an order preview
- check warnings, policy decisions, and thesis-level exposure constraints
- submit only when explicitly desired

## thesis-aware state tools

The local-state tools are meant to expose more than just raw market metadata.
They let an orchestrator inspect:
- recent research and classifications for one market
- linked thesis records across markets
- current portfolio exposure and active-order notional
- strategy candidates and execution queue items derived from persisted state

The most important state-aware tools are:
- `get_market_state`
- `get_portfolio_risk_summary`
- `get_strategy_candidates`
- `get_execution_queue`
