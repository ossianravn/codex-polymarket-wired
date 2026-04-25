import { randomUUID } from "node:crypto";

import type {
  StateStore,
  StoredAutoTradingDecisionRecord,
  StoredPaperTradingLedger
} from "../../state-store/src/index.js";
import type {
  AutoTradingAction,
  AutoTradingIterationResult
} from "./index.js";

export type AutoTradingAgentAction =
  | "paper_buy_yes"
  | "paper_sell_yes"
  | "live_buy_yes"
  | "live_sell_yes"
  | "hold"
  | "research_required"
  | "skip";

export interface AutoTradingAgentBriefInput {
  iteration: AutoTradingIterationResult;
  candidateLimit?: number;
  includePrompt?: boolean;
}

export interface AutoTradingAgentBriefCandidate {
  decisionRef: string;
  marketKey?: string;
  title?: string;
  currentSystemAction: AutoTradingAction;
  status: string;
  score: number;
  targetPrice?: number;
  maxSpendUsdc?: number;
  tokenId?: string;
  blockers: string[];
  reasonCodes: string[];
  forecastEdge?: Record<string, unknown>;
  market: {
    eventTitle?: string;
    eventSlug?: string;
    categoryGroup?: string;
    structuralType?: string;
    opportunityMode?: string;
    horizonBucket?: string;
    endDate?: string;
    liquidityUsd?: number;
    volume24hUsd?: number;
    impliedProb?: number;
    bestBid?: number;
    bestAsk?: number;
    spreadCents?: number;
    outcomes: string[];
    resolutionText?: string;
    disqualifiers: string[];
  };
}

export interface AutoTradingAgentBrief {
  kind: "polymarket_autotrader_agent_brief_v1";
  generatedAt: string;
  session: {
    sessionId: string;
    status: string;
    mode: string;
    riskProfile: string;
    budgetUsdc: number;
    timeframeHours: number;
    startedAt: string;
    endsAt: string;
  };
  mandate: {
    maxSingleOrderUsdc: number;
    minOrderUsdc: number;
    maxOpenPositions: number;
    maxEventPositions: number;
    maxEventExposureUsdc: number;
    maxMarketHorizonHours: number;
    minLiquidityUsdc: number;
    maxSpreadCents: number;
    stopLossUsdc: number;
    maxDailyLossUsdc: number;
  };
  ledger: StoredPaperTradingLedger["summary"];
  openPositions: Array<{
    marketKey: string;
    title?: string;
    shares: number;
    averagePrice: number;
    currentPrice?: number;
    currentValueUsdc?: number;
    unrealizedPnlUsdc?: number;
    unrealizedPnlPct?: number;
  }>;
  guardrails: string[];
  externalReferenceTakeaways: string[];
  agentInstructions: string[];
  responseSchema: Record<string, unknown>;
  candidates: AutoTradingAgentBriefCandidate[];
  prompt?: string;
}

export interface AutoTradingAgentDecision {
  decisionRef?: string;
  marketKey?: string;
  action: AutoTradingAgentAction;
  confidence: number;
  rationale: string;
  limitPrice?: number;
  maxSpendUsdc?: number;
  shares?: number;
  nextCheckMinutes?: number;
  evidenceRefs?: string[];
}

export interface AutoTradingAgentDecisionPlan {
  kind?: "polymarket_autotrader_agent_decision_plan_v1";
  sessionId: string;
  generatedAt?: string;
  agentName?: string;
  decisions: AutoTradingAgentDecision[];
}

export interface AutoTradingAgentAppliedDecision {
  input: AutoTradingAgentDecision;
  status: "recorded" | "blocked";
  storedDecision?: StoredAutoTradingDecisionRecord;
  blockers: string[];
  paperOrder?: Record<string, unknown>;
  paperFill?: Record<string, unknown>;
}

export interface AutoTradingAgentDecisionApplyResult {
  kind: "polymarket_autotrader_agent_apply_result_v1";
  sessionId: string;
  generatedAt: string;
  recorded: number;
  blocked: number;
  liveSubmissionBlocked: true;
  ledger: StoredPaperTradingLedger;
  decisions: AutoTradingAgentAppliedDecision[];
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

function roundShares(value: number): number {
  return Number(value.toFixed(6));
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0.001, Math.min(0.999, Number(value.toFixed(4))));
}

function isBuyAction(action: AutoTradingAgentAction): boolean {
  return action === "paper_buy_yes" || action === "live_buy_yes";
}

function isSellAction(action: AutoTradingAgentAction): boolean {
  return action === "paper_sell_yes" || action === "live_sell_yes";
}

function isExecutableAction(action: AutoTradingAgentAction): boolean {
  return isBuyAction(action) || isSellAction(action);
}

function systemActionForAgentAction(action: AutoTradingAgentAction): AutoTradingAction {
  if (action === "hold") {
    return "monitor";
  }
  return action as AutoTradingAction;
}

function actionStatus(action: AutoTradingAgentAction, blockers: string[]): "proposed" | "blocked" | "watch" | "research" {
  if (blockers.length > 0) {
    return "blocked";
  }
  if (action === "research_required") {
    return "research";
  }
  if (action === "hold" || action === "skip") {
    return "watch";
  }
  return "proposed";
}

function addMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + Math.max(1, minutes) * 60_000).toISOString();
}

function candidateDecisionRef(index: number): string {
  return `candidate-${String(index + 1).padStart(2, "0")}`;
}

function candidateMarket(candidate: AutoTradingIterationResult["candidates"][number]): AutoTradingAgentBriefCandidate["market"] {
  return {
    eventTitle: optionalString(candidate.market.eventTitle),
    eventSlug: optionalString(candidate.market.eventSlug),
    categoryGroup: optionalString(candidate.market.categoryGroup),
    structuralType: optionalString(candidate.market.structuralType),
    opportunityMode: optionalString(candidate.market.opportunityMode),
    horizonBucket: optionalString(candidate.market.horizonBucket),
    endDate: optionalString(candidate.market.endDate),
    liquidityUsd: asNumber(candidate.market.liquidityUsd),
    volume24hUsd: asNumber(candidate.market.volume24hUsd),
    impliedProb: asNumber(candidate.market.impliedProb),
    bestBid: asNumber(candidate.market.bestBid),
    bestAsk: asNumber(candidate.market.bestAsk),
    spreadCents: asNumber(candidate.market.spreadCents),
    outcomes: asStringArray(candidate.market.outcomes),
    resolutionText: optionalString(candidate.market.resolutionText),
    disqualifiers: asStringArray(candidate.market.disqualifiers)
  };
}

function makeAgentPrompt(brief: Omit<AutoTradingAgentBrief, "prompt">): string {
  const candidateLines = brief.candidates.map((candidate) => {
    const price = candidate.targetPrice === undefined ? "no target" : `target ${candidate.targetPrice}`;
    const spend = candidate.maxSpendUsdc === undefined ? "no spend cap" : `max $${candidate.maxSpendUsdc}`;
    const blockers = candidate.blockers.length > 0 ? ` blockers=${candidate.blockers.join(",")}` : "";
    return `- ${candidate.decisionRef}: ${candidate.title ?? candidate.marketKey ?? "unknown"} | ${candidate.currentSystemAction} | score ${candidate.score} | ${price} | ${spend}${blockers}`;
  });
  return [
    "# Polymarket Agent Trading Brief",
    "",
    "You are the trading decision-maker. Return only JSON matching the response schema.",
    "The code will enforce all budget, session, paper/live, and no-submit guards after your response.",
    "",
    `Session: ${brief.session.sessionId} (${brief.session.mode}, ${brief.session.riskProfile}, ${brief.session.timeframeHours}h)`,
    `Budget: $${brief.ledger.spentUsdc} spent, $${brief.ledger.remainingBudgetUsdc} remaining, PnL $${brief.ledger.totalPnlUsdc}`,
    "",
    "Rules:",
    ...brief.agentInstructions.map((line) => `- ${line}`),
    "",
    "Candidates:",
    ...candidateLines
  ].join("\n");
}

export function buildAutoTradingAgentBrief(input: AutoTradingAgentBriefInput): AutoTradingAgentBrief {
  const candidateLimit = Math.max(1, Math.min(50, input.candidateLimit ?? 15));
  const iteration = input.iteration;
  const availableBuyBudgetUsdc = Math.min(
    iteration.ledger.summary.remainingBudgetUsdc,
    iteration.mandate.maxSingleOrderUsdc
  );
  const candidates = iteration.candidates.slice(0, candidateLimit).map((candidate, index) => ({
    decisionRef: candidateDecisionRef(index),
    marketKey: candidate.marketKey,
    title: candidate.title,
    currentSystemAction: candidate.action,
    status: candidate.status,
    score: candidate.score,
    targetPrice: candidate.targetPrice,
    maxSpendUsdc: roundMoney(Math.max(0, Math.min(
      candidate.allocatedBudgetUsdc ?? availableBuyBudgetUsdc,
      availableBuyBudgetUsdc
    ))),
    tokenId: candidate.tokenId,
    blockers: candidate.blockers,
    reasonCodes: candidate.reasonCodes,
    forecastEdge: candidate.forecastEdge as unknown as Record<string, unknown> | undefined,
    market: candidateMarket(candidate)
  }));
  const briefWithoutPrompt = {
    kind: "polymarket_autotrader_agent_brief_v1" as const,
    generatedAt: iteration.generatedAt,
    session: {
      sessionId: iteration.session.sessionId,
      status: iteration.session.status,
      mode: iteration.session.mode,
      riskProfile: iteration.session.riskProfile,
      budgetUsdc: iteration.session.budgetUsdc,
      timeframeHours: iteration.session.timeframeHours,
      startedAt: iteration.session.startedAt,
      endsAt: iteration.session.endsAt
    },
    mandate: {
      maxSingleOrderUsdc: iteration.mandate.maxSingleOrderUsdc,
      minOrderUsdc: iteration.mandate.minOrderUsdc,
      maxOpenPositions: iteration.mandate.maxOpenPositions,
      maxEventPositions: iteration.mandate.maxEventPositions,
      maxEventExposureUsdc: iteration.mandate.maxEventExposureUsdc,
      maxMarketHorizonHours: iteration.mandate.maxMarketHorizonHours,
      minLiquidityUsdc: iteration.mandate.minLiquidityUsdc,
      maxSpreadCents: iteration.mandate.maxSpreadCents,
      stopLossUsdc: iteration.mandate.stopLossUsdc,
      maxDailyLossUsdc: iteration.mandate.maxDailyLossUsdc
    },
    ledger: iteration.ledger.summary,
    openPositions: iteration.ledger.positions
      .filter((position) => position.status === "open")
      .map((position) => ({
        marketKey: position.marketKey,
        title: position.title,
        shares: position.shares,
        averagePrice: position.averagePrice,
        currentPrice: position.currentPrice,
        currentValueUsdc: position.currentValueUsdc,
        unrealizedPnlUsdc: position.unrealizedPnlUsdc,
        unrealizedPnlPct: position.unrealizedPnlPct
      })),
    guardrails: [
      "No live order submission is performed by this agent loop.",
      "Paper actions can be recorded only inside a paper session.",
      "Live actions can only become previewable decisions and still require the existing execution gate.",
      "Executable decisions with existing blockers are rejected.",
      "Buy notional is capped by remaining paper budget and maxSingleOrderUsdc.",
      "Missing token, invalid price, stale/blocked market, or inactive session blocks execution."
    ],
    externalReferenceTakeaways: [
      "Use separate roles: data scanner, reasoning agent, and execution guard instead of one opaque bot.",
      "The reasoning agent returns probability, confidence, recommendation, and rationale; the code validates and executes.",
      "Ultra-short crypto markets are latency-sensitive; broad opportunity filtering and explicit risk caps are safer first production targets.",
      "Polymarket integration should preserve orderbook, market-data, order-type, and user-stream seams for later live operation."
    ],
    agentInstructions: [
      "Choose TRADE only when the brief plus independent forecast support a concrete edge.",
      "Use hold when the candidate is interesting but the price, evidence, or timing is not good enough.",
      "Use research_required when a candidate needs new non-venue evidence before price comparison.",
      "Respect the session timeframe and do not allocate to markets outside it.",
      "For paper_buy_yes, provide limitPrice and maxSpendUsdc.",
      "For paper_sell_yes, provide limitPrice or shares when reducing an open position.",
      "Never request live submission; live choices are previews only."
    ],
    responseSchema: {
      kind: "polymarket_autotrader_agent_decision_plan_v1",
      sessionId: iteration.session.sessionId,
      agentName: "string",
      decisions: [{
        decisionRef: "candidate-01",
        marketKey: "optional market key",
        action: "paper_buy_yes | paper_sell_yes | hold | research_required | skip",
        confidence: "0..1",
        rationale: "short explanation",
        limitPrice: "optional 0..1",
        maxSpendUsdc: "optional number",
        shares: "optional number",
        nextCheckMinutes: "optional integer",
        evidenceRefs: ["optional source ids or forecast refs"]
      }]
    },
    candidates
  };
  return {
    ...briefWithoutPrompt,
    prompt: input.includePrompt === false ? undefined : makeAgentPrompt(briefWithoutPrompt)
  };
}

function findCandidate(
  brief: AutoTradingAgentBrief,
  decision: AutoTradingAgentDecision
): AutoTradingAgentBriefCandidate | undefined {
  return brief.candidates.find((candidate) =>
    (decision.decisionRef && candidate.decisionRef === decision.decisionRef) ||
    (decision.marketKey && candidate.marketKey === decision.marketKey)
  );
}

function validateAgentDecision(
  brief: AutoTradingAgentBrief,
  ledger: StoredPaperTradingLedger,
  candidate: AutoTradingAgentBriefCandidate | undefined,
  decision: AutoTradingAgentDecision
): string[] {
  const blockers: string[] = [];
  if (brief.session.status !== "active") {
    blockers.push(`session_${brief.session.status}`);
  }
  if (!candidate) {
    blockers.push("unknown_candidate_ref");
    return blockers;
  }
  if (!decision.rationale || decision.rationale.trim().length < 8) {
    blockers.push("missing_agent_rationale");
  }
  if (!Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1) {
    blockers.push("invalid_agent_confidence");
  }
  if (isExecutableAction(decision.action) && candidate.blockers.length > 0) {
    blockers.push("candidate_has_system_blockers");
  }
  if (isExecutableAction(decision.action) && !candidate.tokenId) {
    blockers.push("missing_token_id");
  }
  if (decision.action.startsWith("paper_") && brief.session.mode !== "paper") {
    blockers.push("paper_action_requires_paper_session");
  }
  if (decision.action.startsWith("live_") && brief.session.mode === "paper") {
    blockers.push("live_action_blocked_in_paper_session");
  }
  if (decision.action.startsWith("live_")) {
    blockers.push("live_submission_blocked_agent_loop");
  }
  if (isBuyAction(decision.action)) {
    const limitPrice = decision.limitPrice ?? candidate.targetPrice;
    const maxSpendUsdc = decision.maxSpendUsdc ?? candidate.maxSpendUsdc ?? 0;
    if (limitPrice === undefined || limitPrice <= 0 || limitPrice > 1) {
      blockers.push("invalid_limit_price");
    }
    if (maxSpendUsdc < brief.mandate.minOrderUsdc) {
      blockers.push("below_min_order");
    }
    if (maxSpendUsdc > brief.mandate.maxSingleOrderUsdc + 0.000001) {
      blockers.push("above_max_single_order");
    }
    if (maxSpendUsdc > ledger.summary.remainingBudgetUsdc + 0.000001) {
      blockers.push("insufficient_remaining_budget");
    }
  }
  if (isSellAction(decision.action)) {
    const openPosition = ledger.positions.find((position) => position.status === "open" && position.marketKey === candidate.marketKey);
    if (!openPosition) {
      blockers.push("missing_open_position");
    }
    if (decision.shares !== undefined && decision.shares <= 0) {
      blockers.push("invalid_sell_shares");
    }
    if (openPosition && decision.shares !== undefined && decision.shares > openPosition.shares + 0.000001) {
      blockers.push("sell_shares_exceed_position");
    }
  }
  return Array.from(new Set(blockers));
}

function recordPaperAgentExecution(
  store: StateStore,
  args: {
    brief: AutoTradingAgentBrief;
    candidate: AutoTradingAgentBriefCandidate;
    decision: AutoTradingAgentDecision;
    storedDecision: StoredAutoTradingDecisionRecord;
    iterationId: string;
    now: Date;
  }
): { paperOrder?: Record<string, unknown>; paperFill?: Record<string, unknown> } {
  if (!args.candidate.marketKey || !args.candidate.tokenId) {
    return {};
  }
  const price = clampProbability(args.decision.limitPrice ?? args.candidate.targetPrice ?? args.candidate.market.impliedProb ?? 0.5);
  const market = args.candidate.market;
  const bestBid = market.bestBid;
  const bestAsk = market.bestAsk;
  if (args.decision.action === "paper_buy_yes") {
    const notional = roundMoney(Math.min(
      args.decision.maxSpendUsdc ?? args.candidate.maxSpendUsdc ?? args.brief.mandate.maxSingleOrderUsdc,
      args.brief.mandate.maxSingleOrderUsdc
    ));
    const shares = roundShares(args.decision.shares ?? notional / Math.max(0.001, price));
    const executable = bestAsk !== undefined && price >= bestAsk;
    const fillPrice = executable ? bestAsk : undefined;
    const filledNotionalUsdc = fillPrice === undefined ? 0 : roundMoney(Math.min(notional, shares * fillPrice));
    const filledShares = fillPrice === undefined ? 0 : roundShares(filledNotionalUsdc / fillPrice);
    const paperOrder = store.recordPaperTradingOrder({
      sessionId: args.brief.session.sessionId,
      iterationId: args.iterationId,
      decisionId: args.storedDecision.decisionId,
      marketKey: args.candidate.marketKey,
      title: args.candidate.title,
      side: "buy_yes",
      limitPrice: price,
      requestedShares: shares,
      requestedNotionalUsdc: notional,
      filledShares,
      filledNotionalUsdc,
      status: executable ? "filled" : "missed",
      createdAt: args.now.toISOString(),
      expiresAt: addMinutes(args.now, args.decision.nextCheckMinutes ?? 15),
      metadata: {
        executionModel: "agent_paper_execution_v1",
        reasonCodes: executable ? ["agent_crossed_best_ask"] : ["agent_limit_not_executable"],
        bestBid,
        bestAsk,
        agentConfidence: args.decision.confidence,
        agentRationale: args.decision.rationale
      }
    });
    if (!executable || fillPrice === undefined || filledShares <= 0) {
      return { paperOrder: paperOrder as unknown as Record<string, unknown> };
    }
    const paperFill = store.recordPaperTradingFill({
      sessionId: args.brief.session.sessionId,
      iterationId: args.iterationId,
      decisionId: args.storedDecision.decisionId,
      marketKey: args.candidate.marketKey,
      title: args.candidate.title,
      side: "buy_yes",
      price: fillPrice,
      shares: filledShares,
      costUsdc: filledNotionalUsdc,
      filledAt: args.now.toISOString(),
      metadata: {
        eventKey: args.candidate.market.eventSlug ? `eventSlug:${args.candidate.market.eventSlug}` : undefined,
        tokenId: args.candidate.tokenId,
        score: args.candidate.score,
        mode: args.brief.session.mode,
        endDate: args.candidate.market.endDate,
        paperOrderId: paperOrder.paperOrderId,
        agentDecision: args.decision
      }
    });
    return {
      paperOrder: paperOrder as unknown as Record<string, unknown>,
      paperFill: paperFill as unknown as Record<string, unknown>
    };
  }
  if (args.decision.action === "paper_sell_yes") {
    const ledger = store.getPaperTradingLedger(args.brief.session.sessionId);
    const position = ledger.positions.find((entry) => entry.status === "open" && entry.marketKey === args.candidate.marketKey);
    if (!position) {
      return {};
    }
    const shares = roundShares(Math.min(args.decision.shares ?? position.shares, position.shares));
    const executable = bestBid !== undefined ? price <= bestBid : position.currentPrice !== undefined;
    const fillPrice = executable ? (bestBid ?? position.currentPrice) : undefined;
    const filledNotionalUsdc = fillPrice === undefined ? 0 : roundMoney(shares * fillPrice);
    const paperOrder = store.recordPaperTradingOrder({
      sessionId: args.brief.session.sessionId,
      iterationId: args.iterationId,
      decisionId: args.storedDecision.decisionId,
      marketKey: args.candidate.marketKey,
      title: args.candidate.title,
      side: "sell_yes",
      limitPrice: price,
      requestedShares: shares,
      requestedNotionalUsdc: roundMoney(shares * price),
      filledShares: fillPrice === undefined ? 0 : shares,
      filledNotionalUsdc,
      status: executable ? "filled" : "missed",
      createdAt: args.now.toISOString(),
      expiresAt: addMinutes(args.now, args.decision.nextCheckMinutes ?? 15),
      metadata: {
        executionModel: "agent_paper_execution_v1",
        reasonCodes: executable ? ["agent_crossed_best_bid"] : ["agent_limit_not_executable"],
        bestBid,
        bestAsk,
        agentConfidence: args.decision.confidence,
        agentRationale: args.decision.rationale
      }
    });
    if (!executable || fillPrice === undefined || shares <= 0) {
      return { paperOrder: paperOrder as unknown as Record<string, unknown> };
    }
    const paperFill = store.recordPaperTradingFill({
      sessionId: args.brief.session.sessionId,
      iterationId: args.iterationId,
      decisionId: args.storedDecision.decisionId,
      marketKey: args.candidate.marketKey,
      title: args.candidate.title,
      side: "sell_yes",
      price: fillPrice,
      shares,
      costUsdc: filledNotionalUsdc,
      filledAt: args.now.toISOString(),
      metadata: {
        eventKey: args.candidate.market.eventSlug ? `eventSlug:${args.candidate.market.eventSlug}` : undefined,
        tokenId: args.candidate.tokenId,
        mode: args.brief.session.mode,
        exitReasonCodes: ["agent_exit"],
        paperOrderId: paperOrder.paperOrderId,
        agentDecision: args.decision
      }
    });
    return {
      paperOrder: paperOrder as unknown as Record<string, unknown>,
      paperFill: paperFill as unknown as Record<string, unknown>
    };
  }
  return {};
}

export function applyAutoTradingAgentDecisionPlan(
  store: StateStore,
  brief: AutoTradingAgentBrief,
  plan: AutoTradingAgentDecisionPlan,
  options: { now?: Date; iterationId?: string } = {}
): AutoTradingAgentDecisionApplyResult {
  if (plan.sessionId !== brief.session.sessionId) {
    throw new Error(`Agent plan session ${plan.sessionId} does not match brief session ${brief.session.sessionId}.`);
  }
  const now = options.now ?? new Date();
  const iterationId = options.iterationId ?? `agent:${randomUUID()}`;
  let ledger = store.getPaperTradingLedger(brief.session.sessionId);
  const applied: AutoTradingAgentAppliedDecision[] = [];
  for (const decision of plan.decisions.slice(0, 25)) {
    const candidate = findCandidate(brief, decision);
    const blockers = validateAgentDecision(brief, ledger, candidate, decision);
    const status = actionStatus(decision.action, blockers);
    const action = systemActionForAgentAction(decision.action);
    const targetPrice = candidate
      ? clampProbability(decision.limitPrice ?? candidate.targetPrice ?? candidate.market.impliedProb ?? 0.5)
      : undefined;
    const allocatedBudgetUsdc = isBuyAction(decision.action)
      ? roundMoney(decision.maxSpendUsdc ?? candidate?.maxSpendUsdc ?? 0)
      : undefined;
    const shares = decision.shares ?? (
      allocatedBudgetUsdc !== undefined && targetPrice !== undefined
        ? roundShares(allocatedBudgetUsdc / Math.max(0.001, targetPrice))
        : undefined
    );
    const storedDecision = store.recordAutoTradingDecision({
      sessionId: brief.session.sessionId,
      iterationId,
      marketKey: candidate?.marketKey ?? decision.marketKey,
      title: candidate?.title,
      action,
      status,
      score: candidate?.score,
      allocatedBudgetUsdc,
      targetPrice,
      nextCheckAt: addMinutes(now, decision.nextCheckMinutes ?? 15),
      reasonCodes: [
        "agent_decision",
        `agent_confidence:${Number(decision.confidence.toFixed(4))}`,
        ...(candidate?.reasonCodes ?? [])
      ],
      blockers,
      payload: {
        agentDecision: decision,
        tokenId: candidate?.tokenId,
        shares,
        market: candidate?.market,
        liveSubmissionEnabled: false
      },
      createdAt: now.toISOString()
    });
    const paperExecution = blockers.length === 0 && candidate && decision.action.startsWith("paper_")
      ? recordPaperAgentExecution(store, {
        brief,
        candidate,
        decision,
        storedDecision,
        iterationId,
        now
      })
      : {};
    store.markPaperTradingPositions(brief.session.sessionId, undefined, now.toISOString());
    ledger = store.getPaperTradingLedger(brief.session.sessionId);
    applied.push({
      input: decision,
      status: blockers.length > 0 ? "blocked" : "recorded",
      storedDecision,
      blockers,
      ...paperExecution
    });
  }
  return {
    kind: "polymarket_autotrader_agent_apply_result_v1",
    sessionId: brief.session.sessionId,
    generatedAt: now.toISOString(),
    recorded: applied.filter((entry) => entry.status === "recorded").length,
    blocked: applied.filter((entry) => entry.status === "blocked").length,
    liveSubmissionBlocked: true,
    ledger,
    decisions: applied
  };
}
