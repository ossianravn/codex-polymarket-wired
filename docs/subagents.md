# subagents

Project-scoped custom agents live under:

```txt
.codex/agents/
```

The repo currently defines:
- `rules_auditor`
- `catalyst_researcher`
- `microstructure_analyst`
- `related_market_mapper`
- `portfolio_correlator`

Global limits live in:

```txt
.codex/config.toml
```

## intended usage

Use these subagents only when the incremental research value is high enough to justify the extra model work.

Good cases:
- tier `A` / `B` names from `opportunity-classifier`
- ambiguous rulebooks
- complex linked-market clusters
- execution-sensitive names where spread and depth matter
- new ideas that may overlap existing positions

## parent-agent pattern

Keep the parent thread responsible for:
- deciding which child agents to spawn
- reconciling disagreements
- writing the final memo / classification
- persisting the final structured artifact to SQLite

Keep child agents focused on read-heavy bounded work.
Do not rely on child agents to write directly to the database.
