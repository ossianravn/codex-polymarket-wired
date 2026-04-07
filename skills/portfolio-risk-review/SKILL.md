---
name: portfolio-risk-review
description: review polymarket positions, open orders, and concentration risk. use when the user asks what they own, where they are overexposed, which orders are stale, how correlated their book is, or what should be reduced or canceled. when helpful, reuse the opportunity-classifier taxonomy to bucket exposure by structural type, horizon, and resolution risk.
---

# portfolio risk review

Use this skill to answer one question:

`what are the real risks in this book right now, and what should be reduced, canceled, or watched first?`

This skill is the exposure-control layer:
- downstream of live portfolio and order data
- parallel to `market-memo` and `strategy-draft`
- upstream of `order-ticket` when the user decides to act on the review

It should surface concrete portfolio risks, not generic caution language and not live cancellation unless explicitly requested.

## default mode

- Default to **risk mode**.
- In risk mode, optimize for exposure concentration, stale order detection, resolution risk, and correlated thesis clustering.
- Do not drift into fresh thesis generation unless that is required to explain an existing risk.

## what this skill is for

Use this skill when the user is effectively asking:
- what do I actually own?
- where am I overexposed?
- which orders are stale or dangerous?
- which positions are duplicating the same thesis?
- where is near-resolution or liquidity risk concentrated?

Use this skill for:
- current positions and open orders
- correlation-aware exposure review
- thesis-level and timing-level risk analysis
- deciding what to reduce, cancel, monitor, or leave alone

Do **not** use this skill to:
- place or cancel orders without explicit instruction
- invent new trades unrelated to the current book
- do deep fundamental research on every position
- hide the most dangerous exposures inside a long inventory dump

## minimum viable input checklist

Do not finalize the review until you have, or explicitly mark as missing:
- current positions
- current open orders
- notional or value context for the largest exposures
- at least one clustering lens such as thesis, category, horizon, or resolution timing
- at least one stale-order check

When available, also use:
- `get_portfolio_risk_summary`
- `get_market_state`
- prior `record_classification` output
- thesis links and correlation clusters

## outside-in frame

Before writing the review, inspect the book from these lenses:
- **size lens:** where is the notional actually concentrated?
- **thesis lens:** which positions and orders are really the same bet in disguise?
- **timing lens:** what resolves soon, and what could trap the user before they react?
- **market-quality lens:** which exposures are hard to exit because of spread, depth, or stale markets?
- **workflow lens:** does the user need a risk review, or a direct cancel/replace plan?

If the workflow lens says the user already knows what should be done and only needs execution, hand off to `order-ticket`.

## dependency and handoff rules

Use the minimum live set needed:
- `get_positions`
- `get_open_orders`
- `get_portfolio_risk_summary` when available
- `get_market_state` for names where stored thesis or classification context matters

When helpful, reuse `opportunity-classifier` taxonomy to group exposure by:
- category
- structural type
- horizon bucket
- resolution-risk bucket

If the main missing piece is:
- current state on one especially important market -> `market-memo`
- deeper evidence on one risky thesis -> `deep-market-research`
- reworking one position into a better plan -> `strategy-draft`
- exact cancel or replacement mechanics -> `order-ticket`

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- whether the user wants a full-book review or a focused risk check
- whether the priority is concentration, stale orders, near-resolution risk, or liquidity traps

### 2. Pull the live book

Start with:
- `get_positions`
- `get_open_orders`

Then add:
- `get_portfolio_risk_summary` when available for thesis-level aggregation
- `get_market_state` for the few names where stored context changes the assessment

Do not review a stale or partial book as if it were complete.

### 3. Build the exposure map

Group exposure by:
- market
- thesis or correlation cluster
- theme or event family
- horizon or resolution timing
- structural type when that changes risk meaningfully

Make sure the user can see both:
- largest single-name risks
- duplicated multi-name risks

### 4. Identify the concrete risk set

At minimum, check for:
- oversized single-name exposure
- duplicated thesis exposure
- near-resolution exposure
- stale resting orders
- liquidity or spread traps
- contradictory orders or over-hedged states

### 5. Rank the risks

Surface the 3-5 clearest risks first.

The ranking should reflect:
- size
- immediacy
- difficulty of unwinding
- ambiguity around resolution
- likelihood the user has forgotten the order or duplicated the thesis elsewhere

### 6. Recommend the cheapest useful action

For each top risk, choose one:
- reduce
- cancel
- revise
- wait
- monitor

Do not jump straight to aggressive action if the right answer is simply to watch a clean exposure.

## hard rules

- Do not cancel or submit orders in this skill unless the user explicitly asks.
- Keep recommendations tied to observed positions and orders.
- Do not bury the biggest risk under a long list of minor issues.
- Do not treat separate tickers as diversified if they are the same thesis.
- Do not ignore near-resolution exposure because the notional is small.
- Do not recommend action without stating why that action is the cheapest useful response.

## output contract

Return exactly these sections in this order.

# portfolio risk review

## review intent
State in 1-2 sentences:
- what scope was reviewed
- what type of risk the review prioritizes

## top risks
List the 3-5 most important issues first.
For each, state:
- what the risk is
- why it matters now
- the recommended posture

## positions
List:
- largest exposures
- correlated or duplicated thesis buckets
- near-resolution positions
- any illiquid or awkward exposures

## open orders
List:
- stale or dangerous resting orders
- orders that duplicate existing exposure
- orders that look misaligned with current posture

## suggested actions
Use flat bullets with:
- reduce
- cancel
- revise
- wait
- monitor

Each action must name the specific exposure or order it applies to.

## next handoff
Choose one:
- remain in `portfolio-risk-review`
- hand off to `market-memo`
- hand off to `deep-market-research`
- hand off to `strategy-draft`
- hand off to `order-ticket`

Explain why that is the cheapest useful next step.

## completion criteria

The review is complete only when:
- live positions and orders have both been checked
- concentration and duplicated-thesis risk are explicit
- stale-order risk is explicit
- the highest-priority risks are ranked, not just listed
- every suggested action is tied to a real observed exposure
- no live cancellations or submissions are performed

## common failure modes

- listing positions without ranking the real risks
- treating correlated markets as independent exposure
- ignoring stale resting orders
- focusing only on large notional and missing near-resolution danger
- giving generic risk advice with no named action
- turning the review into a fresh research memo

## activation tests

### Should trigger

- "review my polymarket portfolio risk."
- "what am I overexposed to?"
- "which open orders are stale or dangerous?"
- "show me my biggest duplicated thesis risks."
- "what should I reduce or cancel first?"

### Should not trigger

- "summarize this one market."
- "research whether this bet is right."
- "build me an order ticket."
- "place this order now."
- "rank these new markets for research."

## resource map

- `market-memo` — use when one risky name needs a sharper current-state read
- `deep-market-research` — use when the key risk is thesis quality, not only exposure size
- `strategy-draft` — use when one exposure should be re-planned rather than simply reduced
- `order-ticket` — use when the user is ready to execute a cancel, replace, or reduction plan
