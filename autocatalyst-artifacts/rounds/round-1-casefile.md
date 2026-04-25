# Round 1 Casefile: Autonomous Trading Production Readiness

## Summary

Round 1 created and validated a canonical production-readiness plan for the Polymarket auto-trader. The promoted plan treats the current repo as a controlled paper prototype with guarded preview capability, not a production autonomous trader.

## The Ask

The user wanted a proper step-by-step markdown plan for making autonomous Polymarket trading production-ready, validated by AutoCatalyst and grounded in actuarial forecasting logic.

## The Situation Before The Round

The repo already supported paper autonomous sessions, discovery/classification, state persistence, scheduling, guarded live previews, and executor gates. It was not production-ready for live autonomy because independent fair-value forecasting, calibration, execution-realistic paper fills, kill switches, pause/resume/reconciliation, and full loss enforcement were incomplete or missing.

## The Session Replay

- Candidate A established broad production phases but remained too outline-like.
- The critic identified the highest-risk ambiguity: live execution gates and forecast-before-price discipline needed to be hard invariants.
- Candidate B tightened the gate model, acceptance artifacts, test strategy, and readiness scoring.
- Candidate AB merged A's operational breadth with B's stricter evidence-gated structure.
- Three real AutoCatalyst judges independently ranked AB first.

## The Contenders

Candidate A gave broad phase coverage but was too outline-like and not strict enough on live execution semantics. Candidate B tightened the safety invariants, gate model, acceptance artifacts, tests, and readiness scoring. Candidate AB merged A's broad operational roadmap with B's stricter evidence-gated structure.

## The Decision

Three real AutoCatalyst judges independently ranked Candidate AB first, Candidate B second, and Candidate A third. The panel chose AB because it keeps the full roadmap while making live submission, independent forecasts, gates, acceptance artifacts, testing, and readiness assessment explicit.

## The Outcome

`docs/autonomous-trading-production-readiness-plan.md` is now the promoted canonical plan. The next safe milestone is production-grade `paper_trading` plus `live_preview`, with zero autonomous live submission.

## Unknowns And Limits

- This was a documentation and planning round, not an implementation round.
- The readiness estimate remains a planning estimate until the scorecard is backed by automated checks and artifacts.
- Live autonomous trading remains out of scope until the plan's later gates are implemented and operator-approved.
