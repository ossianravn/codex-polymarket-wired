---
name: strategy-draft
description: turn a polymarket thesis into a practical strategy draft. use when the user wants entry ideas, exit logic, invalidation, scenario planning, passive versus aggressive execution guidance, or a trade plan that still stops short of sending orders.
---

# strategy draft

Convert a thesis into a clear execution plan without placing trades.

## workflow

1. Start from a market memo or deep research result.
2. Confirm the live market state again before drafting entries.
3. Prefer passive entries when spread and liquidity make that sensible.
4. Draft:
   - entry band
   - exit logic
   - invalidation
   - catalyst timing
   - sizing notes
5. Flag when the right action is to wait.

## output structure

# [strategy title]

## thesis
[one paragraph]

## entry plan
- preferred outcome side
- preferred entry band
- conditions for passive limits
- conditions for aggressive execution

## risk and invalidation
- what disproves the thesis
- what would force a fast exit
- what should block entry now

## exit plan
- first take-profit zone
- final exit condition
- time-based exit if relevant

## sizing notes
- keep this qualitative unless the user asks for exact size
- point to `configs/risk-limits.yaml` if present

## next catalyst
- what to watch
- when to revisit

## guardrails

- Do not submit orders in this skill.
- If the user wants an executable ticket, hand off to `order-ticket`.
