# Round 1 Candidate AB: Synthesized Production-Readiness Plan

## Current Position

The repository is preview-first. Autonomous trading currently supports scheduling, scoring, paper fills, and live previews, but docs state that auto-trading does not submit live orders. Live guarded and live autonomous concepts exist, but live execution remains submit-gated.

Production readiness is not yet achieved. The main blockers are independent fair-value synthesis, calibration, execution-realistic paper trading, kill switches, pause/resume/reconciliation, and complete enforcement of risk limits such as `max_daily_loss_usdc`.

Estimated readiness today: 35-45% for production-grade autonomous trading, assuming live order submission remains blocked.

## Non-Negotiable Invariants

1. No live order submission during this work. Paper trading and live previews are allowed. Live submission remains blocked unless an exact preview is explicitly approved, or a later proven `live_autonomous` gate is deliberately enabled.
2. Independent forecast before venue price. Venue prices must not be used as fair-value evidence until an independent forecast exists.
3. Preview-first execution. Every live action must produce an auditable preview with market, side, size, price, expiration, rationale, risk impact, and gate status.
4. Gated autonomy. Capabilities must progress through explicit gates. No code path may bypass the active gate.
5. Operator interruptibility. Pause, resume, kill switch, and reconciliation must be reliable before any live autonomous operation.
6. Auditability. Every recommendation, preview, simulated fill, skipped trade, risk block, and operator action must be logged with enough context for later review.

## Audience Responsibilities

Maintainers own implementation quality, tests, gate enforcement, and documentation accuracy.

Operator-users own configuration, bankroll limits, approval decisions, monitoring, and intervention.

Future autonomous agents must treat this document as binding. They should improve readiness only by adding evidence, tests, controls, or narrower risk surfaces. They must not loosen live-trading constraints without explicit operator instruction.

## Gate Model

### `research_only`

Allowed:

- Universe scans.
- Market classification.
- Evidence gathering.
- Independent probability estimates.
- Fair-value memo drafts.
- Watchlists.

Blocked:

- Paper fills.
- Live previews.
- Live orders.

Exit evidence:

- Independent forecast format exists.
- Venue-price contamination guard exists.
- Research outputs are reproducible and logged.

### `paper_trading`

Allowed:

- Strategy selection.
- Paper orders.
- Paper fills.
- Portfolio simulation.
- Risk checks.
- Scheduled autonomous runs.

Blocked:

- Live previews unless separately enabled.
- Live orders.

Exit evidence:

- Paper execution model includes spread, slippage, partial fills, stale books, and failed fills.
- Daily loss, exposure, and concentration limits are enforced.
- Reconciliation jobs prove simulated state consistency.

### `live_preview`

Allowed:

- Live order previews.
- Operator review.
- Manual approval workflow.
- Dry-run risk impact checks.

Blocked:

- Live submission from autonomous loop.
- Any preview mutation after approval.

Exit evidence:

- Exact preview approval mechanism exists.
- Preview hash or immutable order intent is recorded.
- Approval cannot authorize a different order than the preview.

### `live_guarded`

Allowed:

- Live submission only after explicit approval of the exact preview.
- Small-size constrained trading.
- Mandatory post-trade reconciliation.

Blocked:

- Fully autonomous live submission.
- Unbounded retries.
- Trading after kill switch, stale data, failed reconciliation, or breached risk limit.

Exit evidence:

- Successful guarded pilot with predefined limits.
- No unresolved reconciliation breaks.
- Complete audit trail across preview, approval, submission, fill, and position state.

### `live_autonomous`

Allowed:

- Autonomous live submission only within proven, deliberately enabled constraints.

Required before enabling:

- Independent fair-value engine is production-grade.
- Calibration and Brier tracking exist.
- Risk controls are fully enforced.
- Kill switch and pause/resume are tested.
- Paper trading has demonstrated execution realism.
- Guarded pilot has passed.
- Operator deliberately enables this gate.

Blocked:

- Default enablement.
- Silent escalation from any lower gate.

## Production Readiness Phases

### 1. Mandate, Safety, and Configuration

Goal: make the trading mandate explicit and enforceable.

Required work:

- Define bankroll, market categories, max position, max order, max daily loss, max exposure, max correlated exposure, and allowed gates.
- Make live submission blocked by default.
- Require explicit operator configuration for every gate above `paper_trading`.
- Validate config at startup and fail closed.

Acceptance artifacts:

- Config schema.
- Example safe config.
- Startup validation tests.
- Gate enforcement tests.

### 2. Universe Reliability

Goal: make market discovery dependable enough for automation.

Required work:

- Separate market discovery from market recommendation.
- Track liquidity, spread, resolution date, ambiguity, category, event type, and data freshness.
- Exclude markets with unclear rules, poor liquidity, stale books, or high resolution ambiguity.
- Persist scan inputs and outputs.

Acceptance artifacts:

- Universe scan log.
- Exclusion reason taxonomy.
- Tests for stale, illiquid, ambiguous, and expired markets.

### 3. Independent Actuarial Fair Value

Goal: produce fair values without contamination from venue prices.

Required work:

- Implement independent forecast synthesis before reading or using venue price.
- Record evidence, base rates, model assumptions, uncertainty, and final probability.
- Add contamination guard that prevents venue price from entering the forecast stage.
- Track forecast version and source set.

Acceptance artifacts:

- Fair-value memo schema.
- Contamination guard tests.
- Forecast provenance logs.
- At least one end-to-end research fixture.

### 4. Strategy and Portfolio Construction

Goal: turn independent fair value into constrained trade candidates.

Required work:

- Compute edge only after independent probability exists.
- Apply fees, spread, liquidity, slippage estimate, and uncertainty haircut.
- Size positions using bankroll and risk limits.
- Enforce concentration, category, correlated-event, and daily-loss limits.
- Log rejected candidates with reasons.

Acceptance artifacts:

- Strategy decision record.
- Risk rejection tests.
- Portfolio exposure report.
- Deterministic sizing tests.

### 5. Execution Realism

Goal: make paper trading meaningfully approximate live trading.

Required work:

- Replace simplistic paper fills with execution-aware simulation.
- Model bid/ask spread, depth, partial fills, stale books, failed fills, latency, and order expiry.
- Distinguish intended orders, submitted paper orders, simulated fills, and resulting positions.
- Reconcile paper positions after every run.

Acceptance artifacts:

- Paper execution model docs.
- Simulated fill tests.
- Reconciliation tests.
- Backtest comparison between optimistic and execution-realistic fills.

### 6. Risk Controls and Kill Switches

Goal: ensure the system fails closed.

Required work:

- Fully enforce `max_daily_loss_usdc`.
- Add global pause, resume, and kill switch.
- Block trading on stale data, failed reconciliation, config errors, breached risk limits, missing forecast, or gate mismatch.
- Make kill switch state persistent and visible.

Acceptance artifacts:

- Kill switch tests.
- Pause/resume tests.
- Daily loss enforcement tests.
- Fail-closed integration tests.

### 7. Automation Hardening

Goal: make scheduled operation predictable and recoverable.

Required work:

- Add idempotent scheduled runs.
- Prevent overlapping runs.
- Persist run state.
- Add retry limits and backoff.
- Support safe recovery after process restart.

Acceptance artifacts:

- Scheduler tests.
- Locking/idempotency tests.
- Restart recovery test.
- Run-state audit log.

### 8. Observability and Audit

Goal: make behavior inspectable by maintainers and operators.

Required work:

- Log every scan, forecast, score, decision, preview, fill, rejection, risk block, and operator approval.
- Add structured event IDs and run IDs.
- Create operator-facing status summary.
- Track gate, config hash, forecast version, and portfolio state per run.

Acceptance artifacts:

- Audit log schema.
- Example run transcript.
- Operator status report.
- Tests for required audit fields.

### 9. Backtesting and Calibration

Goal: prove that forecasts and strategies are measurable.

Required work:

- Store forecasts with timestamps and market outcomes.
- Add Brier score, calibration buckets, and realized return tracking.
- Separate model evaluation from trading PnL.
- Detect drift and overconfidence.
- Compare paper/live previews against later outcomes.

Acceptance artifacts:

- Calibration dashboard or report.
- Brier score computation tests.
- Historical forecast fixture.
- Model-performance summary.

### 10. Guarded Live Pilot

Goal: validate the full live workflow without autonomous submission.

Required work:

- Enable `live_preview`.
- Require exact preview approval before any live submission.
- Use very small limits.
- Reconcile immediately after each approved order.
- Stop on any mismatch.

Acceptance artifacts:

- Approved preview records.
- Submission/fill/reconciliation records.
- Pilot report.
- Incident log, even if empty.

### 11. Limited Live Autonomous

Goal: allow carefully bounded autonomous live operation only after prior gates pass.

Required work:

- Add deliberate `live_autonomous` enablement.
- Restrict to narrow market types with strong historical performance.
- Use conservative sizing and daily loss caps.
- Require continuous monitoring and automatic downgrade on anomalies.
- Keep operator kill switch active.

Acceptance artifacts:

- Live-autonomous readiness review.
- Passed guarded pilot evidence.
- Calibration threshold report.
- Autonomous rollback test.
- Operator signoff.

## Test Strategy

Automated tests:

- Gate enforcement.
- Config validation.
- Fair-value contamination guard.
- Risk limits.
- Daily loss enforcement.
- Kill switch and pause/resume.
- Paper execution realism.
- Reconciliation.
- Scheduler idempotency.
- Audit log completeness.
- Calibration calculations.

Manual tests:

- Operator preview approval.
- Kill switch during active run.
- Restart after interrupted run.
- Reconciliation mismatch handling.
- Guarded live pilot dry run.

Regression fixtures:

- Illiquid market.
- Stale market.
- Ambiguous resolution market.
- Missing forecast.
- Venue-price contamination attempt.
- Risk-limit breach.
- Partial fill.
- Failed fill.
- Daily loss breach.
- Gate mismatch.

## Production Readiness Scorecard

| Area | Current State | Target Before Live Guarded | Target Before Live Autonomous |
|---|---|---:|---:|
| Gate enforcement | Partial concepts exist | Mandatory | Mandatory |
| Live submission boundary | Preview/submit gated | Exact-preview approval | Deliberate autonomous gate |
| Independent fair value | Placeholder synthesis | Required | Production-grade |
| Venue-price contamination guard | Missing | Required | Required |
| Universe reliability | Heuristic scoring | Reliable exclusions | Monitored reliability |
| Paper execution realism | Not realistic enough | Spread/slippage/partial fills | Proven against live previews |
| Risk limits | Incomplete daily loss enforcement | Fully enforced | Fully enforced |
| Kill switch / pause / resume | TODO | Required | Required |
| Reconciliation | TODO | Required | Required |
| Audit trail | Partial | Complete run audit | Complete trade lifecycle audit |
| Calibration / Brier | Missing | Started | Operational thresholded |
| Automation hardening | Scheduled paper runs exist | Idempotent and recoverable | Continuously monitored |

Overall status: not production-ready for live autonomous trading.

Nearest safe milestone: production-grade `paper_trading` plus `live_preview` without autonomous submission.

## Immediate Implementation Sequence

1. Lock the live boundary.
2. Add fair-value contamination guard.
3. Make risk fail closed.
4. Improve paper execution.
5. Add audit and operator status.
6. Add calibration tracking.
7. Run a guarded-preview pilot.
