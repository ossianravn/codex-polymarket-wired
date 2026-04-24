# opportunity classifier integration

## purpose

`opportunity-classifier` is the upstream triage layer for the Polymarket plugin.

Use it to decide:
- what kind of market this is
- whether the structure is allowed or blocked
- whether the market is worth a memo, deep research, or a strategy draft
- which changed watchlist names deserve more attention

It does **not** place trades.

## recommended workflow

```txt
watchlist-scan -> opportunity-classifier -> deep-market-research -> strategy-draft -> order-ticket
```

Universe-discovery handoff:

```txt
bet-discovery -> opportunity-classifier -> deep-market-research -> strategy-draft -> order-ticket
```

For a single market:

```txt
opportunity-classifier -> market-memo or deep-market-research -> strategy-draft -> order-ticket
```

## why the classifier sits upstream

The existing stack already handles:
- compact single-market analysis
- deeper fair-value work
- strategy planning
- guarded order previews

The missing step was triage:
- which market structures are usable
- which markets are too ambiguous to bother with
- which names are interesting enough to escalate
- which downstream skill should be used next

## what it uses

The classifier intentionally reuses the existing MCP read tools:
- `search_markets`
- `get_market_snapshot`
- `get_orderbook`
- `get_recent_trades`
- `get_price_history`

No new MCP classification tool is required in v1.

## config

The classifier reads:

```txt
configs/classification-policies.yaml
```

This file is for skill and automation behavior. It is **not** currently enforced by the TypeScript `policy-engine` package.

Use it for:
- blocked structural types or tags
- target notional for slippage checks
- minimum modelability and tradability thresholds
- edge-after-fees requirements
- handoff defaults

## recommended automation

A strong default automation is:

```txt
watchlist-scan -> opportunity-classifier -> deep-market-research (A/B only)
```

That keeps recurring runs read-heavy and aligned with the preview-first execution model.

## future upgrade path

If the taxonomy proves useful at scale, add a small MCP helper that computes raw features in batch, such as:
- spread and depth summaries
- slippage at target notionals
- realized volatility windows
- grouped-basket probability sums

Keep the final judgment and tiering in the skill layer even if you later add that helper.

## universe handoff

Universe discovery computes deterministic first-pass facets and triage scores. The `opportunity-classifier` skill should refine only shortlisted candidates, not classify every market in the universe.
