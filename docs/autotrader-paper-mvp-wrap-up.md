# Paper Autotrader MVP Wrap-Up

This document narrows the autonomous trading work to a practical paper-only MVP. It separates what is required to finish the current milestone from what should wait until the system has proven paper-trading behavior.

The current target is not live autonomous trading. The current target is a reliable paper autotrader that can discover markets, request independent research, consume sealed fair-value evidence, place paper orders, track paper positions, and report status without live submission.

## Current Status

Implemented:

- Full-market discovery and persisted universe runs.
- Timeframe-aware candidate filtering for user mandates.
- Paper sessions with budget, timeframe, and risk profile.
- Paper entries, exits, fills, marked positions, realized and unrealized PnL.
- Live execution boundary that blocks paper sessions from live submission.
- Exact-preview style live gates for future guarded modes.
- Independent forecast gate before venue-price comparison.
- Screening forecasts for paper-only exploration.
- Sealed `deep_research_forecast_v1` artifacts from stored research runs.
- Research-request payloads for forecast-blocked candidates.
- Research-request worker that records research runs only from independent evidence bundles.
- Venue-price contamination checks for research evidence.
- Daemon-integrated research source-pack provider with fail-open error reporting.
- Timeout-safe universe discovery requests.
- Automation gate that can remain quiet until the session is due.

Still not production-ready:

- Reliable unattended external-source research in this local environment unless an agent provider is configured and responsive.
- Full kill switch and pause/resume tools.
- Daily loss enforcement separate from session stop-loss.
- Full reconciliation jobs.
- Calibration and Brier tracking.
- Guarded live pilot.
- Live autonomous submission.

## Need-To-Have Before Calling The Paper MVP Wrapped

1. One repeatable paper-only runbook exists and works with direct local binaries.
2. The paper loop can run without global `npm`.
3. Research-blocked candidates produce `researchRequest` payloads.
4. The research worker can consume an independent evidence bundle and record `research_runs`.
5. The forecast writer can upgrade those research runs to `deep_research_forecast_v1`.
6. The next autotrader iteration can use the sealed forecast to produce or reject paper proposals.
7. Status/report commands show budget, remaining budget, open paper positions, and PnL.
8. Live order submission stays blocked by default with `POLYMARKET_ENABLE_TRADING=false`.
9. Regression tests cover the gate, research request, contamination rejection, and paper execution path.

## Nice-To-Have, Not Needed For This Wrap-Up

- Fully autonomous web research.
- Multi-provider evidence crawling.
- Forecast calibration dashboard.
- Historical backtesting across resolved markets.
- Rich operator UI.
- Service-level leader election.
- Live guarded pilot.
- Live autonomous mode.

These are valuable, but they should not block wrapping the current paper MVP.

## Paper-Only Workflow

Use direct local binaries in this environment because global `npm` can point at a broken shim.

1. Refresh or reuse discovery data.

```powershell
node --import tsx .\scripts\universe-discovery.ts
```

If repeated discovery runs have made the local dev database large, prune old universe scan rows while keeping the latest completed runs:

```powershell
node --import tsx .\scripts\state-maintenance.ts --dry-run
node --import tsx .\scripts\state-maintenance.ts --keep-latest-universe-runs 3
```

2. Run one paper autotrader iteration.

```powershell
$env:POLYMARKET_ENABLE_TRADING='false'
node --import tsx .\scripts\autotrader-iteration.ts --budget-usdc 30 --timeframe-hours 24 --risk-profile aggressive --mode paper --json --compact
```

3. If the result contains `researchRequests`, create an independent evidence bundle. Use [autotrader-research-evidence.example.json](../examples/autotrader-research-evidence.example.json) as the shape.

For agent-assisted paper research, generate source packs from pending templates. This is still paper-only and still passes through the same contamination and evidence gates:

```powershell
$env:POLYMARKET_ENABLE_TRADING='false'
node --import tsx .\scripts\autotrader-research-worker.ts --session-id <session-id> --template --limit 6 --template-file .\state\paper-research-template.json --json
node --import tsx .\scripts\autotrader-research-provider.ts --session-id <session-id> --template-file .\state\paper-research-template.json --source-provider codex_cli --limit 6 --record --write-forecasts --json
```

If the agent cannot produce source-backed packs quickly, fail fast and use the manual source-pack path instead:

```powershell
node --import tsx .\scripts\autotrader-research-provider.ts --session-id <session-id> --template-file .\state\paper-research-template.json --source-provider codex_cli --agent-timeout-ms 60000 --limit 2 --record --write-forecasts --json
```

The daemon can also invoke the research provider directly. This keeps the automation self-contained: provider failures are written into `researchAgent` and do not stop the paper heartbeat.

```powershell
$env:POLYMARKET_ENABLE_TRADING='false'
$env:AUTOTRADER_RESEARCH_AGENT_PROVIDER='openai'
$env:AUTOTRADER_RESEARCH_AGENT_MODEL='gpt-5.4-mini'
$env:AUTOTRADER_RESEARCH_AGENT_TIMEOUT_MS='90000'
$env:AUTOTRADER_RESEARCH_AGENT_LIMIT='1'
node --import tsx .\scripts\autotrader-daemon.ts --once --session-id <session-id> --mode paper --research-source-provider openai --json
```

For a quick no-enrichment discovery refresh that avoids long heartbeat stalls:

```powershell
$env:POLYMARKET_ENABLE_TRADING='false'
$env:POLYMARKET_UNIVERSE_REQUEST_TIMEOUT_MS='10000'
node --import tsx .\scripts\universe-discovery.ts --source gamma_markets --limit-pages 1 --page-size 50 --enrich-top-n 0 --enrichment-profile none
```

4. Record the evidence bundle as a research run.

```powershell
$env:POLYMARKET_ENABLE_TRADING='false'
node --import tsx .\scripts\autotrader-research-worker.ts --session-id <session-id> --evidence-file .\examples\autotrader-research-evidence.example.json --json
```

5. Upgrade stored research runs into sealed forecasts.

```powershell
node --import tsx .\scripts\forecast-writer.ts --limit 1000
```

6. Run the paper iteration again.

```powershell
$env:POLYMARKET_ENABLE_TRADING='false'
node --import tsx .\scripts\autotrader-iteration.ts --session-id <session-id> --json --compact
```

7. Inspect paper status.

```powershell
node --import tsx .\scripts\autotrader-paper-report.ts --session-id <session-id> --json
```

## Evidence Bundle Rules

Evidence bundles must be independent of Polymarket venue prices.

Allowed:

- Official source statements.
- Primary-source schedules, rules, filings, or results.
- Independent news reporting.
- Independent polls, statistics, forecasts, weather data, sports data, or financial data.
- Counter-evidence and unresolved questions.

Forbidden as fair-value evidence:

- Polymarket odds.
- Polymarket prices.
- Orderbook, best bid, best ask, spread, midpoint.
- Recent venue trades.
- Market-implied probability.

Venue prices are only allowed after the independent forecast is sealed, and only for edge and execution checks.

## Stop Condition

Do not progress to live guarded or live autonomous work until the paper MVP has run through several clean cycles with:

- No live submissions.
- No stale or contaminated research artifacts.
- No unexplained paper ledger drift.
- No unresolved safety issues.
- Clear operator-visible status summaries.

At that point, the next focused milestone should be persistent pause/kill-switch plus paper reconciliation, not live trading.
