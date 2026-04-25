# Round 1 Candidate A: Autonomous Trading Production-Readiness Plan

## Objective

Move the Polymarket plugin from a controlled paper-mode autonomous trading prototype to a production-ready autonomous trading system. "Production-ready" means the system can run a user mandate with budget, timeframe, and risk profile; discover eligible markets; make independent fair-value forecasts; size and monitor positions; execute only inside explicit safety gates; and leave a complete audit trail.

## Current State

The repository already has important primitives:

- Full-universe discovery and event-cluster detection.
- Opportunity classification and market-structure triage.
- SQLite state for markets, universe runs, research, thesis links, previews, orders, auto-trading sessions, decisions, paper fills, and paper positions.
- Paper auto-trading sessions with budget, timeframe, risk profile, paper fills, marked positions, realized/unrealized PnL, exits, and scheduling.
- Automation gate that can stay quiet, run a heartbeat, notify material changes, or notify safety issues.
- Guarded live execution path where live decisions can produce previews, and submission remains gated.
- Direct local binary workflow for this Windows environment where global npm is broken.

The current system is not production-ready because heuristic candidate scoring is not a calibrated fair-value model, paper fills are not execution-realistic, and operational safety has not been proven under real-money failure modes.

## Non-Negotiable Safety Boundary

Until later gates are explicitly passed:

- `paper` mode may write paper fills and position marks.
- `live_guarded` may create live previews.
- Live submission is blocked unless the user explicitly approves one exact preview.
- `live_autonomous` must remain unavailable for unattended real-money submission.
- Any stale data, missing credential state, policy mismatch, unresolved preview warning, unknown resolution wording, or database inconsistency fails closed.

## Phase 0: Mandate Contract and Safety Invariants

Implement the mandate as an enforceable contract, not a prompt preference.

Tasks:

- Define required mandate fields: budget, timeframe, risk profile, mode, allowed actions, and session end time.
- Normalize risk profiles into explicit numeric limits: max single order, max total exposure, max correlated thesis exposure, max open positions, max daily loss, max session loss, max spread, minimum liquidity, and max market horizon.
- Add immutable policy-hash tracking to each session and decision.
- Add a session pause/resume/kill-switch model.
- Add fail-closed invariants for stale snapshots, missing price, wide spread, unknown outcome set, unresolved preview blocker, and state-db write failure.

Acceptance criteria:

- A session cannot start without a complete mandate.
- A decision stores the mandate snapshot and policy hash used to create it.
- If the policy hash changes, old decisions cannot execute without re-evaluation.
- A kill switch blocks new proposals, previews, and submissions immediately.
- Unit tests cover fail-closed behavior for every invariant.

## Phase 1: Market Universe Reliability

Make discovery broad enough to find volatile opportunities and strict enough to avoid garbage.

Tasks:

- Persist every universe run with source, filters, timestamps, count, and error state.
- Add coverage metrics: markets scanned, active markets, eligible markets, excluded markets by reason, multi-market event clusters, sports/crypto/weather/politics share, and short-horizon count.
- Add market freshness checks for orderbook age, price age, recent trade age, and end-date confidence.
- Add event-level grouping for many-market structures such as elections, sports tournaments, price ladders, weather ladders, and participant fields.
- Add volatility and outsider-upside screens that distinguish "can double soon" from "cheap because impossible."

Acceptance criteria:

- A 24-hour aggressive session can explain why each market was included or excluded.
- Discovery reports include coverage deltas from previous runs.
- Event clusters expose participant count, price distribution, longshot count, volume distribution, and near-term catalyst fields.
- Tests cover known examples: sports matches, crypto up/down, weather ladders, geopolitical date ladders, and multi-participant winner markets.

## Phase 2: Independent Actuarial Fair-Value Engine

Separate market discovery from trade edge. A trade is not allowed because it is volatile; it is allowed only when an independent forecast creates a positive expected-value thesis or a deliberately labeled experimental paper thesis.

Tasks:

- Add a forecast artifact type linked to market, outcome, session, evidence, and decision.
- For each forecast, store the exact resolution wording, forecast date, time window, outcome set, and whether outcomes are mutually exclusive/exhaustive.
- Require base-rate evidence, current evidence, disconfirming evidence, and a strongest counter-case.
- Require at least one explicit numerical check: timeline feasibility, scenario-weighted expected value, normalization, threshold math, or base-rate adjustment.
- Prevent market-price contamination by storing whether venue price was hidden until after fair probability was set.
- Compare independent fair probability to venue price only after the forecast is saved.

Acceptance criteria:

- Any live-mode entry decision must reference a forecast artifact newer than the configured freshness threshold.
- Forecast artifacts include a market-price contamination check.
- Multi-outcome forecasts sum to exactly 100% when mutually exclusive/exhaustive, or explicitly state why they do not.
- Tests reject a live decision whose only edge source is discovery score or market momentum.
- Backtest/paper reports track forecast quality using Brier score, log loss, calibration buckets, and closing-line comparison where available.

## Phase 3: Strategy and Portfolio Construction

Turn forecasts into constrained portfolio decisions.

Tasks:

- Define strategy archetypes: short-horizon catalyst, longshot convexity, ladder mispricing, market-making/reward, resolution watch, and exit-only risk reduction.
- Map risk profiles to portfolio rules: conservative prioritizes liquidity and small drawdown; balanced allows moderate edge/volatility; aggressive allows longshot convexity with strict sizing.
- Add thesis-level exposure accounting across correlated markets.
- Add expected value, downside, liquidity-adjusted edge, and time-to-resolution fields to proposals.
- Add no-trade decisions as first-class artifacts.

Acceptance criteria:

- Each proposal states thesis, fair probability, market price, edge, max loss, target exit, invalidation trigger, and next check time.
- Correlated markets cannot silently consume the full budget through duplicated thesis exposure.
- Aggressive mode can propose outsiders, but only with explicit small sizing and a catalyst/forecast rationale.
- No-trade decisions are persisted with blockers so the system can learn from skipped opportunities.

## Phase 4: Execution Realism and Paper/Live Reconciliation

Make paper results less misleading before using real money.

Tasks:

- Model bid/ask spread, orderbook depth, partial fills, fees, slippage, stale quotes, and unfilled passive orders.
- Distinguish proposal, preview, submitted order, accepted order, partial fill, full fill, cancel requested, canceled, expired, and not-on-venue states.
- Reconcile paper decisions against live orderbook snapshots at decision time.
- Add shadow-mode live previews for paper decisions without submitting.
- Track missed fills and adverse selection.

Acceptance criteria:

- Paper PnL report separates mark-to-market PnL, realized PnL, simulated slippage, and unfilled opportunity cost.
- A paper buy cannot assume a fill at a price not available in the contemporaneous orderbook.
- Live preview output can be reconstructed from the decision and policy snapshot.
- The system can compare simulated fill assumptions against what a real limit order likely would have done.

## Phase 5: Risk Controls and Kill Switches

Make losses bounded by code, not by hope.

Tasks:

- Enforce session budget, committed capital, open-order capital, realized loss, unrealized loss, per-market loss, per-thesis loss, and daily loss.
- Add stop-loss grace and re-entry cooldown controls per risk profile.
- Add near-resolution behavior: stop opening new positions when liquidity or resolution ambiguity deteriorates.
- Add global kill switches: trading disabled, previews disabled, session paused, database read-only, credential unavailable, and policy hash changed.
- Add alert thresholds for drawdown, churn, repeated stop-losses, repeated same-market entries, and stale automation.

Acceptance criteria:

- The risk ledger can explain spent budget, remaining budget, open exposure, realized PnL, unrealized PnL, and blocked capital.
- Re-entry cooldown prevents paper and live churn after stop-loss exits.
- Any daily/session loss breach blocks entries and allows only risk-reducing exits/cancels.
- Safety alerts are material-change notifications, not noisy heartbeat spam.

## Phase 6: Automation and Service Hardening

Move from ad hoc Codex heartbeats to an operator-grade runtime.

Tasks:

- Keep Codex automations in paper, triage, and analyst mode until service hardening is complete.
- Build a daemon/service mode for unattended loops with locking, backoff, retries, structured logs, and health checks.
- Add single-writer DB locking or leader election to prevent duplicate session runs.
- Add idempotency keys for every decision, preview, order, and fill.
- Add heartbeat schedules plus per-market follow-up schedules stored in SQLite.

Acceptance criteria:

- Two concurrent automation invocations cannot double-buy or duplicate a proposal.
- If the process crashes mid-iteration, restart behavior is deterministic and idempotent.
- Health checks expose last universe run, last session run, next run, automation decision, safety status, and DB write status.
- Quiet runs remain quiet; material changes notify with actionable reasons.

## Phase 7: Observability, Audit, and Operator Review

Make every decision reviewable after the fact.

Tasks:

- Add a single session report that includes mandate, discovery coverage, forecast artifacts, decisions, positions, PnL, blocked decisions, proposals, exits, and schedule.
- Add audit export for a session as JSON and markdown.
- Add operator review tools for approval, rejection, pause, resume, and kill switch.
- Add incident log templates for bad data, unexpected order state, realized loss breach, and automation failure.

Acceptance criteria:

- A cold reviewer can reconstruct why every proposed trade existed.
- Every live preview has an explicit approval status and approver/time if approved.
- Every material automation notification links to the decision/session evidence.
- Audit export contains enough data to reproduce budget and PnL calculations.

## Phase 8: Backtesting, Calibration, and Simulation

Prove the decision process before live money.

Tasks:

- Build historical replay against stored universe snapshots and later historical Polymarket data if available.
- Add synthetic scenario tests: fast price reversal, stale orderbook, market resolved early, DB write failure, network failure, duplicate automation, and extreme drawdown.
- Track forecast calibration by market class and horizon.
- Track strategy performance separately from forecast performance.
- Add regression fixtures for the current active paper session failure modes.

Acceptance criteria:

- Paper and replay reports include Brier/log-loss or equivalent calibration metrics.
- Strategy PnL is decomposed into forecast edge, execution cost, slippage, and timing.
- No live-guarded pilot can start until core scenario tests pass.
- Repeated bad calibration in a class blocks live trading for that class.

## Phase 9: Live Guarded Pilot

Allow real-money previews and explicit user-approved submissions only.

Tasks:

- Restrict to tiny budgets, whitelisted market classes, and short session windows.
- Require explicit approval for each preview.
- Require a fresh forecast, fresh orderbook, clean policy hash, and clean risk ledger before each approval.
- Add post-trade reconciliation against venue order/fill state.
- Add automatic cancel of stale live orders.

Acceptance criteria:

- The user approves an exact preview, not a vague strategy.
- Submission is blocked if any preview warning, risk blocker, stale data, or policy drift exists.
- The system reconciles order status and fills after submission.
- Pilot has a written stop rule: maximum loss, maximum unexpected state count, maximum unreconciled order age, and maximum stale data events.

## Phase 10: Limited Live Autonomous Pilot

Only after live guarded behavior is boring and well-reconciled, test small fully autonomous live execution.

Tasks:

- Create a separate live-autonomous policy with lower caps than live guarded.
- Restrict to market classes with proven calibration and execution behavior.
- Require continuous health checks and immediate kill switch on any uncertainty.
- Add human review after every autonomous fill during pilot.
- Gradually expand only after objective metrics pass.

Acceptance criteria:

- Live autonomous is disabled by default and requires deliberate configuration.
- The pilot cannot exceed budget, market, thesis, daily loss, or session loss caps.
- Any unexplained execution discrepancy disables autonomy.
- Expansion requires documented calibration, reconciliation, and incident metrics.

## Current Readiness Assessment

Current state is approximately a controlled paper prototype, not a production trader.

Estimated readiness:

- Discovery and state memory: medium.
- Paper session control plane: medium.
- Independent fair-value forecasting: low.
- Execution realism: low.
- Risk and kill switches: medium-low.
- Automation hardening: medium-low.
- Live guarded readiness: low-medium.
- Live autonomous readiness: low.

Overall: around 35-45% of the way to production, depending on how strict the live-autonomous definition is. The main work is not UI or a single missing MCP tool; it is turning a promising paper loop into a calibrated, auditable, fail-closed trading system.

## Immediate Next Steps

1. Implement the forecast artifact schema and market-price contamination guard.
2. Add session audit export with budget/PnL/proposal/exposure reconstruction.
3. Add execution-realistic paper fills using contemporaneous bid/ask and depth.
4. Add concurrency/idempotency guards for automation runs.
5. Add calibration metrics to simulations and paper runs.
6. Run a live-guarded dry run that creates previews only, then require explicit user approval for any submission.
