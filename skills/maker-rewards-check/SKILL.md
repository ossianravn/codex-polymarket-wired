---
name: maker-rewards-check
description: evaluate whether passive polymarket quoting looks reward-eligible or operationally sensible. use when the user wants market-making guidance, passive quote placement, spread analysis, rewards checks, or two-sided quoting ideas.
---

# maker rewards check

Use this skill to answer one question:

`is passive quoting in this market actually attractive, reward-eligible, and operationally survivable?`

This skill is the passive-liquidity layer:
- downstream of live orderbook and rewards context
- parallel to `strategy-draft`
- upstream of `order-ticket` when the user wants a concrete quote plan

It should evaluate maker quality, not drift into generic taker trading.

## default mode

- Default to **maker mode**.
- In maker mode, optimize for spread quality, depth, queue reality, scoring context, and inventory risk.
- Do not turn the answer into a directional bet unless the user explicitly changes the task.

## what this skill is for

Use this skill when the user is effectively asking:
- does it make sense to quote here?
- is this market likely reward-eligible?
- do I need two-sided quoting?
- where would passive quote zones likely live?
- what are the stale-quote and inventory risks?

Use this skill for:
- maker-reward checks
- passive quote feasibility
- spread and book-quality analysis
- deciding whether quoting is sensible before building actual tickets

Do **not** use this skill to:
- recommend blind taker entries
- place quotes without explicit instruction
- ignore operational risks just because rewards look good
- assume reward economics without checking live conditions

## minimum viable input checklist

Do not finalize the check until you have, or explicitly mark as missing:
- target market and token pair
- live orderbook context
- spread and depth context
- recent trade flow
- rewards status when available
- at least one inventory or stale-quote risk note

## outside-in frame

Before evaluating, inspect the market from these lenses:
- **spread lens:** is there real room to quote after fees, queue, and adverse selection?
- **scoring lens:** what does the rewards status actually imply?
- **inventory lens:** what happens if only one side fills?
- **staleness lens:** how likely are quotes to become toxic before refresh?
- **workflow lens:** is the right next step still analysis, or a concrete quote ticket?

## dependency and handoff rules

Use the minimum live set needed:
- `get_market_snapshot`
- `get_orderbook`
- `get_recent_trades`
- `get_rewards_status` when available

If the main missing piece is:
- a broader thesis or directional view -> `strategy-draft`
- exact quote construction, preview, or cancellation logic -> `order-ticket`
- compact current-state read on the market outside maker concerns -> `market-memo`

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- which market and side pair is being evaluated
- whether the goal is rewards, passive execution quality, or both

### 2. Refresh the live maker context

Confirm:
- spread
- top-of-book depth
- recent trade flow
- whether the book looks alive, thin, or stale

### 3. Check rewards and scoring context

When available, use `get_rewards_status` to determine:
- whether rewards are active
- whether the market appears score-relevant
- what conditions likely improve or weaken eligibility

If rewards data is unavailable, say so clearly and continue with operational analysis only.

### 4. Evaluate the real maker tradeoff

At minimum, assess:
- whether quoting is sensible at all
- whether two-sided quoting is needed
- whether inventory skew is acceptable
- whether stale-quote risk is unusually high

### 5. End with quote-ready guidance, not execution

Summarize:
- buy-side quote zone if any
- sell-side quote zone if any
- conditions under which not to quote
- whether the user should advance to `order-ticket`

## hard rules

- Do not turn this into a taker-order recommendation unless the user explicitly asks.
- Do not place, preview, submit, or cancel orders in this skill.
- Emphasize stale-quote and heartbeat risk whenever passive orders are discussed.
- Do not assume rewards make a bad market worth quoting.
- Do not ignore one-sided inventory risk.

## output contract

Return exactly these sections in this order.

# maker rewards check

## check intent
State in 1-2 sentences:
- what market was evaluated
- whether the check is mainly about rewards, passive viability, or both

## market structure
List:
- spread
- depth
- recent flow note
- whether the book looks alive, thin, or stale

## rewards and scoring context
List:
- current scoring signal if available
- whether rewards appear active or material
- what would likely improve or weaken eligibility

## quote ideas
Keep this high-level:
- buy-side quote zone
- sell-side quote zone
- whether two-sided quoting is preferred
- inventory skew note

## operational cautions
List:
- stale-quote risk
- adverse-selection risk
- one-sided fill risk
- when not to quote

## next handoff
Choose one:
- remain in `maker-rewards-check`
- hand off to `market-memo`
- hand off to `strategy-draft`
- hand off to `order-ticket`

Explain why that is the cheapest useful next step.

## completion criteria

The maker check is complete only when:
- live book quality is explicit
- rewards context is checked or explicitly unavailable
- stale and inventory risks are explicit
- quote guidance stays high-level
- the next step is singular and justified
- no live order action is taken

## common failure modes

- calling a market attractive just because rewards exist
- ignoring queue, depth, or stale-book reality
- treating maker quoting as if inventory does not matter
- drifting into taker trade advice
- giving quote levels without operational caveats

## activation tests

### Should trigger

- "is this market worth quoting for maker rewards?"
- "where could I passively quote this market?"
- "do I need two-sided quoting here?"
- "check the reward situation and passive viability."

### Should not trigger

- "what are the fair odds?"
- "give me a trade plan."
- "submit a buy order."
- "review my portfolio."
- "scan my watchlist."

## resource map

- `market-memo` — use when the user first needs a broader live-state read on the market
- `strategy-draft` — use when the real question is directional strategy, not maker quoting
- `order-ticket` — use when quote logic is ready to become a guarded preview plan
