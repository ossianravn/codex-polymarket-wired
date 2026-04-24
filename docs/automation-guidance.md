# automation guidance

## what belongs in codex app automations

Good automation tasks:
- watchlist scans
- universe discovery and candidate triage
- opportunity triage
- catalyst drift checks
- resolution watch
- portfolio and open-order reviews
- strategy refreshes
- memo generation

Avoid in the Codex app:
- heartbeat loops
- quote maintenance
- continuous websocket processing
- unattended entry/exit logic that opens positions

## recommended stance

- test every automation prompt manually first
- keep runs read-heavy
- prefer worktrees for git repos
- keep execution disabled for unattended runs in v1
- prefer `watchlist-scan -> opportunity-classifier -> deep-market-research` for recurring discovery
- prefer `$bet-discovery` for full-universe browsing and shortlist generation before deeper research
- keep Codex automations in analyst/triage mode rather than continuous trading or order-maintenance loops

## suggested cadences

- watchlist scan: every 15 to 30 minutes
- opportunity triage: every 30 to 60 minutes or immediately after each watchlist scan
- catalyst drift: every 1 to 4 hours
- portfolio risk review: every 2 to 6 hours
- resolution watch: every 15 minutes for near-resolution markets
- strategy refresh: daily

## sandbox note

Any automation that depends on live Polymarket calls through the MCP layer may need a mode that permits networked tool use. Review Codex sandbox settings carefully before enabling unattended runs.
