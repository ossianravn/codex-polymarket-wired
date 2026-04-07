---
name: market-memo
description: write a structured memo for a polymarket market or event. use when the user asks to analyze a single market, summarize current odds, liquidity, spread, recent flow, resolution mechanics, or prepare a trade brief before acting.
---

# market memo

Use Polymarket MCP tools to build a compact but decision-useful memo.

## workflow

1. Resolve the market with `search_markets` or `get_market_snapshot`.
2. Pull the current state:
   - snapshot
   - orderbook summary
   - recent trades
   - recent price history
   - comments if available
3. Separate **observations** from **inferences**.
4. Explain the resolution path and any ambiguity that could matter.
5. End with execution considerations, not an order.

## output structure

Use this default structure:

# [market title]

## current state
- implied probability
- best bid / ask
- spread
- liquidity / volume notes
- recent price movement

## resolution and mechanics
- who resolves it
- what counts as a win
- what could cause ambiguity

## bull case
- strongest evidence for higher probability

## bear case
- strongest evidence for lower probability

## market structure notes
- orderbook shape
- flow
- comment or sentiment notes
- related markets worth checking

## execution considerations
- passive entry zone if any
- slippage concerns
- reasons to wait

## guardrails

- Do not place trades in this skill.
- If the user wants a fair-value estimate or strategy, hand off to `strategy-draft`.
- If the user wants an executable plan, hand off to `order-ticket`.
