---
name: bet-discovery
description: discover, filter, sort, and shortlist polymarket markets from the full active market universe. use when the user wants to browse all available bets, find candidates by category, horizon, liquidity, structure, catalyst profile, resolution risk, opportunity type, create discovery-driven watchlists, or run scheduled universe triage before deeper research. do not use for placing, previewing, or submitting trades.
---

# Bet Discovery

Use this skill to pull and sort the Polymarket market universe, shortlist candidate bets, and hand them off to classifier, research, or strategy skills.

## Safety boundary

- Never place trades.
- Never preview trades.
- Never submit orders.
- Never promote markets to a watchlist unless the user explicitly asks for promotion.
- Treat scores as triage heuristics, not expected value or financial advice.

## Workflow

1. Check whether a recent universe run exists using `get_universe_facets`.
2. If no recent run exists or the user asks for fresh discovery, call `ingest_market_universe`.
3. Use `list_market_universe` for faceted browsing and custom filters.
4. Use `get_bet_candidates` for preset profiles.
5. Use `get_universe_event_clusters` when the user asks for many-participant events, outsider upside, tournament/election/award fields, or cheap names that can re-rate on over-performance.
6. For the top shortlist, recommend the next skill:
   - `$opportunity-classifier` for structured opportunity classification.
   - `$deep-market-research` for evidence-heavy markets.
   - `$resolution-watch` for near-resolution official-source checks.
   - `$maker-rewards-check` for passive quoting candidates.
7. Only call `promote_universe_markets_to_watchlist` when explicitly instructed.

## Output format

For candidate lists, include:

- title
- market key / slug if available
- category group
- structural type
- horizon bucket
- implied probability
- liquidity
- spread
- top scores
- reason codes
- disqualifiers, if any
- recommended next handoff skill

For event clusters, include:

- cluster title and grouping basis
- market count and outsider count
- total liquidity and median spread
- outsider convexity score
- top outsider markets with implied probability, liquidity, spread, and double price

## Example prompts

- "Refresh all active markets and show me clean politics bets resolving within 30 days."
- "Find liquid macro catalyst markets with spreads under 3 cents."
- "Show longshot research candidates that are tradable but low-attention."
- "Find many-participant events where outsiders could double if they over-perform."
- "Create a watchlist from these 10 selected discovery results."
