---
name: opportunity-classifier
description: classify and score polymarket markets or events for watchlist triage, segmentation, and opportunity filtering. use when the user wants to categorize markets by structure, horizon, resolution risk, liquidity, catalyst profile, modelability, or tradability; rank which bets deserve deeper research; build rules for allowed or blocked bet types; or produce a normalized object for downstream skills and automations.
---

# opportunity classifier

Use this skill upstream of `market-memo`, `deep-market-research`, `strategy-draft`, and `order-ticket`.

Load these references when needed:
- `references/schema.md` for the canonical object model.
- `references/scoring-rubric.md` for exact score formulas, thresholds, and tiering.
- `references/integration.md` for how this skill fits into the Polymarket plugin.
- `references/examples.md` for example prompts and outputs.

## what this skill is for

Use this skill when the user is effectively asking one of these questions:
- what kind of market is this?
- which markets belong in the watchlist?
- which bets are even worth researching?
- which market structures should be blocked, deprioritized, or preferred?
- which market deserves a memo versus deep research versus a strategy draft?

Do **not** use this skill to place trades.

## workflow

1. Resolve the target set.
   - One market: use `get_market_snapshot`.
   - Many candidates: use `search_markets`, then snapshot the finalists.

2. Pull live mechanics.
   - snapshot with related markets and comments
   - orderbook summary
   - recent trades if flow matters
   - price history if volatility, drift, or catalyst timing matters

3. Build the normalized object.
   - Fill the canonical `series`, `event`, and `market` layers from `references/schema.md`.
   - Then fill the `derived` layer only from computed features or explicit fair-value work.

4. Classify the market.
   - `structuralType`
   - `mutualExclusivity`
   - `exhaustiveWithinGroup`
   - `settlementTimingClass`
   - `horizonDays` and `horizonBucket`
   - catalyst profile
   - resolution-risk profile

5. Score it.
   - resolution clarity / ambiguity
   - modelability
   - tradability
   - catalyst quality
   - attention gap
   - cross-market consistency or dislocation
   - research priority or trade opportunity

6. Assign a decision.
   - `interestTier`
   - `reasonCodes`
   - `disqualifiers`
   - next best handoff skill

7. Persist the result when the state tools are available.
   - Call `record_classification` with the final normalized scores and decision payload.
   - For names that already have history, use `get_market_state` first so repeated work builds on the prior record rather than starting from zero.

## hard rules

- For tier `A` or `B` names with rule or structure uncertainty, consider spawning narrow read-only subagents such as `rules_auditor`, `microstructure_analyst`, or `related_market_mapper` before finalizing the classification.

- Keep canonical metadata separate from derived judgments.
- Do not use `isUnderPriced` or `isOverPriced` unless a fair probability exists. Until then, set `pricingStatus` to `unmodeled`.
- Prefer exact numerics like `horizonDays`, `spreadCents`, `slippageAt50Usd`, and `realizedVol7d`; derive buckets second.
- Treat resolution risk as first-class. Always read the resolution text and end date before assigning a high tier.
- Do not promote a market above tier `B` when resolution ambiguity is high or tradability is poor.
- Do not place, preview, or cancel orders in this skill.

## output structure

# opportunity classification

## normalized object
Provide a compact JSON block with `series`, `event`, `market`, and `derived`.

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

## decision
List:
- `interestTier`
- `reasonCodes`
- `disqualifiers`
- `nextHandoffSkill`

## notes
End with:
- strongest uncertainty
- missing data that would change the tier
- whether the market deserves `market-memo`, `deep-market-research`, or `strategy-draft`

## handoff rules

- Tier `A` or `B`, but no fair value yet -> hand off to `deep-market-research`.
- Tier `A` or `B` with a clear thesis but no entry plan -> hand off to `strategy-draft`.
- User only wants a compact summary -> hand off to `market-memo`.
- User explicitly asks to trade now -> hand off to `order-ticket`.
