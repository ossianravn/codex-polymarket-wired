---
name: strategy-draft
description: turn a polymarket thesis into a practical strategy draft. use when the user wants entry ideas, exit logic, invalidation, scenario planning, passive versus aggressive execution guidance, or a trade plan that still stops short of sending orders. use opportunity-classifier or deep-market-research first if the market has not been screened or modeled yet.
---

# strategy draft

Use this skill to answer one question:

`given a real thesis, what is the best non-executing plan for entering, managing, and exiting this market?`

This skill sits between research and action:
- upstream of `order-ticket`
- downstream of `opportunity-classifier`, `market-memo`, `deep-market-research`, and `actuarial-forecasting`

It should produce a plan, not a preview and not a live order.

## default mode

- Default to **plan mode**.
- In plan mode, optimize for execution framing, invalidation logic, and timing discipline.
- Do not drift into a fresh research memo or a live order workflow unless the handoff rules require it.

## what this skill is for

Use this skill when the user is asking:
- where should I look to enter?
- should this be passive or aggressive?
- what would invalidate the thesis?
- when should I wait instead of trade?
- what is the best exit logic if the thesis is right?
- how should this idea be framed before building an actual order ticket?

Use this skill for:
- one market with a real thesis already in hand
- strategy refinement after deep research
- converting a fair-value view into execution bands and guardrails
- scenario-aware trade planning that still stops short of preview or submission

Do **not** use this skill to:
- invent fair value from scratch
- classify whether a market deserves research
- submit, preview, or cancel orders
- output exact execution parameters unless the user explicitly asks for a ticket-ready plan

## minimum viable input checklist

Do not finalize a strategy draft until you have, or explicitly mark as missing:
- the target market and outcome side
- a thesis or fair-value view
- current market state
- enough tradability context to discuss passive versus aggressive execution
- at least one invalidation condition
- at least one reason to wait, if waiting is plausible

Minimum upstream support should usually be one of:
- `opportunity-classifier` output
- `market-memo`
- `deep-market-research`
- `actuarial-forecasting`

If the upstream work is only qualitative and has no real probability view, hand off before drafting strategy.

## outside-in frame

Before drafting the plan, inspect the trade from these lenses:
- **edge lens:** do we have a real reason to think the market is mispriced or likely to move?
- **microstructure lens:** can we express the view passively, or does the book force aggression?
- **timing lens:** is this an "enter now" market, a "wait for a catalyst" market, or a "monitor only" market?
- **failure lens:** what would make the thesis wrong before the market settles?
- **workflow lens:** is strategy the right next step, or should this still be research, triage, or an order ticket?

If the workflow lens says "not ready", stop and route accordingly.

## dependency and handoff rules

If the main missing piece is:
- whether the market is even worth working on -> `opportunity-classifier`
- a compact read on current market state or mechanics -> `market-memo`
- fair value, evidence, or catalyst mapping -> `deep-market-research`
- explicit probability modeling, scenario weights, or numerical fair value -> `actuarial-forecasting`
- exact execution parameters or preview-safe order construction -> `order-ticket`

Use `actuarial-forecasting` when the trade idea still lacks:
- a disciplined probability estimate
- a fair-value range
- a scenario-weighted base case

If that skill is not installed locally, use the fallback at [ossianravn/actuarial-forecasting](https://github.com/ossianravn/actuarial-forecasting/blob/main/SKILL.md).

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- what market and outcome the strategy is about
- what the user wants: entry framing, wait/act decision, exit logic, or full plan
- whether the strategy should stay high-level or be almost ticket-ready

### 2. Confirm the thesis basis

Start from one of:
- a market memo
- a deep research result
- a classifier output with a credible directional view
- a probability model or fair-value view

If the thesis is still mostly narrative, stop and hand off upstream.

### 3. Refresh live market state

Before planning, confirm the live setup again with the minimum needed MCP reads:
- `get_market_snapshot`
- `get_orderbook` if entry style or slippage may matter
- `get_recent_trades` if the book may be stale or flow quality matters

Do not assume the market still looks like it did when the thesis was formed.

### 4. Decide whether the right action is trade, wait, or pass

Make an explicit call between:
- `enter now`
- `wait for better entry`
- `wait for catalyst`
- `pass for now`

Do not force an entry plan if the right answer is to wait.

### 5. Draft the execution shape

Translate the thesis into:
- preferred side
- preferred entry zone or band
- passive-versus-aggressive preference
- conditions that justify acting now
- conditions that justify waiting

Prefer passive entries when spread, depth, and catalyst timing make patience sensible.
Prefer aggressive execution only when:
- the edge is time-sensitive
- catalyst risk is imminent
- the book can support the size without unacceptable slippage

### 6. Define invalidation and exit logic

At minimum specify:
- what disproves the thesis
- what would block entry immediately
- what would force a fast exit
- what would count as first take-profit
- what would count as final exit
- whether there is a time-based exit or review point

The exit plan should be linked to the thesis, not just to a generic profit target.

### 7. Add sizing discipline without turning into an order ticket

Keep sizing qualitative unless the user explicitly asks for exact size.

Use sizing notes to discuss:
- conviction versus uncertainty
- concentration concerns
- catalyst proximity
- whether the setup deserves only starter size
- whether existing thesis exposure should limit new entry

Point to `configs/risk-limits.yaml` when relevant, but do not perform order preview here.

## hard rules

- Do not submit, preview, or cancel orders in this skill.
- Do not invent fair value when the edge has not been modeled.
- Do not output exact execution parameters unless the user explicitly wants a ticket-ready plan.
- Do not recommend aggression just because the thesis is strong; aggression must be justified by time sensitivity and book conditions.
- Do not confuse "interesting market" with "good setup right now".
- Do not omit invalidation. A strategy without a failure condition is incomplete.
- Do not ignore waiting as a valid recommendation.

## output contract

Return exactly these sections in this order.

# [strategy title]

## intent
State in 1-2 sentences:
- what the strategy is trying to do
- whether the current recommendation is enter, wait, or pass

## thesis basis
Summarize:
- the directional view
- the fair-value or research basis supporting it
- the single biggest assumption

## market setup
List:
- current implied probability
- best bid / ask or spread context
- liquidity or flow note
- whether the setup favors passive or aggressive execution

## entry plan
List:
- preferred side
- preferred entry band
- what must be true to enter now
- what should make you wait
- whether passive limits or aggressive execution are preferred

## risk and invalidation
List:
- what disproves the thesis
- what blocks entry now
- what would trigger a fast exit
- the most important unresolved uncertainty

## exit plan
List:
- first take-profit zone
- final exit condition
- time-based review or expiry condition if relevant

## sizing notes
Keep this qualitative by default:
- starter versus full-size logic
- concentration warnings
- catalyst-driven size adjustments
- references to local risk policy when relevant

## next catalyst
List:
- what to watch
- when the setup should be revisited
- what evidence would most improve or damage the trade

## next handoff
Choose one:
- remain in strategy-draft
- hand off to `order-ticket`
- hand off upstream to `opportunity-classifier`, `market-memo`, `deep-market-research`, or `actuarial-forecasting`

Explain why that is the cheapest useful next step.

## completion criteria

The strategy draft is complete only when:
- the thesis basis is explicit
- the current recommendation is clearly enter, wait, or pass
- entry logic is distinct from exit logic
- invalidation is concrete
- passive versus aggressive preference is justified from market conditions
- the user could decide whether to advance to `order-ticket`
- no live order action is taken

## common failure modes

- rewriting the memo instead of drafting strategy
- pretending a thesis exists when the edge was never modeled
- giving a generic "buy dips, sell rips" plan with no invalidation
- skipping the possibility that the right move is to wait
- turning strategy-draft into order-ticket prematurely
- giving sizing language that ignores existing exposure or uncertainty

## activation tests

### Should trigger

- "turn this thesis into a trade plan."
- "where would you want to enter this market?"
- "should this be passive or aggressive?"
- "what would invalidate the trade?"
- "draft an exit plan for this idea."
- "give me a strategy, but do not place any orders."

### Should not trigger

- "is this market worth researching?"
- "estimate the fair odds."
- "preview a 25c bid."
- "submit this order now."
- "summarize the current market state."

## resource map

- `deep-market-research` — use when fair-value work, evidence gathering, or catalyst mapping is still missing
- `market-memo` — use when current state and mechanics need a compact summary first
- `opportunity-classifier` — use when triage or prioritization is still the main problem
- `order-ticket` — use when the strategy is ready to become a guarded execution plan
