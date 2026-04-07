---
name: order-ticket
description: turn a polymarket strategy into a guarded order plan. use when the user wants a limit order, marketable order, preview, cancel plan, or explicit trade parameters. use this skill before any live execution.
---

# order ticket

Use this skill to answer one question:

`given a real strategy, what exact guarded order plan should be previewed or executed?`

This skill is the bridge from strategy to action:
- downstream of `strategy-draft`
- downstream of any user instruction to trade now
- immediately upstream of preview and submit tools

It should produce an exact, policy-aware ticket. It must not improvise the thesis.

## default mode

- Default to **ticket mode**.
- In ticket mode, optimize for exact parameters, preview discipline, blocking-policy clarity, and cancel-or-revise logic.
- Do not redo upstream research unless a blocking issue forces a handoff.

## what this skill is for

Use this skill when the user is effectively asking:
- draft the exact order
- preview this limit or marketable order
- tell me what parameters should be used
- build a cancel or revise plan
- execute now

Use this skill for:
- exact limit-order or marketable-order planning
- preview-first workflows
- live execution only after explicit user authorization
- cancel or revise logic tied to a concrete ticket

Do **not** use this skill to:
- invent the thesis or fair value from scratch
- skip preview when preview is available and relevant
- submit or cancel anything without explicit user instruction
- hide blocking warnings

## minimum viable input checklist

Do not finalize a ticket until you have, or explicitly mark as missing:
- target market and outcome token
- side
- intended order style
- price or worst-price guard
- size or budget
- current live book context
- at least one cancel or revise condition

For live submission, also confirm:
- the user explicitly wants execution now
- preview has been attempted when required
- blocking policy warnings are cleared or consciously accepted

## outside-in frame

Before building the ticket, inspect the plan from these lenses:
- **thesis lens:** is there a real upstream reason for this trade?
- **microstructure lens:** do current book conditions justify the chosen order style?
- **policy lens:** will preview, balances, allowances, or risk limits block this?
- **failure lens:** what should cause cancellation, revision, or non-submission?
- **workflow lens:** is the ticket actually ready, or should it return to strategy first?

If the workflow lens says the edge, timing, or invalidation logic is still unclear, hand back to `strategy-draft`.

## dependency and handoff rules

Use the minimum live set needed:
- `get_market_snapshot`
- `get_orderbook` when spread, depth, or slippage matters
- `preview_limit_order` for passive tickets
- `preview_marketable_order` for aggressive tickets

Only use:
- `submit_previewed_order`
- `cancel_orders`
- `cancel_market_orders`
- `cancel_all_orders`

when the user explicitly instructs the live action.

If the main missing piece is:
- thesis quality or fair-value basis -> `deep-market-research` or `actuarial-forecasting`
- entry and exit framing -> `strategy-draft`
- compact current-state read -> `market-memo`

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- what exact order action is requested
- whether the user wants planning only, preview, or live execution

### 2. Reconfirm the live market setup

Before drafting parameters, refresh:
- target market and outcome token
- current book conditions
- whether passive or aggressive execution still makes sense

Do not reuse stale parameters from earlier in the thread without checking the market again.

### 3. Build the exact ticket

Specify:
- side
- token
- price or worst price
- size or budget
- time-in-force
- expiration if GTD
- post-only if relevant

The ticket should be exact enough to preview.

### 4. Preview before execution when relevant

Prefer:
- `preview_limit_order` for passive tickets
- `preview_marketable_order` for aggressive tickets

Summarize:
- normalized parameters
- policy warnings
- blocking issues
- slippage or tick-size notes

If preview returns a block, stop and explain it.

### 5. Define cancel or revise logic

At minimum, state:
- when to cancel
- when to move the order
- what evidence invalidates the ticket
- when the ticket should expire without action

### 6. Execute only on explicit instruction

Call `submit_previewed_order` only when the user explicitly wants the live order placed now.

## hard rules

- Never call `submit_previewed_order` unless the user explicitly asks to execute now.
- Use cancellation tools only when the user clearly requests cancellation.
- If preview returns blocking warnings, stop and explain them.
- Do not hide policy, balance, allowance, or risk-limit problems.
- Do not invent the thesis inside this skill.
- Do not skip live book checks when order style depends on current conditions.

## output contract

Return exactly these sections in this order.

# order ticket

## order intent
State:
- market
- outcome token
- side
- whether this is planning only, preview, or live execution

## parameters
List:
- price or worst price
- size or budget
- order style
- time-in-force
- expiration if any
- post-only if any

## preview result
List:
- normalized parameters
- policy warnings
- blocking issues
- slippage or tick-size notes

If no preview was run, say why.

## cancel or revise plan
List:
- when to cancel
- when to move the order
- what invalidates the ticket
- when the plan should be reconsidered

## next handoff
Choose one:
- remain in `order-ticket`
- hand off to `market-memo`
- hand off to `deep-market-research`
- hand off to `actuarial-forecasting`
- hand off to `strategy-draft`

Explain why that is the cheapest useful next step.

## completion criteria

The ticket is complete only when:
- exact parameters are present
- live market conditions were refreshed
- preview results are included or their absence is explained
- cancel or revise logic is explicit
- any blocking issue is surfaced clearly
- no live action occurs without explicit user instruction

## common failure modes

- drafting a ticket with stale book assumptions
- skipping preview even though it is the right safety step
- hiding or soft-pedaling blocking warnings
- inventing strategy inside the ticket
- placing or canceling orders without explicit authorization

## activation tests

### Should trigger

- "build the exact order ticket."
- "preview this bid."
- "give me the precise trade parameters."
- "submit this order now."
- "what is the cancel plan for this resting order?"

### Should not trigger

- "is this market worth researching?"
- "what is the fair probability?"
- "give me a memo on this market."
- "draft a trading strategy but do not build the ticket."
- "review my portfolio risk."

## resource map

- `market-memo` — use when the live-state read is still incomplete
- `deep-market-research` — use when the thesis or fair-value basis is still weak
- `strategy-draft` — use when the user still needs entry, invalidation, or exit framing before parameterizing the order
