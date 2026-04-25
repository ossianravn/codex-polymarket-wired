# Round 1 Planner Output

## Task Class

Production-readiness planning artifact for an autonomous trading system.

Subtype: safety-critical operational plan with staged autonomy gates, auditability requirements, and measurable acceptance criteria.

Primary risk class: financial automation with live execution risk. The plan should be treated as an operator-facing control document, not just engineering documentation.

## Evidence-Mode Recommendation

Use evidence-gated planning.

Each phase should require explicit evidence before promotion:

- Written mandate and prohibited actions.
- Reproducible independent fair-value forecasts before price comparison.
- Paper-trading results before live previews.
- Live preview parity before guarded live execution.
- Human-approved limited pilot before any autonomous live path.
- Incident logs, kill-switch tests, and audit trails before scaling.

Acceptance evidence should be concrete: logs, backtest reports, dry-run order tickets, risk-limit simulations, reconciliation outputs, operator signoffs, and reproducible forecast scripts.

Critical actuarial rule to promote: Polymarket prices may be used only after an independent forecast exists, and only for mispricing/comparison, not as input evidence for fair value.

## Candidate Isolation Plan

Keep the incumbent plan as Candidate A / control.

Challenge candidates should isolate distinct risks:

- Gate-first plan: explicit promotion gates, hard stop conditions, operator approvals, and safety invariants.
- Evidence-first plan: measurable artifacts per phase.
- Failure-mode-first plan: adverse scenarios such as bad data, stale markets, API outage, runaway execution, correlated exposure, model drift, and wallet/key compromise.
- Agent-operability plan: future autonomous-agent runbooks, machine-readable state, allowed tools, blocked actions, handoff protocol, and escalation criteria.

## Rubric Headings

- Safety invariants.
- Autonomy gates.
- Independent forecast discipline.
- Measurable acceptance criteria.
- Execution realism.
- Risk controls.
- Resolution and market integrity.
- Auditability.
- Operational hardening.
- Backtesting and paper trading.
- Operator usability.
- Future agent compatibility.
