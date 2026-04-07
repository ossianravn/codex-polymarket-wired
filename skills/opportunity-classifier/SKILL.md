---
name: opportunity-classifier
description: classify and score polymarket markets or events for watchlist triage, segmentation, and opportunity filtering. use when the user wants to categorize markets by structure, horizon, resolution risk, liquidity, catalyst profile, modelability, or tradability; rank which bets deserve deeper research; build rules for allowed or blocked bet types; or produce a normalized object for downstream skills and automations.
---

# opportunity classifier

Use this skill to answer one question before deeper work starts:

`what is this market, how actionable is it, and what should happen next?`

This skill is upstream of `market-memo`, `deep-market-research`, `strategy-draft`, and `order-ticket`.

## default mode

- Default to **triage mode**.
- In triage mode, optimize for ranking, gating, segmentation, and next-step selection.
- Do not drift into a full market memo, fair-value model, or trade plan unless the user explicitly asks for that and the handoff rules point there.

## load only the references that matter

Use these files deliberately, not mechanically:
- `references/schema.md` for the canonical output model.
- `references/scoring-rubric.md` for score formulas, thresholds, and tiering.
- `references/integration.md` for stack placement and downstream interaction rules.
- `references/examples.md` for example prompts and output shape.

## what this skill is for

Use this skill when the user is effectively asking:
- what kind of market is this?
- which markets belong in the watchlist?
- which names are worth deeper research?
- which structures should be blocked, deprioritized, or preferred?
- which downstream skill should handle this market next?
- which changed watchlist names deserve fresh attention right now?

Use this skill for:
- one market when the goal is triage rather than deep analysis
- many markets when the goal is ranking or filtering
- automation output when you need normalized scores, reason codes, and next-step routing

Do **not** use this skill to:
- place trades
- preview or cancel orders
- write a full deep-dive memo
- invent a fair-value estimate without a real model
- turn a thin snapshot into a polished thesis

## outside-in frame

Before scoring, inspect the market from these lenses:
- **resolution lens:** can this settle cleanly and predictably?
- **structure lens:** is the market type inherently modelable or messy?
- **tradability lens:** can this actually be traded at useful size?
- **catalyst lens:** is there a real reason to care now rather than later?
- **workflow lens:** what is the cheapest next step that materially improves the decision?

If the answer to the workflow lens is "none", the market should usually end up `C` or `avoid`.

## minimum viable input checklist

Do not finalize classification until you have, or explicitly mark as missing:
- one resolved market identifier
- resolution text or an equivalent resolution source
- current implied probability or midpoint context
- spread and liquidity context
- one timing anchor such as end date, release date, or catalyst date
- enough structure context to determine the event type

For stronger `A` or `B` calls, you should also have:
- live orderbook context when tradability matters
- recent trade or price context when drift, volatility, or catalyst timing matters
- related market context when exclusivity or cross-market consistency matters

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- what set is being classified: one market, shortlist, watchlist changes, or portfolio-adjacent names
- what the user wants from the classification: rank, block, route, or summarize
- whether the result is for a human decision, an automation step, or a portfolio review

If the user asks for fair value, pricing, or exact trade parameters, classify first only if triage is still needed. Otherwise hand off quickly.

### 2. Resolve the market set

- One market: use `get_market_snapshot`.
- Many candidates: use `search_markets`, then snapshot only the finalists.
- Existing state-heavy names: use `get_market_state` first so repeated work builds on history rather than starting from zero.

Keep the set small enough that the classification can stay comparative and concrete.

### 3. Pull only the live mechanics needed

Use the minimum MCP read set that can support the judgment:
- always start from `get_market_snapshot`
- add `get_orderbook` when tradability or slippage may matter
- add `get_recent_trades` when stale books, flow, or participation quality matters
- add `get_price_history` when volatility, drift, or catalyst timing matters

Do not collect data just because a tool exists. Every extra input should change the classification.

### 4. Build the canonical object first

Populate only canonical fields from observed data:
- `series`
- `event`
- `market`

Use `references/schema.md` as the hard boundary between:
- **canonical facts**: identifiers, timing, category, market mechanics, outcomes
- **derived judgments**: clarity, ambiguity, modelability, tradability, catalyst quality, priority, and next action

Do not leak subjective judgments into canonical fields.

### 5. Classify the structural shape

Determine at minimum:
- `structuralType`
- `mutualExclusivity`
- `exhaustiveWithinGroup`
- `settlementTimingClass`
- `horizonDays`
- `horizonBucket`
- catalyst profile
- resolution-risk profile

Bias toward conservative structure labels when uncertain. If a market could be either clean or messy, classify it as the messier form until the rules clearly support the cleaner one.

### 6. Score it using the rubric

Use `references/scoring-rubric.md` and keep exact numerics ahead of buckets.

At minimum, assess:
- `resolutionClarityScore`
- `resolutionAmbiguityScore`
- `modelabilityScore`
- `tradabilityScore`
- `catalystScore`
- `attentionGapScore`
- `crossMarketConsistencyScore`

Then produce exactly one of:
- `researchPriorityScore` when no fair-value model exists
- `tradeOpportunityScore` when a fair-value model already exists and is credible

If fair value is missing, keep:
- `pricingStatus = unmodeled`
- `fairProb = null`
- `fairValueLow = null`
- `fairValueHigh = null`
- no underpriced / overpriced language

### 7. Make the decision

Assign:
- `interestTier`
- `reasonCodes`
- `disqualifiers`
- `nextHandoffSkill`

The decision should answer:
- should this be ignored, watched, researched, or advanced?
- what is the single best next step?
- what is the main reason not to do more work?

### 8. Persist when useful

When state tools are available, call `record_classification` with:
- normalized scores
- final decision payload
- the reasoning fields that are worth reusing later

Persist only when the classification is stable enough to be useful downstream.

## hard rules

- Keep canonical metadata separate from derived judgments.
- Treat resolution risk as first-class. Always read the resolution text and end date before assigning a high tier.
- Do not use `isUnderPriced` or `isOverPriced` unless a real fair probability exists.
- Prefer exact numerics like `horizonDays`, `spreadCents`, `slippageAt50Usd`, and `realizedVol7d`; derive buckets second.
- Do not promote a market above tier `B` when resolution ambiguity is high or tradability is poor.
- Do not place, preview, submit, or cancel orders in this skill.
- Do not confuse novelty with opportunity. Weird markets often deserve `avoid`.
- Do not reward thin illiquidity on its own. `attentionGap` is neglected-but-usable, not dead-and-untradeable.
- Do not let one weak related-market inconsistency dominate an otherwise low-quality market.

## escalation and handoff rules

- Tier `A` or `B`, but no fair value yet -> `deep-market-research`
- Tier `A` or `B` with a credible thesis but no execution framing -> `strategy-draft`
- User only wants a compact single-name summary -> `market-memo`
- User explicitly wants to trade now -> `order-ticket`

If the user explicitly asks for probability modeling or fair pricing before triage is complete:
- classify first only if the main blocker is "is this even worth modeling?"
- otherwise route to `actuarial-forecasting` when installed, or the fallback at [ossianravn/actuarial-forecasting](https://github.com/ossianravn/actuarial-forecasting/blob/main/SKILL.md)

For tier `A` or `B` names with rule, structure, or microstructure uncertainty, consider narrow read-only subagents such as:
- `rules_auditor`
- `microstructure_analyst`
- `related_market_mapper`

Spawn them only when their output could change the tier or handoff decision.

## output contract

Return exactly these sections in this order.

# opportunity classification

## intent
State in 1-2 sentences:
- what was classified
- what the classification is trying to decide

## normalized object
Provide one compact JSON block with:
- `series`
- `event`
- `market`
- `derived`

Only include fields you can support from evidence or computation.

## scorecard
List:
- `resolutionClarityScore`
- `resolutionAmbiguityScore`
- `modelabilityScore`
- `tradabilityScore`
- `catalystScore`
- `attentionGapScore`
- `crossMarketConsistencyScore`
- `researchPriorityScore` or `tradeOpportunityScore`

For each score, add one short justification tied to an observed feature.

## decision
List:
- `interestTier`
- `reasonCodes`
- `disqualifiers`
- `nextHandoffSkill`

## notes
End with flat bullets for:
- strongest uncertainty
- missing data that would change the tier most
- why the selected next handoff is the cheapest useful next step

## completion criteria

The classification is complete only when all of the following are true:
- the market type is structurally labeled
- the canonical object is separated from derived judgments
- resolution and timing risk have been assessed explicitly
- tradability has been assessed from actual market mechanics, not vibes
- the final tier is defended by reason codes or disqualifiers
- the next handoff is singular and justified
- no unsupported fair-value language appears when `pricingStatus` is `unmodeled`

## common failure modes

- writing a mini market memo instead of a classifier
- assigning scores without tying them to observed features
- treating every interesting market as research-worthy
- ignoring resolution ambiguity because the market is liquid
- confusing novelty, volatility, or narrative heat with modelability
- using handoff as a generic "more research" placeholder instead of the best next step
- mixing canonical facts with subjective derived fields

## activation tests

### Should trigger

- "classify this Polymarket market and tell me if it deserves deep research."
- "which of these markets belong in the watchlist?"
- "scan these candidates and tell me which ones are actually worth modeling."
- "which market structures should we block or avoid?"
- "for each changed watchlist name, tell me whether to ignore it, memo it, or research it."
- "rank these markets by research priority and tradability."

### Should not trigger

- "write a deep memo on this one market."
- "estimate the fair odds for this merger."
- "place a bid at 25c."
- "give me a full trading plan."
- "summarize today's news."

## resource map

- `references/schema.md` — canonical output model and field definitions
- `references/scoring-rubric.md` — exact score formulas and thresholds
- `references/integration.md` — stack placement and downstream workflow logic
- `references/examples.md` — example prompts and output patterns
