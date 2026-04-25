# Round 1 Researcher Output

## Confirmed Facts

- The repo is preview-first, not a blind auto-trader. `README.md` describes stateful research, strategy, guarded previews, and submission only from previews.
- Autonomous trading currently implements a mode-aware planner with paper/live modes, but `docs/autonomous-trading.md` states it does not submit live orders and that live execution remains behind preview/submit tools.
- Paper trading is implemented: sessions, decisions, paper fills, marked positions, realized/unrealized PnL, exits, stop-loss behavior, re-entry cooldowns, and scheduling.
- Live-mode gates exist: `live_guarded` requires approval after preview; `live_autonomous` can only proceed after guarded preview, policy checks, credentials, and unchanged policy hash.
- SQLite state persists markets, snapshots, universe runs, research, evidence, classifications, thesis links, previews, orders, portfolio snapshots, auto-trading sessions/decisions, and paper fills/positions.
- Strategy engine is read-only and state-driven. It requires fair value when missing/stale, can require two-sided evidence, and applies thesis-aware portfolio checks.
- Universe discovery and auto-trader scoring are heuristic triage, not fair value. The docs explicitly warn universe scores are not expected edge.
- The research engine has fair-value fields, but its synthesis function is still a placeholder.
- No implementation/test/config matches were found for forecast, Brier, calibration, market-price contamination, or base-rate controls in searched code paths.
- Local tests are executable outside the sandbox; recent full test runs passed 60/60.

## Highest-Risk Gaps

- Independent actuarial forecasting is the main production blocker. Current auto-trader entries can be driven by heuristic universe scores.
- Paper fills are not execution-realistic. Current docs say simulation is not a historical order-book backtest and assumes passive fills at planner target price.
- Kill switch, pause/resume, and paper/live reconciliation are explicitly listed as pre-live TODOs.
- `max_daily_loss_usdc` exists but is not fully enforced against realized/unrealized PnL.
- Automation guidance still says to avoid unattended entry/exit logic that opens positions and keep execution disabled for unattended v1.

## Actuarial Hard Requirements

- Add a first-class forecast artifact linked to market, outcome, session, evidence, and decision.
- Any live entry must reference a fresh forecast artifact; reject live decisions whose only edge source is discovery score, momentum, or heuristic ranking.
- Forecasts must include resolution wording, outcome set, base-rate evidence, current evidence, disconfirming evidence, strongest counter-case, and a numerical probability check.
- Market-price contamination must be controlled: store whether venue price was hidden until after fair probability was set, then compare fair probability to venue price only after saving.
- Calibration metrics should be mandatory before pilots: Brier score, log loss, calibration buckets, and closing-line comparison where available.

## Acceptance Criteria Split

Testable now:

- Paper session creation/filtering.
- Paper fills/ledger spend.
- Take-profit exits.
- Stop-loss grace.
- Session stop-loss blocking.
- Budget allocation.
- Event exposure caps.
- Live-guarded preview gates.
- Live-autonomous gate eligibility.
- Paper execution blocking.
- Strategy candidate readiness.
- Stale-order cancellation surfacing.
- Research-required queues.
- Same-thesis suppression.
- Thesis exposure caps.
- Universe normalization/scoring.
- Event clusters.
- Scheduler due-status.
- Synthetic paper simulation.

Later only:

- Forecast artifact schema.
- Contamination guard.
- Actuarial freshness gate.
- Calibration reporting.
- Execution-realistic fills.
- Paper/live reconciliation.
- Kill switch/pause/resume tools.
- Concurrency/leader locking.
- Daily loss enforcement.
- Live guarded/autonomous pilot criteria.

## Decision-Relevant Implications

- Treat the repo as a controlled paper prototype with guarded preview capability, not production autonomous trading.
- The next production-readiness gate should be actuarial forecast artifacts plus live-entry rejection without a fresh forecast.
- Do not advance to a live-guarded pilot until execution realism, loss enforcement, kill switch, and calibration tests exist.
- Do not enable unattended `live_autonomous` until live-guarded behavior is boring, reconciled, and objectively calibrated.
