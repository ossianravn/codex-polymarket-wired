---
name: portfolio-risk-review
description: review polymarket positions, open orders, and concentration risk. use when the user asks what they own, where they are overexposed, which orders are stale, how correlated their book is, or what should be reduced or canceled.
---

# portfolio risk review

Use live positions and open orders to surface the clearest risks first.

## workflow

1. Pull positions with `get_positions`.
2. Pull open orders with `get_open_orders`.
3. Group exposure by:
   - market
   - theme
   - correlated event
   - near-term catalyst
4. Highlight:
   - concentration
   - duplicated thesis exposure
   - stale orders
   - near-resolution risk
   - liquidity or spread traps
5. Recommend reductions or cancellations, but do not execute them.

## output structure

# portfolio risk review

## top risks
- the 3 to 5 most important issues

## positions
- largest exposures
- correlated buckets
- near-resolution positions

## open orders
- stale or dangerous resting orders
- orders that should likely be canceled or revised

## suggested actions
- reduce
- cancel
- wait
- monitor

## guardrails

- Do not cancel orders in this skill unless the user explicitly asks.
- Keep recommendations concrete and tied to observed exposure.
