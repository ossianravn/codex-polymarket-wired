---
name: market-memo
description: write a structured memo for a polymarket market or event. use when the user asks to analyze a single market, summarize current odds, liquidity, spread, recent flow, resolution mechanics, or prepare a trade brief before acting. for broad candidate sets or ranking questions, use opportunity-classifier first.
---

# market memo

Use this skill to answer one question:

`what is happening in this market right now, what matters, and what should the user do next?`

This skill is a compact single-name briefing layer:
- downstream of `opportunity-classifier`
- upstream of `deep-market-research`, `strategy-draft`, and `order-ticket`

It should produce a decision-useful memo, not a full research dossier and not an execution plan.

## default mode

- Default to **memo mode**.
- In memo mode, optimize for current-state clarity, resolution mechanics, and practical next-step framing.
- Do not drift into broad market ranking, external deep research, fair-value modeling, or order construction unless the handoff rules require it.

## what this skill is for

Use this skill when the user is effectively asking:
- what does this market look like right now?
- what are the important mechanics or resolution risks?
- is the price action notable or just noise?
- what is the clean bull case and bear case?
- is this worth deeper work or not?

Use this skill for:
- one market or one event
- a fast but disciplined market brief
- translating live market state into a compact memo before strategy
- clarifying mechanics and ambiguity before spending more effort

Do **not** use this skill to:
- rank a broad list of markets
- invent fair value from weak evidence
- perform a full evidence-heavy research synthesis
- construct a live order plan
- preview, submit, or cancel orders

## minimum viable input checklist

Do not finalize a memo until you have, or explicitly mark as missing:
- one resolved market identifier
- current implied probability or midpoint context
- spread and liquidity context
- recent flow or price context
- clear resolution text or equivalent resolution source
- one concrete note on what could create ambiguity or mechanical confusion

When useful, also pull:
- comments when sentiment or new information may matter
- related markets when cross-market context could change interpretation

If you cannot support the current-state section with live reads, say so explicitly.

## outside-in frame

Before writing the memo, inspect the market from these lenses:
- **mechanics lens:** what exactly resolves this market, and who decides?
- **pricing lens:** what is the market currently implying, and is the move meaningful?
- **flow lens:** does the orderbook and recent trade activity look healthy, stale, or distorted?
- **resolution-risk lens:** what could make settlement messy even if the headline seems simple?
- **workflow lens:** is a memo the right next step, or should this route to classifier, research, strategy, or ticketing instead?

If the workflow lens says the real problem is ranking, fair-value work, or execution, hand off instead of overextending the memo.

## dependency and handoff rules

If the main missing piece is:
- triage across many markets or deciding what deserves attention -> `opportunity-classifier`
- external evidence, catalyst mapping, linked-market inconsistency, or fair-value synthesis -> `deep-market-research`
- explicit probability modeling, visible scenario math, or threshold pricing -> `actuarial-forecasting`
- entry bands, invalidation, exit logic, or wait-versus-act framing -> `strategy-draft`
- exact preview-safe order construction or live execution planning -> `order-ticket`

If `actuarial-forecasting` is not installed locally, use the fallback at [ossianravn/actuarial-forecasting](https://github.com/ossianravn/actuarial-forecasting/blob/main/SKILL.md).

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- which market is being memoed
- whether the user wants a brief, a pre-trade read, or a mechanics check
- what decision the memo is supposed to support

### 2. Refresh the live state

Use the minimum MCP read set that can support the memo:
- always start with `get_market_snapshot`
- add `get_orderbook` when spread, depth, or slippage context matters
- add `get_recent_trades` when flow quality or stale books matter
- add `get_price_history` when recent movement needs interpretation
- add comments only when they may contain material context, not as filler

Do not assume yesterday's state still holds.

### 3. Separate observed facts from interpretation

Create a clean split between:
- **observed market state**: price, spread, depth, flow, recent move, mechanics
- **your inference**: why that state matters and what it suggests

Do not smuggle narrative claims into the observed section.

### 4. Explain the resolution path

Summarize:
- what counts as a win
- who or what likely determines resolution
- what timing matters
- what ambiguity or edge-case wording could matter operationally

Keep this practical. The user should finish this section knowing how the market could settle and where disputes could arise.

### 5. Build the compact argument set

State the strongest:
- bull case
- bear case
- market-structure note

These should be concise and decision-relevant, not a long research memo.

### 6. End with next-step framing

Close the memo by stating:
- whether the market looks clean enough for strategy work
- whether the setup still needs research
- whether the user should wait because market conditions are poor

Execution considerations may discuss passive-versus-aggressive conditions at a high level, but this skill must stop short of strategy or ticket construction.

## hard rules

- Do not place, preview, submit, or cancel orders in this skill.
- Do not invent fair value from price action alone.
- Do not write a mini deep-research report when the user asked for a memo.
- Do not skip resolution mechanics just because the market is liquid or popular.
- Do not blur observed market facts with your interpretation.
- Do not turn "execution considerations" into an order plan.
- Do not omit the recommended next handoff when the memo surfaces a clearer next step.

## output contract

Return exactly these sections in this order.

# [market title]

## intent
State in 1-2 sentences:
- what the memo is about
- what decision it is intended to support

## current state
List:
- implied probability
- best bid / ask and spread context
- liquidity or depth note
- recent price movement
- recent flow note

## resolution and mechanics
List:
- what resolves the market
- what counts as a win
- important timing detail
- the main ambiguity or edge case

## bull case
List the strongest reasons the market could move higher or be more favorable to the target side.

## bear case
List the strongest reasons the market could move lower or be less favorable to the target side.

## market structure notes
List:
- orderbook shape or microstructure note
- sentiment or comments note if material
- related-market note if relevant
- whether the market looks clean, noisy, or operationally awkward

## execution considerations
Keep this high-level:
- whether the setup looks strategy-ready
- passive-versus-aggressive leaning if it is obvious
- reasons to wait
- why this is not yet an order recommendation

## next handoff
Choose one:
- remain in `market-memo`
- hand off to `opportunity-classifier`
- hand off to `deep-market-research`
- hand off to `actuarial-forecasting`
- hand off to `strategy-draft`
- hand off to `order-ticket`

Explain why that is the cheapest useful next step.

## completion criteria

The memo is complete only when:
- the live market state is refreshed and summarized
- mechanics and resolution risk are explicit
- observed facts are distinct from interpretation
- the bull and bear cases are both present
- execution considerations stay high-level
- the memo names the best next step without overreaching into it

## common failure modes

- writing a vague summary with no live mechanics
- turning the memo into a classifier for multiple names
- confusing comments or sentiment with hard evidence
- skipping resolution ambiguity because the headline sounds simple
- drifting into fair-value claims without real modeling
- turning execution considerations into a strategy or ticket

## activation tests

### Should trigger

- "give me a memo on this polymarket market."
- "summarize the current state of this market before I trade it."
- "what do the odds, spread, and flow look like here?"
- "explain the mechanics and bull/bear case for this one market."
- "write a short trade brief, but do not place any orders."

### Should not trigger

- "which of these ten markets deserve research?"
- "estimate the fair odds for this event."
- "turn this thesis into an execution plan."
- "preview a 30c bid."
- "submit this order."

## resource map

- `opportunity-classifier` — use when ranking, filtering, or triage is still the main question
- `deep-market-research` — use when external evidence, catalyst mapping, or fair-value synthesis is needed
- `strategy-draft` — use when the user now needs entry, invalidation, or exit framing
- `order-ticket` — use when the user is ready for a guarded execution plan
