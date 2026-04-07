---
name: watchlist-scan
description: scan configured polymarket watchlists for material changes. use when the user wants recurring monitoring, threshold-based alerts, catalyst watch, or a scheduled automation that reports only when something important changed. use opportunity-classifier next when the goal is to rank, segment, or filter the changed names.
---

# watchlist scan

Use this skill to answer one question:

`what changed in the watchlist that actually deserves attention right now?`

This skill is the monitoring layer:
- downstream of `configs/watchlists.yaml`, bookmark sync, and persisted state
- upstream of `opportunity-classifier`, `market-memo`, and `strategy-draft`

It should report meaningful deltas, not restate the whole watchlist.

## default mode

- Default to **delta mode**.
- In delta mode, optimize for threshold breaches, new alerts, catalyst-adjacent movement, and workflow routing.
- Do not turn the scan into a generic market roundup.

## what this skill is for

Use this skill when the user is effectively asking:
- what moved in my watchlist?
- which names had meaningful alerts?
- did any bookmarked or watched markets get more interesting?
- what should I look at first after a monitoring run?

Use this skill for:
- recurring scans
- threshold-based alert summaries
- change-focused reporting
- deciding which changed names deserve memo, research, or strategy work next

Do **not** use this skill to:
- rank an entire discovery universe
- write full market memos on every changed name
- place or cancel orders
- fill the report with unchanged markets

## minimum viable input checklist

Do not finalize a scan until you have, or explicitly mark as missing:
- a watchlist source
- the latest scan state or alert state
- at least one threshold or condition for materiality
- the changed markets that crossed those thresholds, if any

Prefer to build on persisted state when available.

## outside-in frame

Before reporting, inspect the scan from these lenses:
- **change lens:** what actually changed, not just what exists?
- **materiality lens:** is the move large enough, timely enough, or weird enough to matter?
- **workflow lens:** should a changed name go to classifier, memo, research, or strategy next?
- **noise lens:** what can be safely omitted because it is unchanged or trivial?

If the noise lens says nothing matters, say so briefly and stop.

## dependency and handoff rules

Use the minimum monitoring set needed:
- load `configs/watchlists.yaml`
- prefer `get_live_alerts`, `get_state_summary`, or `get_market_state` when local SQLite state is available
- use fresh snapshot reads only where the alert or state data is insufficient

If the main missing piece is:
- which changed names deserve deeper prioritization -> `opportunity-classifier`
- compact current-state read on one changed name -> `market-memo`
- fair-value or catalyst work on one changed name -> `deep-market-research`
- execution framing after a changed setup becomes actionable -> `strategy-draft`

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- which watchlist source is in scope
- whether the user wants a one-off scan or an automation-style summary
- what counts as material in this run

### 2. Load the watchlist and prior state

Start with:
- `configs/watchlists.yaml`

Then prefer:
- `get_live_alerts`
- `get_state_summary`
- `get_market_state`

Use current-thread-only scans only when persisted state is unavailable.

### 3. Filter to material changes

Only surface names that:
- crossed configured thresholds
- generated fresh alerts
- showed meaningful related-market drift
- developed a new comment or catalyst signal that materially changes attention level

Ignore unchanged names and trivial noise.

### 4. Summarize the change, not the entire market

For each surfaced name, state:
- what changed
- why it matters
- what next step is justified

Keep each name compact unless the user asks to drill down.

### 5. End with workflow routing

For each changed name, route to the cheapest useful next step:
- `opportunity-classifier`
- `market-memo`
- `deep-market-research`
- `strategy-draft`
- no action

## hard rules

- Keep the scan concise and change-focused.
- Do not place, preview, submit, or cancel orders in this skill.
- Do not promote every moved market as actionable.
- Do not turn the scan into a memo for unchanged or low-signal names.
- Do not omit "nothing material" when that is the honest result.

## output contract

Return exactly these sections in this order.

# watchlist scan

## scan intent
State in 1-2 sentences:
- what watchlist source was scanned
- what materiality standard was used

## material changes
If there are changes, use one flat bullet block per changed market:
- market name
- what changed
- why it matters
- recommended next step

## nothing material
Use this section only when nothing crossed the reporting threshold.
State that briefly and stop.

## next handoff
Choose one:
- remain in `watchlist-scan`
- hand off changed names to `opportunity-classifier`
- hand off one name to `market-memo`
- hand off one name to `deep-market-research`
- hand off one name to `strategy-draft`

Explain why that is the cheapest useful next step.

## completion criteria

The scan is complete only when:
- the watchlist source is explicit
- only material changes are surfaced
- unchanged noise is omitted
- each surfaced name has a why-it-matters note
- the next step is explicit
- no live trading action is taken

## common failure modes

- dumping the whole watchlist instead of the deltas
- treating every price move as meaningful
- ignoring stored alert state and recomputing everything from scratch
- writing mini memos for each name without need
- failing to say "nothing material" when nothing actually changed

## activation tests

### Should trigger

- "scan my watchlist for anything important."
- "what changed in the watched markets?"
- "give me the alert-level summary from the watchlist."
- "tell me which watchlist names deserve a closer look after the latest move."

### Should not trigger

- "classify these 20 markets."
- "write a memo on this one market."
- "research fair value on this event."
- "place an order."
- "review my portfolio risk."

## resource map

- `opportunity-classifier` — use when multiple changed names need ranking or filtering
- `market-memo` — use when one changed name needs a compact live-state read
- `deep-market-research` — use when the change justifies a full fair-value pass
- `strategy-draft` — use when a watched market became actionable and now needs execution framing
