---
name: deep-market-research
description: perform deep research for a polymarket market, event, or thesis. use when the user wants fair-value work, evidence gathering, catalyst mapping, linked-market comparisons, or a detailed explanation of whether the market looks mispriced. for wide candidate sets or triage questions, use opportunity-classifier first.
---

# deep market research

Blend Polymarket data with any available external research tools or connectors.

## workflow

1. Resolve the target market.
   - For one market, resolve it directly.
   - For many candidates, run `opportunity-classifier` first and shortlist only the names that deserve a full fair-value pass.
2. Pull a full market snapshot and recent price/trade context.
3. Build an evidence map:
   - official or primary-source resolution evidence
   - current news or research if web/connectors are available
   - related markets or cross-market signals
4. Estimate a fair-value range in percentage points.
5. Compare the fair-value range with the live implied probability.
6. State the strongest reasons the market could still be right.

## output requirements

Always distinguish:
- **observed** market data
- **external evidence**
- **your inference**

## output structure

# [market title]

## thesis in one paragraph

## current market pricing
- live implied probability
- recent move
- spread / liquidity notes

## evidence map
- evidence that supports yes
- evidence that supports no
- unresolved questions

## linked markets
- markets that should move together
- possible inconsistencies

## fair-value range
- low
- base
- high

## what would change the view
- disconfirming evidence
- next catalyst
- reasons not to trade yet

## guardrails

- Do not place trades here.
- If no external research tools are available, say that clearly.
- For broad scans or multi-market ranking, use `opportunity-classifier` first.
- If the user wants sizing or entries, hand off to `strategy-draft`.
