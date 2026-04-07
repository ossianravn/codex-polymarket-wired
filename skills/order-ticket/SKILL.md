---
name: order-ticket
description: turn a polymarket strategy into a guarded order plan. use when the user wants a limit order, marketable order, preview, cancel plan, or explicit trade parameters. use this skill before any live execution.
---

# order ticket

This skill is the bridge from analysis to action.

## workflow

1. Reconfirm the target market and token.
2. Check live book conditions before drafting the ticket.
3. Prefer preview tools first:
   - `preview_limit_order`
   - `preview_marketable_order`
4. Summarize:
   - exact side
   - exact token
   - price or worst-price guard
   - size / budget
   - order type
   - expiration if GTD
   - cancel / revise conditions
5. Submit only if the user explicitly instructs you to buy or sell now.

## output structure

# order ticket

## order intent
- market
- outcome token
- side
- order style

## parameters
- price or worst price
- size or budget
- tif
- expiration if any
- post-only if any

## preview result
- normalized parameters
- policy warnings
- blocking issues
- slippage / tick-size notes

## cancel or revise plan
- when to cancel
- when to move the order
- what new evidence would invalidate the ticket

## guardrails

- Never call `submit_previewed_order` unless the user explicitly asks to execute now.
- If preview returns blocking warnings, stop and explain them.
- Use `cancel_orders`, `cancel_market_orders`, or `cancel_all_orders` only when the user clearly requests cancellation.
