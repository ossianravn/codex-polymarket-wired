# follow-up roadmap

These items are intentionally left explicit rather than buried in code comments:

- CLOB batch microstructure enrichment using `/books`, `/midpoints`, `/spreads`, and `/prices` for up to 500 tokens per request.
- True cross-market dislocation math for mutually exclusive clusters, neg-risk groups, and related threshold markets.
- Full realized and unrealized PnL tracking to back `max_daily_loss_usdc` with real enforcement.
- Optional migration to a current CLOB client v2 path if older helpers remain in use.
- Universe run retention cleanup helpers and scheduled cleanup.
- Websocket-powered freshness for top candidate markets.
