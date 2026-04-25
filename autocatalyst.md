# AutoCatalyst: Create a production-readiness step-by-step plan for autonomous Polymarket trading, validated with AutoCatalyst and actuarial forecasting logic

## Objective
Create a production-readiness step-by-step plan for autonomous Polymarket trading, validated with AutoCatalyst and actuarial forecasting logic

## Task Class
planning

## Evidence Mode
hybrid

## Audience and Deliverables
- Audience: repository maintainers, operator-users of the Polymarket plugin, and future agents that will run paper/live guarded autonomous trading sessions.
- Deliverables:
  - Canonical markdown plan: `docs/autonomous-trading-production-readiness-plan.md`.
  - AutoCatalyst round artifacts under `autocatalyst-artifacts/rounds/`.
  - Updated rubric/dashboard showing what was validated and what remains open.

## Constraints
- Preserve a hard no-submit default: paper runs and live previews are allowed, but live order submission stays blocked unless the user explicitly approves the exact preview or a later production gate deliberately enables live autonomy.
- Treat the system as financial automation. Plans must include risk limits, auditability, fail-closed behavior, and rollback/kill-switch paths.
- Do not treat Polymarket prices as fair-value evidence. Market prices may be inspected only after an independent forecast exists, for comparison, spread, liquidity, and resolution wording.
- Use the current repository architecture: SQLite state, discovery/classifier/research/strategy/execution layers, paper sessions, automation gate, and MCP tools.
- Keep the plan actionable: every phase needs owner intent, implementation tasks, acceptance criteria, and hard gates.

## Inputs
- `docs/autonomous-trading.md`
- `docs/strategy-engine.md`
- `docs/opportunity-classifier-integration.md`
- `docs/state-store.md`
- `docs/automation-guidance.md`
- Current paper session behavior and known churn controls from the recent implementation.
- User goal: budget/timeframe/risk-style mandate, autonomous scheduling, market filtering by timeframe, and eventual agent trading with real money.
- Actuarial forecasting rules: base-rate anchoring, current evidence, explicit numerical checks, counter-case, calibration, and market-price contamination guard.

## Files in Scope
- `docs/autonomous-trading-production-readiness-plan.md`
- `docs/autonomous-trading.md` if cross-links are needed.
- `autocatalyst.md`
- `autocatalyst-rubric.md`
- `autocatalyst-dashboard.md`
- `autocatalyst-artifacts/**`

## Off Limits
- No live order submission.
- No credential handling changes.
- No broad implementation refactor in this planning round.
- No claim that the system is production-ready merely because paper mode runs.

## Current Incumbent
- Promoted incumbent after Round 1: `docs/autonomous-trading-production-readiness-plan.md`.
- Control candidate preserved at `autocatalyst-artifacts/rounds/round-1-candidate-A.md`.

## Rubric Snapshot
- Gives a step-by-step path from current paper prototype to production-ready autonomous trading.
- Separates paper, live guarded, and live autonomous gates.
- Embeds actuarial fair-value logic without market-price contamination.
- Specifies safety, risk, automation, observability, backtesting, and audit controls.
- Defines acceptance criteria that can become tests, scripts, checks, or operational runbooks.

## Survival Target
2

## What Has Been Learned
- The current repo has a meaningful control plane but is not a production trader: it can discover, filter, schedule, paper-fill, mark positions, preview gated live orders, and enforce some paper risk controls.
- The biggest gap is not a single missing tool; it is production assurance across data quality, independent fair-value research, execution realism, portfolio risk, operator controls, and incident response.
- The plan must prevent the common failure mode where a paper bot overfits heuristic discovery scores and then trades live without calibrated edge.
- Round 1 tribunal unanimously selected Candidate AB because it combines broad operational coverage with strict gate/evidence discipline.
- The canonical plan now treats the nearest safe milestone as production-grade `paper_trading` plus `live_preview`, with zero autonomous live submission.
