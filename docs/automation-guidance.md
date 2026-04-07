# automation guidance

## what belongs in codex app automations

Good automation tasks:
- watchlist scans
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

## suggested cadences

- watchlist scan: every 15 to 30 minutes
- catalyst drift: every 1 to 4 hours
- portfolio risk review: every 2 to 6 hours
- resolution watch: every 15 minutes for near-resolution markets
- strategy refresh: daily

## sandbox note

Any automation that depends on live Polymarket calls through the MCP layer may need a mode that permits networked tool use. Review Codex sandbox settings carefully before enabling unattended runs.
