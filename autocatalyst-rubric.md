# AutoCatalyst Rubric

## Core criteria
- Fits the stated objective and audience: repo maintainers, operator-users, and future autonomous agents.
- Preserves the hard execution gate: paper and live previews are allowed; live submission remains blocked unless explicit approval or a later proven live-autonomous gate exists.
- Is specific enough to act on: every phase has implementation work, acceptance criteria, and validation artifacts.
- Grounded in the repository's current architecture and known limitations.
- Uses actuarial forecasting discipline for any fair-value or trade-edge claim.
- Separates discovery heuristics from independent forecasts and execution decisions.
- Covers data quality, risk, safety, automation, observability, backtesting, incident response, and governance.
- Defines measurable readiness gates before real-money autonomy.

## Promoted criteria
- Market-price contamination guard: no strategy should use venue prices as fair-value evidence before the independent forecast is built.
- Calibration guard: production readiness requires backtests or paper/live reconciliation with Brier/log-loss or comparable forecast-quality metrics, not only realized PnL.
- Fail-closed operations: missing data, stale prices, credential ambiguity, policy-hash drift, or unresolved preview warnings must block submission.
- Auditability: every observation, forecast, decision, preview, order, fill, exit, and override must be persistently reconstructable.
