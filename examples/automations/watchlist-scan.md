# watchlist scan

Suggested cadence: every 30 minutes  
Suggested project mode: worktree  
Suggested sandbox: the minimum mode that still allows your live Polymarket MCP calls to work

$watchlist-scan

Read `configs/watchlists.yaml` and scan each configured market.

For each market, check:
- implied probability move versus the configured threshold
- spread widening
- unusual recent trade flow
- linked-market drift if requested
- comment or activity changes if available

Report only material changes.
If nothing crossed thresholds, keep the run minimal and archive it with no report.

Do not place trades.
Do not modify config files.
