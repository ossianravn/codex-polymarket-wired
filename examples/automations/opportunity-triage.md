Use `watchlist-scan` first on the configured watchlists.

For every market that crossed a threshold, run `opportunity-classifier`.

Apply `configs/classification-policies.yaml`.

Only surface markets that:
- are not blocked by structural type or tag
- have `interestTier` A or B
- have `tradabilityScore >= 55`
- have `resolutionAmbiguityScore <= 35`

For each surviving market, return:
1. market title
2. structural type
3. key scores
4. reason codes
5. next best handoff skill

If no market survives the filter, say so briefly.
Do not place, preview, or cancel orders.
