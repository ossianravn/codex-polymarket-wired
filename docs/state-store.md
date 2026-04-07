# state store

This repo now includes a local SQLite state layer at:

```txt
state/polymarket.sqlite
```

Override it with:

```txt
POLYMARKET_STATE_DB_PATH
```

## what it stores

The current schema persists:
- canonical market records and append-only market snapshots
- watcher alerts
- structured developments / catalysts
- research runs and evidence items
- opportunity classifications
- thesis links between markets and shared narratives
- portfolio snapshots and per-market positions
- order previews and submitted orders
- automation and agent run metadata

## why it exists

The state store is the repo's durable memory. It lets you:
- avoid re-researching the same market from scratch
- keep a structured record of why a market was interesting
- connect multiple markets to the same underlying thesis
- compare stored fair-value work against current exposure and active orders
- keep preview, order, and position history in one place
- power read-heavy automations that build on prior work

## key tools

Read tools:
- `get_state_summary`
- `get_market_state`
- `get_portfolio_risk_summary`
- `get_live_alerts`

Write tools:
- `record_development`
- `record_research_synthesis`
- `record_classification`
- `record_thesis_link`

The order-preview flow and executor position sync also write automatically to SQLite.

## schema shape

The important persistent layers are:
- **markets** — canonical identifiers plus latest-known titles and metadata
- **market_snapshots** — append-only facts over time
- **developments / alerts** — catalysts, watcher signals, and structured changes
- **research_runs / evidence_items** — synthesized research and supporting evidence
- **classifications** — opportunity scores, disqualifiers, and tier decisions
- **market_thesis_links** — mapping from market to thesis key and confidence
- **portfolio_snapshots / portfolio_positions** — persisted venue positions by sync time
- **previews / orders** — guarded execution lineage

## design notes

- Market snapshots are append-only.
- Canonical market rows are updated as fresher identifiers arrive.
- Derived artifacts such as classifications, thesis links, and research runs are versionable records rather than mutable fields on the market row.
- Portfolio data is snapshotted so exposure history is auditable.
- Watcher alerts still mirror into the JSON cache for compatibility, but SQLite is now the primary local source of truth.

## thesis-aware usage

A thesis is intentionally modeled separately from a market.
That allows one shared narrative, such as "incumbent-party continuity" or "Fed cut path", to link multiple correlated contracts.

The strategy engine and preview policy checks read those persisted thesis links to:
- suppress lower-ranked correlated entries
- cap thesis-level exposure across multiple markets
- block new previews when the thesis-level risk budget is already exhausted

## operational guidance

For app automations that should update the shared SQLite database, prefer **local project mode** rather than a background worktree. Worktrees isolate files, which is helpful for code changes, but they fragment a local state database.

Use worktrees for code-changing automations.
Use local mode for state-writing market research automations.
