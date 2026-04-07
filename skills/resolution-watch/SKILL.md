---
name: resolution-watch
description: monitor polymarket markets that are close to resolution or likely to be resolved soon. use when the user wants official-source checking, resolution readiness, ambiguity flags, or a scheduled workflow for near-resolution markets.
---

# resolution watch

Use this skill to answer one question:

`which markets are approaching resolution in a way that creates operational or settlement risk right now?`

This skill is the near-resolution monitoring layer:
- downstream of watchlists, open positions, and open orders
- parallel to `portfolio-risk-review`
- upstream of `order-ticket` when the user needs a concrete cancel or reduction plan

It should focus on settlement readiness and ambiguity, not thesis generation.

## default mode

- Default to **resolution mode**.
- In resolution mode, optimize for official-source checking, wording traps, timing risk, and posture recommendations.
- Do not drift into fresh fair-value work unless the user explicitly changes the task.

## what this skill is for

Use this skill when the user is effectively asking:
- which markets are close to resolution?
- what official evidence is likely to matter?
- where could settlement get messy?
- which positions or resting orders need attention before resolution?

Use this skill for:
- near-resolution watchlists
- resolution-readiness checks
- operational monitoring around deadlines, results, releases, or official calls
- identifying markets where ambiguity creates disproportionate risk

Do **not** use this skill to:
- do broad market discovery
- build a fresh trade thesis
- submit or cancel orders without explicit instruction
- treat headline certainty as resolution certainty

## minimum viable input checklist

Do not finalize a resolution watch until you have, or explicitly mark as missing:
- one market or a defined near-resolution set
- current resolution text
- the most likely official or primary source that will matter
- one timing anchor
- one ambiguity or edge-case check

When available, also pull:
- positions or open orders tied to the market
- comments when they reveal real wording disputes or rule confusion

## outside-in frame

Before reporting, inspect the market from these lenses:
- **rules lens:** what does the actual resolution language require?
- **source lens:** what official source is likely to decide the outcome?
- **timing lens:** when should evidence arrive, and how much lag risk exists?
- **ambiguity lens:** what wording trap or procedural edge case could break consensus?
- **workflow lens:** is the user best served by watch, risk review, or direct order adjustment?

## dependency and handoff rules

Use the minimum live set needed:
- `get_market_snapshot`
- comments when ambiguity may be reflected there
- `get_positions` or `get_open_orders` when the user has live exposure

If the main missing piece is:
- exposure clustering across the whole book -> `portfolio-risk-review`
- current-state read on one market -> `market-memo`
- deeper evidence on the underlying event -> `deep-market-research`
- exact cancel or reduction mechanics -> `order-ticket`

## main workflow

### 1. Normalize the assignment

Write a 1-2 line intent statement for yourself covering:
- which near-resolution markets are in scope
- whether the goal is monitoring, exposure control, or official-source readiness

### 2. Refresh the live setup

Confirm:
- current market snapshot
- resolution text
- timing or deadline context
- whether the user has live positions or resting orders at risk

### 3. Identify the likely decision evidence

Name:
- the expected official source
- the likely timing of that source
- what would count as decisive versus inconclusive evidence

### 4. Map ambiguity and operational risk

At minimum, check for:
- wording traps
- timing uncertainty
- conflicting official or quasi-official sources
- stale orders that may remain live into messy resolution windows

### 5. Recommend posture, not execution

Choose the appropriate posture:
- wait
- monitor closely
- reduce risk
- prepare to cancel stale orders

Do not execute anything unless explicitly asked.

## hard rules

- Do not assume resolution rules from headlines or common sense alone.
- Do not place or cancel orders in this skill without explicit instruction.
- Do not overstate certainty when the official source path is still unclear.
- Do not ignore open orders when near-resolution ambiguity is high.
- Do not turn this into a general market memo.

## output contract

Return exactly these sections in this order.

# resolution watch

## watch intent
State in 1-2 sentences:
- what near-resolution set was reviewed
- what risk the watch is focused on

## markets to watch
Use one flat bullet block per market:
- market name
- why it is close to resolution
- why it deserves attention now

## likely resolution evidence
For each market, state:
- best official or primary source
- expected timing
- what would likely count as decisive evidence

## ambiguity and risk
List:
- wording traps
- timing uncertainty
- source conflict risk
- exposure or stale-order risk if relevant

## recommended posture
Choose for each market:
- wait
- monitor
- reduce risk
- prepare to cancel stale orders

Explain why.

## next handoff
Choose one:
- remain in `resolution-watch`
- hand off to `portfolio-risk-review`
- hand off to `market-memo`
- hand off to `deep-market-research`
- hand off to `order-ticket`

Explain why that is the cheapest useful next step.

## completion criteria

The watch is complete only when:
- resolution wording has been checked
- an official-source path is identified
- ambiguity is explicit
- timing risk is explicit
- any live exposure risk is noted
- no live order action is taken

## common failure modes

- treating press coverage as enough to settle the market
- skipping the actual resolution text
- failing to identify the official source path
- ignoring stale orders near messy resolution windows
- drifting into thesis generation instead of operational watchfulness

## activation tests

### Should trigger

- "which of these markets are close to resolution?"
- "what official evidence will matter for settlement?"
- "watch this market until it is ready to resolve."
- "are there wording traps or ambiguity here?"
- "do any of my positions need attention before resolution?"

### Should not trigger

- "rank these new markets for research."
- "what is fair value here?"
- "write a market memo."
- "submit an order."
- "review my entire portfolio."

## resource map

- `portfolio-risk-review` — use when the main problem is exposure management across the book
- `market-memo` — use when one name needs a compact live-state read beyond settlement mechanics
- `deep-market-research` — use when the key issue is underlying-event evidence rather than resolution readiness
- `order-ticket` — use when the user explicitly wants a cancel or reduction plan
