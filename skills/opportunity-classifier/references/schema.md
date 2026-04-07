# Schema

Use this schema as the normalized output model. Keep **canonical** objects separate from **derived** judgments.

## 1) Canonical layers

### Series

Use the series layer when the market belongs to a recurring template or cluster.

```ts
type Series = {
  seriesId?: string
  seriesSlug?: string
  seriesTitle?: string
  seriesCategory?: string
  seriesTags?: string[]
  seriesType?: "one-off" | "recurring" | "election-cycle" | "league" | "other"
  seriesRecurrence?: "daily" | "weekly" | "monthly" | "quarterly" | "ad-hoc"
  settlementSources?: string[]
}
```

### Event

The event is the real-world occurrence or grouped betting object.

```ts
type Event = {
  eventId?: string
  eventSlug?: string
  eventTitle: string
  eventSubtitle?: string
  eventDescription?: string

  seriesId?: string
  category?: string
  subcategory?: string
  tags?: string[]

  structuralType:
    | "single-binary"
    | "multi-outcome-exclusive"
    | "multi-yes"
    | "threshold/range"
    | "open-ended-process"
    | "live/sports"
    | "other"

  mutualExclusivity?: boolean
  exhaustiveWithinGroup?: boolean | null

  resolutionSource?: string
  resolutionText?: string
  resolutionRulesUrl?: string | null

  startTs?: string
  closeTs?: string
  earliestOutcomeKnownTs?: string | null
  earliestResolvableTs?: string | null
  expectedFinalSettlementTs?: string | null

  horizonDays?: number
  horizonBucket?: "short" | "medium" | "long"
  settlementTimingClass?:
    | "hard-date"
    | "cannot-settle-before-date"
    | "can-settle-anytime-after-trigger"
    | "open-ended"

  nextCatalystTs?: string | null
  catalystType?: string | null
  catalystCountRemaining?: number | null

  eventLiquidityUsd?: number | null
  eventVolume24hUsd?: number | null
  eventOpenInterestUsd?: number | null
}
```

### Market

The market is the actual tradable object.

```ts
type Market = {
  marketId?: string
  conditionId?: string
  tokenIdYes?: string
  tokenIdNo?: string
  marketSlug?: string
  marketTitle: string
  eventId?: string

  outcomes?: string[]
  impliedProb?: number | null

  groupId?: string | number | null
  groupItemTitle?: string | null
  groupItemThreshold?: string | null
  negRisk?: boolean | null

  active?: boolean
  closed?: boolean
  archived?: boolean
  acceptingOrders?: boolean

  tickSize?: number | null
  minOrderSize?: number | null
  feesEnabled?: boolean | null
  effectiveFeeRatePctAtMid?: number | null

  bestBid?: number | null
  bestAsk?: number | null
  midpoint?: number | null
  spreadCents?: number | null

  liquidityUsd?: number | null
  volume24hUsd?: number | null
  volume7dUsd?: number | null
  openInterestUsd?: number | null

  depthUsdWithin1c?: number | null
  depthUsdWithin2c?: number | null
  depthUsdWithin5c?: number | null
  slippageCentsAt10Usd?: number | null
  slippageCentsAt50Usd?: number | null
  slippageCentsAt100Usd?: number | null

  realizedVol24h?: number | null
  realizedVol7d?: number | null
  volatilityPotentialScore?: number | null

  favoriteRankInGroup?: number | null
}
```

## 2) Derived layer

Only populate these fields after computation.

```ts
type Derived = {
  marketId?: string

  resolutionClarityScore: number
  resolutionAmbiguityScore: number
  clarificationRiskScore: number
  disputeRiskScore: number

  modelabilityScore: number
  tradabilityScore: number
  catalystScore: number
  attentionGapScore: number
  crossMarketConsistencyScore: number

  fairProb?: number | null
  fairValueLow?: number | null
  fairValueHigh?: number | null
  confidenceScore?: number | null

  pricingStatus:
    | "unmodeled"
    | "roughly-fair"
    | "cheap-yes"
    | "expensive-yes"
    | "cheap-no"
    | "expensive-no"

  edgePctPoints?: number | null
  edgeAfterFeesPctPoints?: number | null
  edgeDirection?: "buy-yes" | "buy-no" | "pass"

  researchPriorityScore?: number | null
  tradeOpportunityScore?: number | null
  interestTier: "A" | "B" | "C" | "avoid"

  reasonCodes: string[]
  disqualifiers: string[]
  nextHandoffSkill?:
    | "market-memo"
    | "deep-market-research"
    | "strategy-draft"
    | "order-ticket"
}
```

## 3) Classification rules

### structuralType

Use these defaults:
- `single-binary`: one yes/no market tied to one outcome.
- `multi-outcome-exclusive`: grouped winner markets or exclusive baskets.
- `multi-yes`: several yes markets that can all resolve true or false independently.
- `threshold/range`: brackets, ladders, or strike-style ranges.
- `open-ended-process`: legislation, appointments, coalition formation, treaty progress, court process.
- `live/sports`: markets where microstructure and live scoring dominate.

### horizonBucket

```txt
short  = 0 to 30 days
medium = 31 to 120 days
long   = 121+ days
```

### settlementTimingClass

```txt
hard-date                    exact close / strike / release date
cannot-settle-before-date    known earliest date, uncertain afterward
can-settle-anytime-after-trigger   trigger exists, payout timing uncertain
open-ended                   no reliable outer bound
```

## 4) Important modeling rule

Do not keep these as raw booleans in the canonical schema:
- `isMarketFavorite`
- `isUnderPriced`
- `isOverPriced`
- `eventLiquidityLevel`

Instead derive them from current data:
- `favoriteRankInGroup`
- `pricingStatus`
- `liquidityUsd`, `spreadCents`, and `tradabilityScore`

If a human-readable bucket is needed, compute it from exact numerics:

```ts
type LiquidityLevel = "low" | "medium" | "high"
```

Suggested defaults:
- `high` if tradabilityScore >= 75
- `medium` if tradabilityScore 50-74
- `low` if tradabilityScore < 50
