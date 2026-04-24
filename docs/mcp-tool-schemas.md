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
- `ingest_market_universe`
- `list_market_universe`
- `get_universe_facets`
- `get_bet_candidates`
- `get_universe_event_clusters`
- `enrich_universe_markets`

### write tools
- `record_development`
- `record_research_synthesis`
- `record_classification`
- `record_thesis_link`
- `promote_universe_markets_to_watchlist`
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

## universe discovery tools

The universe flow is intentionally upstream of research and execution:

```txt
ingest_market_universe
  -> list_market_universe / get_bet_candidates / get_universe_event_clusters
  -> opportunity-classifier
  -> deep-market-research
  -> strategy-draft
  -> order-ticket
```

Example calls:

```json
{
  "tool": "ingest_market_universe",
  "args": {
    "source": "markets_keyset",
    "limit_pages": 1,
    "enrich_top_n": 0
  }
}
```

```json
{
  "tool": "list_market_universe",
  "args": {
    "view": "clean_catalyst_bets",
    "category_groups": ["politics"],
    "max_spread_cents": 3,
    "limit": 10
  }
}
```

```json
{
  "tool": "get_bet_candidates",
  "args": {
    "profile": "liquid-politics",
    "limit": 10
  }
}
```

```json
{
  "tool": "get_universe_event_clusters",
  "args": {
    "profile": "outsider-convexity",
    "min_market_count": 8,
    "min_outsider_count": 3,
    "max_outsider_price": 0.30,
    "limit": 10
  }
}
```

`get_universe_event_clusters` groups persisted universe markets by event, event slug, title pattern, or series fallback. Use it for many-participant events such as elections, tournaments, Eurovision, awards, and similar clusters where cheap outsider markets may re-rate sharply after an over-performance.

`promote_universe_markets_to_watchlist` is the only universe write tool, and it only updates `configs/watchlists.yaml`.
