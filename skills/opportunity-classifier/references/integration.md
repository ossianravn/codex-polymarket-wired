# Integration with the existing Polymarket plugin

This skill should sit **upstream** of the current skill stack.

## Recommended role in the stack

```txt
opportunity-classifier
  -> market-memo
  -> deep-market-research
  -> strategy-draft
  -> order-ticket
```

## Why this placement works

Your current plugin already has a good separation:
- `market-memo` for compact analysis
- `deep-market-research` for fair-value and evidence work
- `strategy-draft` for entry / exit planning
- `order-ticket` for guarded execution

The missing piece is **triage**:
- what kind of market is this?
- should it be blocked, ignored, watched, researched, or traded?
- which downstream skill should be used next?

That is what `opportunity-classifier` should own.

## Existing MCP tools it should use

### discovery
- `search_markets` for candidate discovery and watchlist expansion

### normalized snapshot
- `get_market_snapshot` for identifiers, title, category, tags, price, spread, liquidity, resolution text, comments summary, and related markets

### tradability checks
- `get_orderbook` for full depth, tick size, and slippage simulation
- `get_recent_trades` for actual flow and stale-book detection

### volatility and catalyst context
- `get_price_history` for realized volatility and pre/post-catalyst price behavior

## How it should interact with existing skills

### with `watchlist-scan`
Use `watchlist-scan` for threshold-based detection.
Use `opportunity-classifier` to decide whether the changed market is:
- just noise
- worth a memo
- worth deep research
- worth a strategy refresh

### with `portfolio-risk-review`
Reuse the classification taxonomy to bucket exposure by:
- category
- structural type
- horizon
- catalyst window
- resolution risk

This makes concentration and duplicated-thesis risk easier to see.

### with `deep-market-research`
Only hand off markets that are both interesting and researchable.
The classifier should explain **why** a market deserves a full fair-value pass.

### with `strategy-draft`
Only hand off when there is:
- a fair-value view or a strong prior
- acceptable tradability
- no major resolution red flag

## Recommended new config file

Add:

```txt
configs/classification-policies.yaml
```

Use it for:
- blocked categories or tags
- allowed structural types
- target notional for slippage simulation
- minimum modelability / tradability thresholds
- minimum edge-after-fees thresholds
- tiering overrides by category

## Recommended automation pattern

A strong v1 automation is:

```txt
watchlist-scan -> opportunity-classifier -> deep-market-research (only for A/B names)
```

That keeps automation read-heavy and aligned with your current preview-first safety model.

## Suggested future MCP upgrade

Do **not** start by building a custom MCP classification tool.

First version:
- keep classification in the skill layer
- use existing MCP read tools
- stabilize taxonomy, scores, and reason codes

Later, if you want scale, add one batch helper tool such as:
- `classify_market_batch_inputs`
- or `compute_market_metrics`

That helper should only compute raw features like depth, slippage, realized vol, and grouped-basket sums. The final judgment should still stay in the skill.
