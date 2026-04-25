<!-- autocatalyst:start -->
    ## AutoCatalyst session rules
When `autocatalyst.md` exists at the repository root:
- Read `autocatalyst.md`, `autocatalyst.jsonl`, `autocatalyst-rubric.md`, `autocatalyst-dashboard.md`, and `autocatalyst-artifacts/` before proposing the next round.
- Bootstrap missing session files or missing `.codex/agents/` files before the first round.
- Before starting another round, compute convergence from `autocatalyst.jsonl` and stop when the incumbent survival streak reaches `survivalTarget`.
- If `.codex/autocatalyst-models.toml` exists, resolve it and pass explicit `model` and `reasoning_effort` values when spawning each AutoCatalyst subagent.
- Run full AutoCatalyst mode with real subagents from `.codex/agents/`; do not simulate critic or judges in the main thread.
- Respect the repo's active `.codex/config.toml` agent limits. Close stale or completed child agents before the next stage, keep child depth flat, and prefer bounded batches when headroom is tight.
- For blind judging, collect three real judge results, but do not assume all three judges must run simultaneously. Under thread pressure, use bounded batches and aggregate after all three verdicts exist.
- If subagents do not actually spawn, say `degraded single-agent mode` and stop unless the user explicitly accepts fallback.
- Preserve the incumbent as a control arm.
- Promote recurring critiques into rubric items, tests, or checks whenever possible.
- Refresh the dashboard, Mermaid artifacts, and browser report after each logged round.
    <!-- autocatalyst:end -->
