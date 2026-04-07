# Scoring Rubric

All scores are 0-100. Use exact numerics first, then map to a score. Do not guess precision you do not have.

## 1) Helper functions

Use bounded linear scoring.

```txt
score_up(x, bad, good):
  0 when x <= bad
  100 when x >= good
  linear in between

score_down(x, good, bad):
  100 when x <= good
  0 when x >= bad
  linear in between
```

When a value is unavailable, use `null` and state the missing input.

## 2) Resolution clarity and ambiguity

### 2.1 ResolutionClarityScore

```txt
resolutionClarityScore =
  0.35 * sourceSpecificity
+ 0.25 * timingDeterminism
+ 0.20 * wordingPrecision
+ 0.20 * edgeCaseCoverage
```

Assign subscores like this:

### sourceSpecificity
- 100 = official named source or explicit rules source
- 80 = official body but generic wording
- 60 = reputable secondary source named, no direct official source
- 30 = vague source or generic "news reports"
- 10 = no clear source

### timingDeterminism
- 100 = hard date with clear eligibility to resolve
- 80 = cannot resolve before a known date, then likely prompt
- 50 = trigger exists but final settlement timing uncertain
- 20 = open-ended or weak timing constraint

### wordingPrecision
- 100 = single measurable outcome
- 80 = clean winner or threshold wording
- 55 = some ambiguity but still operational
- 25 = multi-clause, subjective, or nested conditions

### edgeCaseCoverage
- 100 = explicit tie / void / unknown / delayed-report handling
- 70 = partial edge-case handling
- 30 = edge cases mostly absent

### 2.2 Clarification and dispute risk

Use these when the resolution text is weak, open-ended, or depends on interpretation.

```txt
clarificationRiskScore =
  0.50 * wordingAmbiguity
+ 0.30 * sourceFragility
+ 0.20 * timingAmbiguity

disputeRiskScore =
  0.50 * edgeCaseExposure
+ 0.30 * wordingAmbiguity
+ 0.20 * sourceFragility
```

Then:

```txt
resolutionAmbiguityScore =
  0.50 * (100 - resolutionClarityScore)
+ 0.30 * clarificationRiskScore
+ 0.20 * disputeRiskScore
```

## 3) ModelabilityScore

```txt
modelabilityScore =
  0.30 * resolutionClarityScore
+ 0.25 * structuralSimplicityScore
+ 0.20 * dataAvailabilityScore
+ 0.15 * baseRateAvailabilityScore
+ 0.10 * catalystDeterminismScore
```

### structuralSimplicityScore
- 100 = single-binary, hard-date
- 85 = multi-outcome-exclusive
- 80 = threshold/range
- 55 = multi-yes
- 35 = open-ended-process
- 40 = live/sports unless explicitly treated as a microstructure workflow

### dataAvailabilityScore
- 100 = official recurring data or rich public evidence stream
- 80 = elections / macro / earnings / scheduled releases with strong coverage
- 60 = one-off event with decent reporting
- 35 = sparse, novelty-heavy narrative market

### baseRateAvailabilityScore
- 100 = many clean historical comps
- 75 = several relevant comps
- 50 = weak comp set
- 20 = effectively no comps

### catalystDeterminismScore
- 100 = known scheduled catalyst soon
- 75 = known catalyst but timing wider
- 45 = some plausible catalyst, timing weak
- 20 = no reliable catalyst path

## 4) TradabilityScore

Prefer live book inputs. If the full book is not available, approximate conservatively from spread and liquidity.

```txt
tradabilityScore =
  0.25 * spreadScore
+ 0.25 * depthScore
+ 0.20 * slippageScore
+ 0.15 * volumeScore
+ 0.10 * openInterestScore
+ 0.05 * tickScore
```

### spreadScore
Use `spreadCents`.
- 100 at 1c or tighter
- 75 at 2c
- 50 at 4c
- 25 at 6c
- 0 at 8c or wider

### depthScore
Use depth within 2c at your target notional. Default target is $50.
- 100 if depthUsdWithin2c >= 250
- 75 if >= 100
- 50 if >= 50
- 25 if >= 20
- 0 if < 20

### slippageScore
Use estimated cents of slippage at target notional.
- 100 if <= 1c
- 75 if <= 2c
- 50 if <= 3c
- 25 if <= 5c
- 0 if > 5c

### volumeScore
Use 24h or 7d volume.
- 100 if >= 100k USD
- 75 if >= 25k
- 50 if >= 10k
- 25 if >= 2k
- 0 if < 2k

### openInterestScore
- 100 if >= 250k USD
- 75 if >= 50k
- 50 if >= 10k
- 25 if >= 2k
- 0 if < 2k

### tickScore
- 100 if tickSize <= 0.01
- 60 if tickSize <= 0.02
- 30 if tickSize <= 0.05
- 0 otherwise

## 5) CatalystScore

```txt
catalystScore =
  0.50 * timingNearness
+ 0.30 * determinism
+ 0.20 * oneWayInformationPotential
```

Suggested anchors:
- high 80-100 = scheduled catalyst inside 30 days and likely to move price
- medium 50-79 = visible catalyst but timing or significance is moderate
- low 0-49 = no catalyst or diffuse process market

## 6) AttentionGapScore

This is not raw illiquidity. It is neglected-but-still-usable.

```txt
attentionGapScore =
  0.50 * neglectSignal
+ 0.30 * modelabilityBonus
+ 0.20 * catalystBonus
```

Use this intuition:
- high score when the market is reasonably tradable, clearly modelable, and not already saturated with flow
- low score when the market is both crowded and efficient or too dead to trade

## 7) CrossMarketConsistencyScore

Higher = more internally coherent. Lower = more inconsistent and possibly more interesting.

Use related markets or exclusive baskets.

Examples:
- winner basket sums far from 100 after adjusting for unlisted field -> low consistency
- mutually linked markets imply contradictory probabilities -> low consistency
- related markets line up cleanly -> high consistency

Suggested anchors:
- 85-100 = consistent
- 60-84 = mostly coherent, small drift
- 40-59 = noticeable drift
- 0-39 = strong inconsistency / dislocation

## 8) Pricing fields

Only populate these when a fair-value model exists.

```txt
edgePctPoints = fairProb - impliedProb
edgeAfterFeesPctPoints = edgePctPoints - estimatedFeeDragPctPoints
```

Then:
- `cheap-yes` if edgeAfterFeesPctPoints > 0 and direction is buy-yes
- `cheap-no` if edgeAfterFeesPctPoints > 0 and direction is buy-no
- otherwise `roughly-fair` or the corresponding expensive label

Until fair value exists, use:
- `pricingStatus = unmodeled`
- `edgePctPoints = null`
- `edgeAfterFeesPctPoints = null`

## 9) Two final scores

### 9.1 ResearchPriorityScore

Use this when there is no fair value yet.

```txt
researchPriorityScore =
  0.35 * modelabilityScore
+ 0.20 * tradabilityScore
+ 0.20 * (100 - resolutionAmbiguityScore)
+ 0.15 * catalystScore
+ 0.10 * attentionGapScore
```

### 9.2 TradeOpportunityScore

Use this only when fair value exists.

First convert edge-after-fees to a 0-100 score:

```txt
edgeScore =
  0 at <= 0.0 pct points
  50 at 3.0 pct points
  75 at 5.0 pct points
  100 at 8.0+ pct points
```

Then:

```txt
tradeOpportunityScore =
  0.35 * edgeScore
+ 0.20 * modelabilityScore
+ 0.15 * tradabilityScore
+ 0.10 * (100 - resolutionAmbiguityScore)
+ 0.10 * catalystScore
+ 0.10 * (100 - crossMarketConsistencyScore)
```

## 10) Tiering

### hard disqualifiers

Mark `interestTier = avoid` if any of these apply:
- market closed, archived, or not accepting orders for the intended use
- blocked tag or blocked structural type
- resolutionAmbiguityScore > 70
- tradabilityScore < 30
- spread or slippage far beyond configured tolerance

### soft caps

- If `resolutionAmbiguityScore > 50`, cap at `C` unless the task is explicitly resolution-watch research.
- If `tradabilityScore < 45`, cap at `C` for trade purposes.
- If `pricingStatus = unmodeled`, do not use `tradeOpportunityScore`; use `researchPriorityScore`.

### tier thresholds

For research mode:
- `A` = researchPriorityScore >= 75 and no hard disqualifier
- `B` = 60-74
- `C` = 45-59
- `avoid` < 45

For trade mode:
- `A` = tradeOpportunityScore >= 75 and edgeAfterFeesPctPoints >= 3
- `B` = 60-74
- `C` = 45-59
- `avoid` < 45 or edgeAfterFeesPctPoints <= 0

## 11) Reason codes

Use short, reusable reason codes. Suggested set:
- `hard-date-resolution`
- `exclusive-basket`
- `range-structure`
- `open-ended-process`
- `high-resolution-clarity`
- `high-resolution-risk`
- `scheduled-catalyst`
- `strong-modelability`
- `cross-market-dislocation`
- `good-depth`
- `wide-spread`
- `slippage-risk`
- `blocked-tag`
- `blocked-structure`
- `pricing-unmodeled`
- `positive-edge-after-fees`
- `not-accepting-orders`
