---
name: deep-market-research
description: perform deep research for a polymarket market, event, or thesis. use when the user wants fair-value work, evidence gathering, catalyst mapping, linked-market comparisons, or a detailed explanation of whether the market looks mispriced. for wide candidate sets or triage questions, use opportunity-classifier first.
---

# deep market research

Use this skill to answer one question:

`after doing the real evidence work, what should this market be worth and why?`

This skill is the heavy analytical layer:
- downstream of `opportunity-classifier` and `market-memo`
- upstream of `strategy-draft` and `order-ticket`

It should produce a research synthesis with a defended fair-value view, not a casual narrative and not an execution plan.

## default mode

- Default to **research mode**.
- In research mode, optimize for evidence quality, resolution discipline, catalyst mapping, and fair-value synthesis.
- Do not drift into broad triage, shallow memoing, or live order construction.

## what this skill is for

Use this skill when the user is effectively asking:
- is this market mispriced?
- what evidence really matters here?
- what is a disciplined fair-value range?
- what catalysts could move this market?
- how do related markets change the view?

Use this skill for:
- one market or one tightly linked thesis cluster
- evidence-heavy work that goes beyond a memo
- fair-value synthesis from market data plus external evidence
- resolution-sensitive markets where mechanics and facts both matter

Do **not** use this skill to:
- rank a broad candidate set
- improvise a numerical forecast from vibes
- place, preview, submit, or cancel orders
- skip sourcing because the market already has a price

## minimum viable input checklist

Do not finalize research until you have, or explicitly mark as missing:
- one resolved market identifier
- live market state
- resolution text or equivalent primary settlement source
- at least one primary or authoritative external evidence source
- at least one clear argument against the working thesis
- a fair-value view or a clear reason why it cannot yet be formed

For stronger research passes, also pull:
- related markets when cross-market consistency matters
- historical price or trade context when timing and drift matter
- persisted state when prior developments or past syntheses exist

## outside-in frame

Before writing the synthesis, inspect the market from these lenses:
- **resolution lens:** what exactly settles this market, and where can interpretation break?
- **evidence lens:** which sources are primary, which are secondary, and which are noise?
- **model lens:** can this be priced with real numerical discipline, or is it still too underdetermined?
- **catalyst lens:** what future developments are most likely to move the probability?
- **workflow lens:** is deep research the right next step, or should this still be triage, memo, modeling, or strategy?

If the workflow lens says the main missing piece is numerical forecasting, use `actuarial-forecasting` rather than improvising percentages.

## dependency and handoff rules

If the main missing piece is:
- broad triage or ranking across many markets -> `opportunity-classifier`
- a compact live-state brief before deeper work -> `market-memo`
- explicit probability modeling, scenario weights, threshold pricing, or visible numerical anchors -> `actuarial-forecasting`
- entry timing, invalidation, or exit framing -> `strategy-draft`
- exact preview-safe execution parameters -> `order-ticket`

For expensive or ambiguous names, consider narrow read-only subagents such as:
- `rules_auditor`
- `catalyst_researcher`
- `microstructure_analyst`
- `related_market_mapper`

Spawn them only when their output could materially change the fair-value view or the next handoff.

If `actuarial-forecasting` is not installed locally, use the fallback at [ossianravn/actuarial-forecasting](https://github.com/ossianravn/actuarial-forecasting/blob/main/SKILL.md).

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- what market or thesis cluster is being researched
- what pricing or decision question the research must answer
- whether the goal is a first-pass synthesis or a higher-conviction fair-value call

### 2. Refresh live market context

Before external research, confirm the live setup with the minimum needed reads:
- always start with `get_market_snapshot`
- add `get_orderbook` when spread or tradability affects interpretation
- add `get_recent_trades` when recent flow may reveal stale pricing or catalyst-driven activity
- add `get_price_history` when timing, drift, or volatility matters
- add `get_market_state` when existing stored research or developments could save repeated work

### 3. Lock down resolution mechanics first

Identify:
- what counts as a win
- who or what likely determines resolution
- what edge-case wording matters
- what timing matters for both settlement and trading

Do not do probability work on a market whose settlement mechanics you have not understood.

### 4. Build the evidence map

Separate evidence into:
- **supports yes**
- **supports no**
- **unresolved**

Prefer:
- official documents
- primary data
- company filings
- regulator or election authority materials
- direct timeline evidence

Use secondary reporting only to point toward stronger sources or to capture genuinely current developments.

### 5. Form or import the numerical view

If the question requires real forecasting:
- use `actuarial-forecasting` for explicit probability modeling, scenario weights, and visible numerical anchors
- then bring that output back into the research synthesis

If a full model is not possible, say why and bound the uncertainty rather than manufacturing precision.

### 6. Compare fair value with the live market

Make the pricing comparison explicit:
- live implied probability
- low / base / high fair value
- main reason the market may still be right even if your base case differs

Never use the market price itself as evidence for the thesis.

### 7. State what would change the view

Name:
- the next catalyst
- the strongest disconfirming evidence
- the single biggest assumption
- the main reason not to trade yet, if applicable

### 8. Persist reusable work when available

When state tools are available:
- call `record_research_synthesis` with the final thesis, fair-value range, and evidence map
- call `record_development` for standalone catalysts or developments that should be queryable later

Persist only the pieces likely to remain useful beyond the current thread.

## hard rules

- Do not place, preview, submit, or cancel orders in this skill.
- Do not skip resolution analysis because the market looks obvious.
- Do not treat headlines, comments, or market chatter as sufficient evidence on their own.
- Do not improvise exact percentages when the problem needs real modeling.
- Do not hide uncertainty inside a polished narrative.
- Do not let related-market comparisons replace primary evidence.
- Do not forget the strongest counter-case.

## output contract

Return exactly these sections in this order.

# [market title]

## research intent
State in 1-2 sentences:
- what pricing question the research is trying to answer
- what the current scope is

## current market pricing
List:
- live implied probability
- recent move
- spread or liquidity note
- any flow feature that matters for interpretation

## resolution and mechanics
List:
- what resolves the market
- what counts as a win
- key timing detail
- main ambiguity or wording risk

## evidence map
Use flat bullets under:
- supports yes
- supports no
- unresolved

## linked markets
List:
- related markets that should move with this one
- any meaningful inconsistency
- whether the cross-market read strengthens or weakens the thesis

## fair-value view
List:
- low
- base
- high
- whether this came from direct modeling, bounded inference, or `actuarial-forecasting`

## market versus fair value
State:
- whether the live market looks under, over, or roughly fairly priced
- the strongest reason the market could still be right

## what would change the view
List:
- disconfirming evidence
- next catalyst
- biggest assumption
- reason not to trade yet, if any

## next handoff
Choose one:
- remain in `deep-market-research`
- hand off to `actuarial-forecasting`
- hand off to `strategy-draft`
- hand off to `order-ticket`

Explain why that is the cheapest useful next step.

## completion criteria

The research pass is complete only when:
- mechanics and resolution risk are explicit
- external evidence is separated from market observations
- the strongest counter-case is present
- the fair-value view is defended or clearly bounded
- the comparison with live pricing is explicit
- the next handoff is singular and justified

## common failure modes

- writing a long memo with no real evidence map
- skipping primary sources because current news feels enough
- smuggling market price into the evidence base
- outputting fake precision on an under-modeled question
- ignoring the strongest reason the market may still be right
- drifting into strategy or execution before the research is done

## activation tests

### Should trigger

- "do a deep research pass on this market."
- "is this market mispriced?"
- "build the evidence map and fair-value range."
- "compare this market to related names and tell me what it should be worth."
- "research this thesis before we build a trade plan."

### Should not trigger

- "which of these markets are worth looking at?"
- "give me a short memo on this market."
- "turn this thesis into an entry plan."
- "place a 25c bid."
- "just summarize the book."

## resource map

- `opportunity-classifier` — use when the main question is whether the name deserves research at all
- `market-memo` — use when a compact live-state brief is the missing prerequisite
- `strategy-draft` — use when the fair-value view exists and the next problem is execution framing
- `order-ticket` — use when the strategy is ready to become a guarded trade plan
