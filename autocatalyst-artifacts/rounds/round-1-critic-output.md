# Round 1 Critic Output

## Hard Blockers

1. Candidate A is still too much like an outline. It needs concrete scope, sequencing, artifacts, and acceptance criteria.
2. The hard safety constraint is under-specified. The plan must make exact-preview approval operationally unambiguous.
3. The actuarial rule is not enforced as an invariant, failure condition, audit requirement, or acceptance gate.
4. Acceptance criteria are asserted rather than concrete enough for autonomous agents.
5. The production gate model is vague. Preview generation, approval, submission, autonomous eligibility, rollback, and revocation must be distinct.
6. The test/check strategy is missing for blocked live submission, preview immutability, approval matching, fair-value provenance, risk limits, kill switches, and audit completeness.
7. The readiness estimate is unsupported by evidence or thresholds.

## Softer Concerns

- Audience needs are not separated between maintainers, operator-users, and future agents.
- Operational failure modes are thin.
- Portfolio/risk controls are too abstract.
- Execution realism is underspecified.
- Observability/audit is too generic.
- Discovery, research, strategy, and execution boundaries need clearer evidence requirements.
- The canonical document needs structure: status, scope, non-goals, invariants, glossary, phase tables, gate definitions, and checklist completion criteria.

## Rubric Promotions

- Reject plans that do not restate the live-order submission block as a top-level invariant.
- Reject plans that do not encode independent forecast before market price comparison.
- Require every phase to have concrete acceptance criteria.
- Require explicit gate definitions for paper, preview-only live, explicitly approved live, and live-autonomous.
- Require tests/checks for blocked live submission and exact-preview approval matching.
- Require provenance checks for fair-value inputs.
- Require auditability criteria for forecasts, decisions, previews, approvals, simulated fills, and live actions.
- Require readiness estimates to be evidence-linked rather than asserted.
- Require operator-facing emergency controls and review procedures.
- Require future-agent instructions to prevent unsafe interpretation.
