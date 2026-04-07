# post-resolution backfill

Suggested cadence: every 4 hours  
Suggested project mode: local project

Use `get_live_alerts`, `get_state_summary`, and `get_market_state` to identify markets that recently resolved or are no longer active.

For each candidate:
- summarize the final outcome and official evidence source
- note whether the prior classification or research thesis was directionally right or wrong
- record the decisive development with `record_development`

Only include markets where the final outcome is now clear.
Do not place or cancel trades.
