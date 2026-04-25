# Round 1 Candidate B: Evidence-Gated Production Readiness Plan

## Scope

This plan defines the production-readiness path for autonomous Polymarket trading. It is written for maintainers, operator-users, and future autonomous agents.

The goal is not immediate live autonomy. The goal is an evidence-gated path from research and paper trading to guarded live previews, then optionally to constrained live-autonomous execution after deliberate approval.

## Top-Level Invariants

1. No live order submission during this work.
2. Paper trading and live order previews are allowed.
3. Live submission is blocked unless an operator explicitly approves the exact generated live preview, or a later `live_autonomous` gate is deliberately enabled after all required evidence artifacts pass review.
4. Venue prices must not be used as fair-value evidence before an independent forecast exists.
5. Every trade recommendation must be reconstructable from durable artifacts: market snapshot, forecast, strategy rationale, risk checks, preview ticket, and audit log.
6. Autonomous agents must fail closed. Missing data, stale forecasts, unresolved reconciliation, ambiguous resolution rules, or risk-limit uncertainty must block execution.
7. Production readiness is artifact-based, not confidence-based.

## Audience Responsibilities

Maintainers own code quality, tests, safety gates, observability, data integrity, and release control.

Operator-users own mandate settings, market allowlists/blocklists, capital limits, manual approvals, incident response, and final authorization for any live behavior.

Future autonomous agents must read the canonical plan, obey the invariants, emit required artifacts, refuse unsafe actions, and escalate ambiguity instead of guessing.

## Gate Model

| Gate | Live Orders | Purpose | Promotion Evidence |
|---|---:|---|---|
| `research_only` | No | Discover markets, build forecasts, classify risks | forecast artifacts, source logs, market taxonomy, blocked-market reasons |
| `paper_trading` | No | Simulate strategy decisions and portfolio effects | paper tickets, simulated fills, PnL attribution, risk-limit simulations |
| `live_preview` | No | Generate live-ready orders without submitting | exact preview tickets, operator review logs, reconciliation checks |
| `live_guarded` | Only exact approved preview | Allow manual approval of specific orders | signed approvals, post-trade reconciliation, incident-free trial window |
| `live_autonomous` | Yes, constrained | Permit bounded autonomous submission | all previous evidence, kill-switch drills, calibration report, explicit enablement record |

Default gate: `research_only`.

## Phase Plan

### Phase 1: Canonical Safety Boundary

Acceptance artifacts:

- Mode specification.
- Unit tests proving live submission is blocked by default.
- Dry-run logs showing paper and preview paths still work.
- Operator-facing explanation of each mode.

### Phase 2: Actuarial Forecast Enforcement

Acceptance artifacts:

- Forecast schema.
- Tests rejecting price-derived forecasts.
- Example forecast artifacts for at least three markets.
- Audit log showing forecast creation precedes venue-price comparison.

### Phase 3: Universe Reliability and Market Eligibility

Acceptance artifacts:

- Market eligibility report.
- Blocked-market examples with reasons.
- Stale-data and ambiguity tests.
- Operator-reviewed universe policy.

### Phase 4: Strategy, Portfolio, and Risk Controls

Acceptance artifacts:

- Risk-limit simulation report.
- Portfolio concentration tests.
- Kill-switch drill logs.
- Paper-trading tickets showing rejected trades when limits bind.

### Phase 5: Execution Realism and Reconciliation

Acceptance artifacts:

- Dry-run ticket format.
- Reconciliation output samples.
- Duplicate-order tests.
- Simulated exchange-failure report.

### Phase 6: Audit, Operator Review, and Agent Operability

Acceptance artifacts:

- Audit log schema.
- Operator signoff template.
- Agent runbook section.
- Replay test reconstructing a decision from logs only.

### Phase 7: Backtesting, Calibration, and Readiness Scoring

Acceptance artifacts:

- Backtest report.
- Calibration report.
- Failure analysis.
- Readiness scorecard.

## Test and Check Strategy

Required automated checks:

- Live submission blocked by default.
- Exact-preview approval required for `live_guarded`.
- `live_autonomous` unavailable without explicit gate enablement.
- Forecast artifact required before fair-value comparison.
- Venue prices excluded from pre-forecast evidence.
- Stale market data blocks recommendations.
- Risk-limit breaches block previews.
- Reconciliation mismatches block further execution.
- Duplicate submit attempts are idempotently rejected.
- Kill switch overrides every trading path.

Required manual checks:

- Operator approval drill.
- Incident-response drill.
- Reconciliation review.
- Sample forecast review.
- Blocked-market review.

## Readiness Scoring Method

Score each domain from 0 to 3: safety gates, forecast independence, risk controls, execution realism, auditability, calibration, and operability.

Minimum promotion thresholds:

- `paper_trading`: no domain below 1, safety gates at 2.
- `live_preview`: no domain below 2, forecast independence at 3.
- `live_guarded`: safety gates, risk controls, execution realism, and auditability at 3.
- `live_autonomous`: all domains at 3 plus explicit operator enablement.

## Immediate Next Implementation Sequence

1. Create the canonical markdown plan.
2. Implement the execution-mode enum and default all runs to `research_only`.
3. Add hard tests proving live submission is blocked unless the gate permits it.
4. Define the forecast artifact schema and enforce forecast-before-price-comparison.
5. Add dry-run ticket generation for paper and live-preview modes.
6. Add risk-limit simulation fixtures and blocked-trade examples.
7. Add reconciliation output format and mismatch-blocking behavior.
8. Produce the first readiness scorecard using current code and mark unknowns as blockers.
9. Run a paper-trading rehearsal and collect logs, tickets, forecasts, risk checks, and reconciliation outputs.
10. Review promotion eligibility only after artifacts exist.
