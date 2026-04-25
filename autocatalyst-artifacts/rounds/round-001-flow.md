# Round 1 Flow

```mermaid
flowchart TD
    ANCHOR[Anchor] --> A[Incumbent A]
    A --> C[Critic]
    C --> B[Candidate B]
    A --> S[Synthesizer]
    B --> S
    S --> AB[Candidate AB]
    B --> HC[Hard checks: pass]
    AB --> HC
    A --> T[Tribunal]
    HC --> T
    T --> W{Winner}
    W --> O[Winner AB / promote / full mode]
```

## Notes

- winner: AB
- status: promote
- hard checks: pass
- judge ranking: not logged
- degraded mode: no
- agents logged: not logged
- reason: AB combined broad operational coverage with strict gate/evidence discipline; all three judges ranked it first.
- artifacts:
  - autocatalyst-artifacts/rounds/round-1-casefile.md
  - autocatalyst-artifacts/rounds/round-1-planner-output.md
  - autocatalyst-artifacts/rounds/round-1-researcher-output.md
  - autocatalyst-artifacts/rounds/round-1-critic-output.md
  - autocatalyst-artifacts/rounds/round-1-judge-1.md
  - autocatalyst-artifacts/rounds/round-1-judge-2.md
  - autocatalyst-artifacts/rounds/round-1-judge-3.md
  - autocatalyst-artifacts/rounds/round-1-candidate-A.md
  - autocatalyst-artifacts/rounds/round-1-candidate-B.md
  - autocatalyst-artifacts/rounds/round-1-candidate-AB.md
  - docs/autonomous-trading-production-readiness-plan.md
  - autocatalyst-artifacts\rounds\round-1-tribunal-summary.json
