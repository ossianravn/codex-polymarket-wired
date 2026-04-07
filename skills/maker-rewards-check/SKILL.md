---
name: maker-rewards-check
description: evaluate whether passive polymarket quoting looks reward-eligible or operationally sensible. use when the user wants market-making guidance, passive quote placement, spread analysis, rewards checks, or two-sided quoting ideas.
---

# maker rewards check

Use live orderbook context and rewards tools to evaluate passive quoting quality.

## workflow

1. Resolve the market and token pair.
2. Pull the live book.
3. Use `get_rewards_status` when possible.
4. Explain:
   - whether quoting looks sensible
   - whether two-sided quoting is likely needed
   - whether the spread is too thin or too wide
   - inventory risks and stale-quote risks

## output structure

# maker rewards check

## market structure
- spread
- depth
- recent trade flow

## rewards / scoring context
- current scoring signal if available
- likely conditions for better eligibility

## quote ideas
- buy-side quote zone
- sell-side quote zone
- inventory skew notes

## operational cautions
- when not to quote
- when to cancel or refresh

## guardrails

- Do not turn this into a taker-order recommendation unless the user asks.
- Emphasize stale-quote and heartbeat risks whenever passive orders are discussed.
