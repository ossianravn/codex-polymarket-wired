# architecture

## product shape

Use three lanes:

1. **interactive lane**
   - user asks Codex to analyze a market
   - skills call the MCP tools
   - Codex returns memos, strategy drafts, and order previews

2. **scheduled lane**
   - Codex app automations call `$watchlist-scan`, `$portfolio-risk-review`, `$resolution-watch`, and related skills
   - the run posts findings into Triage
   - no live market-making or heartbeat loops here

3. **always-on lane**
   - watcher daemon subscribes to market, user, and RTDS channels
   - executor daemon optionally maintains quotes, cancels stale orders, and manages heartbeat liveness
   - this lane is out-of-band from Codex app automations

## plugin responsibilities

### skills
Handle:
- market analysis
- external evidence synthesis
- strategy drafting
- order ticket preparation
- watchlist and risk review workflows

### mcp server
Handle:
- live Polymarket reads
- previewable execution
- cancellation tools
- cached alert access from watcher state

### policy engine
Handle:
- geoblock checks
- exposure limits
- stale order policies
- market/asset blocklists
- preview requirement
- execution enable flag

### research engine
Handle:
- optional external search/news providers
- memo assembly helpers
- evidence normalization

## deployment modes

### personal trader mode
- use normal CLOB auth
- direct market data + manual execution
- simplest v1

### builder mode
- add builder signing
- add relayer usage for gasless wallet operations
- keep builder credentials server-side
- use when you want attribution or productization

## default safety stance

- read-only behavior is frictionless
- preview before submit
- no direct background order entry in Codex app automations
- real-time execution is a separate service
- execution enable flag defaults off
