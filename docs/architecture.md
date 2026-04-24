# architecture

## product shape

Use four lanes:

1. **interactive lane**
   - user asks Codex to classify or analyze a market
   - skills call the MCP tools
   - Codex returns classifications, memos, strategy drafts, and order previews

2. **scheduled lane**
   - Codex app automations call `$watchlist-scan`, `$opportunity-classifier`, `$portfolio-risk-review`, `$resolution-watch`, and related skills
   - the run posts findings into Triage
   - no live market-making or heartbeat loops here

3. **always-on lane**
   - watcher daemon subscribes to market, user, and RTDS channels
   - executor daemon optionally maintains quotes, cancels stale orders, and manages heartbeat liveness
   - this lane is out-of-band from Codex app automations

4. **execution lane**
   - guarded previews and explicit submits happen only after the user or a downstream skill has already narrowed the candidate set
   - keep preview-before-submit as the default posture

5. **autonomous paper lane**
   - a session mandate converts user budget, timeframe, and risk profile into persisted constraints
   - the auto-trader planner filters the latest universe run, proposes paper orders, and records per-market next-check times
   - this lane does not submit live orders; it is the proving ground before live guarded autonomy

## recommended skill stack

```txt
watchlist-scan -> opportunity-classifier -> market-memo / deep-market-research -> strategy-draft -> order-ticket
```

Use `opportunity-classifier` as the upstream triage layer whenever the user is deciding:
- which markets are interesting enough to escalate
- which structural types are allowed or blocked
- which next skill should be used

## plugin responsibilities

### skills
Handle:
- opportunity classification and triage
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

## autonomous trading boundary

The current autonomous trader is intentionally paper-only. It can create sessions, persist decisions, allocate paper budget, and schedule follow-ups, but live order submission remains behind explicit preview and submit tools.
