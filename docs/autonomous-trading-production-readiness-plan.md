# Autonomous Trading Production-Readiness Plan

This plan defines the path from the current Polymarket paper-trading prototype to a production-grade autonomous trading system. It is written for maintainers, operator-users, and future autonomous agents.

The goal is not immediate live autonomy. The goal is an evidence-gated path from research and paper trading to guarded live previews, then only later to tightly bounded live-autonomous execution if the required evidence, controls, and operator approvals exist.

## Current Position

The repository is preview-first. Autonomous trading currently supports scheduling, heuristic scoring, paper fills, marked paper positions, live execution gates, and live previews. The current documented boundary remains: autonomous trading does not submit live orders by default, and live execution stays behind preview/submit tools.

Production readiness is not yet achieved. The main blockers are independent fair-value synthesis, market-price contamination controls, calibration, execution-realistic paper trading, kill switches, pause/resume/reconciliation, and complete enforcement of loss limits such as `max_daily_loss_usdc`.

Estimated readiness today: 35-45% for production-grade autonomous trading, assuming live order submission remains blocked. The nearest safe milestone is production-grade `paper_trading` plus `live_preview` without autonomous submission.

## Non-Negotiable Invariants

1. No live order submission by default. Paper trading and live previews are allowed. Live submission remains blocked unless an exact preview is explicitly approved, or a later proven `live_autonomous` gate is deliberately enabled.
2. Independent forecast before venue price. Venue prices, order books, recent trades, and market-implied odds must not be used as fair-value evidence until an independent forecast exists. They may be used afterward for edge calculation, execution planning, and sanity checks.
3. Preview-first execution. Every live action must produce an auditable preview with market, side, size, price, expiration, rationale, risk impact, and gate status.
4. Gated autonomy. Capabilities progress through explicit gates. No code path may bypass the active gate.
5. Fail-closed behavior. Missing data, stale snapshots, ambiguous resolution wording, unresolved reconciliation, breached risk limits, credential uncertainty, policy-hash drift, or preview warnings block execution.
6. Operator interruptibility. Pause, resume, kill switch, and reconciliation must be reliable before any live autonomous operation.
7. Auditability. Every recommendation, preview, simulated fill, skipped trade, risk block, operator action, order, fill, cancel, and reconciliation must be logged with enough context for later review.

## Audience Responsibilities

Maintainers own implementation quality, tests, gate enforcement, data integrity, observability, and documentation accuracy.

Operator-users own mandate settings, bankroll limits, allowlists/blocklists, approval decisions, monitoring, incident response, and final authorization for any live behavior.

Future autonomous agents must treat this document as binding. They may improve readiness only by adding evidence, tests, controls, or narrower risk surfaces. They must not loosen live-trading constraints without explicit operator instruction.

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

- Independent forecast artifact format exists.
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

- Live submission from the autonomous loop.
- Any preview mutation after approval.

Exit evidence:

- Exact-preview approval mechanism exists.
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

- Define bankroll, market categories, max position, max order, max daily loss, max session loss, max exposure, max correlated exposure, allowed gates, and allowed actions.
- Make live submission blocked by default.
- Require explicit operator configuration for every gate above `paper_trading`.
- Validate config at startup and fail closed.
- Store mandate snapshot and policy hash on every session and decision.

Acceptance artifacts:

- Config schema.
- Example safe config.
- Startup validation tests.
- Gate enforcement tests.
- Policy-hash drift test.

### 2. Universe Reliability

Goal: make market discovery broad enough to find opportunities and strict enough to avoid unusable markets.

Required work:

- Separate market discovery from market recommendation.
- Track liquidity, spread, resolution date, ambiguity, category, event type, data freshness, and end-date confidence.
- Exclude markets with unclear rules, weak resolution sources, poor liquidity, stale books, or high ambiguity.
- Persist scan inputs, outputs, coverage metrics, and exclusion reasons.
- Improve many-market event detection for elections, tournaments, sports, weather ladders, price ladders, and participant fields.

Acceptance artifacts:

- Universe scan log.
- Exclusion reason taxonomy.
- Coverage report: scanned, active, eligible, excluded, clustered, and short-horizon markets.
- Tests for stale, illiquid, ambiguous, expired, multi-market, and short-horizon markets.

### 3. Independent Actuarial Fair Value

Goal: produce fair values without contamination from venue prices.

Required work:

- Implement independent forecast synthesis before reading or using venue price.
- Record resolution wording, outcome set, base rates, current evidence, disconfirming evidence, model assumptions, uncertainty, numerical checks, and final probability.
- Add a contamination guard that prevents venue price, orderbook, spread, or recent trade data from entering the forecast stage.
- Track forecast version, source set, forecast date, horizon, and freshness.
- Compare independent probability to venue price only after the forecast artifact is sealed.

Acceptance artifacts:

- Forecast artifact schema.
- Contamination guard tests.
- Forecast provenance logs.
- At least one end-to-end research fixture.
- Tests rejecting trade candidates whose only edge source is discovery score, momentum, or heuristic ranking.

### 4. Strategy and Portfolio Construction

Goal: turn independent fair value into constrained trade candidates.

Required work:

- Compute edge only after independent probability exists.
- Apply fees, spread, liquidity, slippage estimate, and uncertainty haircut.
- Size positions using bankroll, expected value, downside, liquidity, and risk limits.
- Enforce concentration, category, correlated-event, thesis-level, daily-loss, and session-loss limits.
- Log rejected and no-trade candidates with reasons.

Acceptance artifacts:

- Strategy decision record.
- Risk rejection tests.
- Portfolio exposure report.
- Deterministic sizing tests.
- No-trade decision examples.

### 5. Execution Realism

Goal: make paper trading meaningfully approximate live trading.

Required work:

- Replace simplistic paper fills with execution-aware simulation.
- Model bid/ask spread, depth, fees, partial fills, stale books, failed fills, latency, and order expiry.
- Distinguish intended orders, submitted paper orders, simulated fills, unfilled orders, and resulting positions.
- Reconcile paper positions after every run.
- Compare optimistic paper fills against execution-realistic fills.

Acceptance artifacts:

- Paper execution model docs.
- Simulated fill tests.
- Reconciliation tests.
- Backtest comparison between optimistic and execution-realistic fills.
- Missed-fill and adverse-selection report.

### 6. Risk Controls and Kill Switches

Goal: ensure the system fails closed.

Required work:

- Fully enforce `max_daily_loss_usdc`, max session loss, per-market loss, per-thesis loss, and open-order capital.
- Add persistent global pause, resume, and kill switch.
- Block trading on stale data, failed reconciliation, config errors, breached risk limits, missing forecast, gate mismatch, or policy-hash drift.
- Make kill switch state persistent, visible, and higher priority than every trading path.
- Add churn controls for repeated stop-losses and same-market re-entry.

Acceptance artifacts:

- Kill switch tests.
- Pause/resume tests.
- Daily/session loss enforcement tests.
- Fail-closed integration tests.
- Re-entry cooldown regression tests.

### 7. Automation Hardening

Goal: make scheduled operation predictable and recoverable.

Required work:

- Add idempotent scheduled runs.
- Prevent overlapping runs with locking or leader election.
- Persist run state.
- Add retry limits and backoff.
- Support safe recovery after process restart.
- Keep Codex app automations in paper, triage, and analyst mode until service hardening is complete.

Acceptance artifacts:

- Scheduler tests.
- Locking/idempotency tests.
- Restart recovery test.
- Run-state audit log.
- Duplicate-run prevention fixture.

### 8. Observability and Audit

Goal: make behavior inspectable by maintainers and operators.

Required work:

- Log every scan, forecast, score, decision, preview, fill, rejection, risk block, approval, submission, cancellation, and reconciliation.
- Add structured event IDs, run IDs, session IDs, policy hashes, gate names, and config hashes.
- Create operator-facing status summaries.
- Track forecast version and portfolio state per run.
- Export session audit reports as JSON and markdown.

Acceptance artifacts:

- Audit log schema.
- Example run transcript.
- Operator status report.
- Tests for required audit fields.
- Session audit export fixture.

### 9. Backtesting and Calibration

Goal: prove that forecasts and strategies are measurable.

Required work:

- Store forecasts with timestamps and resolved outcomes.
- Add Brier score, log loss, calibration buckets, closing-line comparison where available, and realized return tracking.
- Separate model evaluation from trading PnL.
- Detect drift and overconfidence.
- Compare paper/live previews against later outcomes.

Acceptance artifacts:

- Calibration report or dashboard.
- Brier score computation tests.
- Historical forecast fixture.
- Model-performance summary.
- Block rule for market classes with poor calibration.

### 10. Guarded Live Pilot

Goal: validate the full live workflow without autonomous submission.

Required work:

- Enable `live_preview`.
- Require exact preview approval before any live submission.
- Use very small limits and whitelisted market classes.
- Reconcile immediately after each approved order.
- Stop on any mismatch, stale data, risk breach, or unresolved order state.

Acceptance artifacts:

- Approved preview records.
- Submission/fill/reconciliation records.
- Pilot report.
- Incident log, even if empty.
- Written stop rule for the pilot.

### 11. Limited Live Autonomous

Goal: allow carefully bounded autonomous live operation only after prior gates pass.

Required work:

- Add deliberate `live_autonomous` enablement.
- Restrict to narrow market types with strong historical performance.
- Use conservative sizing and daily loss caps even for aggressive user mandates.
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
- Exact-preview approval matching.
- Fair-value contamination guard.
- Forecast freshness and provenance.
- Risk limits.
- Daily/session loss enforcement.
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
- Incident-response drill.

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
- Duplicate automation invocation.

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

Current practical target: production-grade `paper_trading` plus `live_preview` with zero autonomous live submission.

## Immediate Implementation Sequence

1. Lock the live boundary: centralize gate checks, prove autonomous code cannot submit live orders below `live_guarded`, and require exact-preview approval for any future guarded submission.
2. Add fair-value contamination guard: split independent forecast generation from venue-price loading, fail trade candidates without forecasts, and test price-present/forecast-missing cases.
3. Make risk fail closed: enforce `max_daily_loss_usdc`, add persistent kill switch and pause/resume, and block runs on breached limits or unresolved reconciliation.
4. Improve paper execution: add spread, slippage, partial-fill, stale-book, failed-fill, and expiry behavior.
5. Add audit and operator status: emit structured run IDs and event IDs, log all forecast/decision/risk/preview/fill/skip/block events, and produce concise operator summaries.
6. Add calibration tracking: persist timestamped forecasts, compute Brier/log-loss/calibration buckets once outcomes resolve, and keep calibration separate from PnL.
7. Run a guarded-preview pilot: enable `live_preview` only, generate exact previews, require explicit approval before any guarded live submission, and treat any mismatch as a stop condition.
