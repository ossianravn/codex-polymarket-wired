# Examples

## Example 1: Single-market classification

**Prompt**

Classify this Polymarket market and tell me if it deserves deep research.

**Output shape**

```json
{
  "series": {
    "seriesTitle": "2026 mayoral races",
    "seriesCategory": "politics"
  },
  "event": {
    "eventTitle": "venice mayor election",
    "structuralType": "multi-outcome-exclusive",
    "mutualExclusivity": true,
    "exhaustiveWithinGroup": false,
    "horizonBucket": "short",
    "settlementTimingClass": "cannot-settle-before-date"
  },
  "market": {
    "marketTitle": "candidate x to win",
    "impliedProb": 0.34,
    "spreadCents": 3,
    "liquidityUsd": 18000,
    "negRisk": true
  },
  "derived": {
    "resolutionClarityScore": 74,
    "resolutionAmbiguityScore": 28,
    "modelabilityScore": 72,
    "tradabilityScore": 63,
    "catalystScore": 81,
    "attentionGapScore": 54,
    "crossMarketConsistencyScore": 42,
    "pricingStatus": "unmodeled",
    "researchPriorityScore": 71,
    "interestTier": "B",
    "reasonCodes": [
      "exclusive-basket",
      "scheduled-catalyst",
      "strong-modelability",
      "pricing-unmodeled",
      "cross-market-dislocation"
    ],
    "disqualifiers": [],
    "nextHandoffSkill": "deep-market-research"
  }
}
```

## Example 2: Watchlist triage automation

**Prompt**

Use `watchlist-scan` first. For every market with a material change, run `opportunity-classifier`. Only show markets with `interestTier` A or B. Sort by the strongest combination of catalystScore, tradabilityScore, and researchPriorityScore. For each one, recommend `market-memo`, `deep-market-research`, or `strategy-draft`.

## Example 3: Rules-first filtering

**Prompt**

Scan current politics and economics markets. Block `open-ended-process` and `live/sports`. Prefer `single-binary`, `multi-outcome-exclusive`, and `threshold/range`. Ignore names with tradabilityScore below 55 or resolutionAmbiguityScore above 35. Return the top 10 remaining markets with reason codes.
