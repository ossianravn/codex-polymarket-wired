---
name: watchlist-scan
description: scan configured polymarket watchlists for material changes. use when the user wants recurring monitoring, threshold-based alerts, catalyst watch, or a scheduled automation that reports only when something important changed.
---

# watchlist scan

Read `configs/watchlists.yaml` and summarize only material changes.

## workflow

1. Load `configs/watchlists.yaml`.
2. For each configured market:
   - fetch the current snapshot
   - compare recent movement, spread, and comments
   - check for linked-market drift if requested
3. Only surface items that cross configured thresholds.
4. If nothing matters, say so briefly.

## report format

# watchlist scan

## material changes
- one subsection per market that crossed thresholds

## nothing material
- use only when nothing crossed thresholds

## guardrails

- Keep the report concise.
- Do not place trades.
- Point to `strategy-draft` or `order-ticket` only when the user asks for follow-up action.
