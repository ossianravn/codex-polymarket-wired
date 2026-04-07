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

### write tools
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
- check warnings and policy decisions
- submit only when explicitly desired
