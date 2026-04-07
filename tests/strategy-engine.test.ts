import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { defaultRiskLimits } from "../packages/policy-engine/src/index.js";
import {
  buildExecutionQueue,
  defaultStrategyPolicies,
  deriveStrategyCandidate,
  listStrategyCandidates
} from "../packages/strategy-engine/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-state-"));
  const store = openStateStore(path.join(dir, "polymarket.sqlite"));
  try {
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("deriveStrategyCandidate marks a well-researched A-tier market as preview-ready", async () => {
  await withTempStore((store) => {
    store.recordMarketSnapshot({
      title: "Acme quarterly deliveries",
      conditionId: "condition-acme",
      price: 0.45,
      midpoint: 0.45,
      spreadCents: 2,
      liquidityUsd: 25000,
      volumeUsd: 50000,
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ["economics"]
    });
    store.recordClassification({
      conditionId: "condition-acme",
      structuralType: "single-binary",
      category: "economics",
      interestTier: "A",
      modelabilityScore: 80,
      tradabilityScore: 75,
      researchPriorityScore: 78,
      tradeOpportunityScore: 82,
      confidenceScore: 72,
      crossMarketConsistencyScore: 68,
      decision: { source: "test" }
    });
    store.recordResearchRun({
      marketKey: "condition:condition-acme",
      title: "Acme Q2 deliveries",
      question: "Will deliveries exceed 480k?",
      thesis: "Seasonal lift plus current signals support a higher fair value than the market price.",
      fairValueLow: 0.54,
      fairValueBase: 0.58,
      fairValueHigh: 0.62,
      supportsYes: [
        {
          source: "Company filings",
          title: "Production update",
          summary: "Supportive datapoint.",
          stance: "supports-yes",
          confidence: "high"
        }
      ],
      supportsNo: [
        {
          source: "Shipping tracker",
          title: "Risk factor",
          summary: "Important counterpoint.",
          stance: "supports-no",
          confidence: "medium"
        }
      ],
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      synthesis: { fairValueBase: 0.58 }
    });

    const candidate = deriveStrategyCandidate(
      store.getMarketState({ marketKey: "condition:condition-acme" }),
      defaultStrategyPolicies(),
      defaultRiskLimits()
    );

    assert.equal(candidate.status, "preview-ready");
    assert.equal(candidate.action, "prepare-preview");
    assert.equal(candidate.edgeDirection, "buy-yes");
    assert.equal(candidate.recommendedEntry?.preferredSide, "buy-yes");
    assert.ok((candidate.edgePctPoints ?? 0) > 10);
  });
});

test("deriveStrategyCandidate surfaces stale live orders for cancellation", async () => {
  await withTempStore((store) => {
    store.recordMarketSnapshot({
      title: "Policy vote outcome",
      conditionId: "condition-policy",
      price: 0.52,
      midpoint: 0.52,
      spreadCents: 3,
      liquidityUsd: 30000,
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ["politics"]
    });
    store.recordClassification({
      conditionId: "condition-policy",
      interestTier: "B",
      tradeOpportunityScore: 70,
      confidenceScore: 65,
      crossMarketConsistencyScore: 60,
      decision: { source: "test" }
    });
    store.recordResearchRun({
      marketKey: "condition:condition-policy",
      title: "Policy vote",
      question: "Will it pass?",
      thesis: "Fair value is modestly above market.",
      fairValueBase: 0.57,
      supportsYes: [
        {
          source: "Whip count",
          title: "Support",
          summary: "Supportive datapoint.",
          stance: "supports-yes",
          confidence: "high"
        }
      ],
      supportsNo: [
        {
          source: "Floor risk",
          title: "Risk",
          summary: "Risk datapoint.",
          stance: "supports-no",
          confidence: "medium"
        }
      ],
      synthesis: { fairValueBase: 0.57 }
    });
    store.recordOrderSubmission({
      marketKey: "condition:condition-policy",
      orderId: "order-123",
      status: "open_live",
      side: "BUY",
      price: 0.5,
      size: 10,
      submittedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      payload: { source: "test" }
    });

    const candidate = deriveStrategyCandidate(
      store.getMarketState({ marketKey: "condition:condition-policy" }),
      defaultStrategyPolicies(),
      defaultRiskLimits()
    );

    assert.equal(candidate.status, "cancel-stale-order");
    assert.equal(candidate.action, "cancel-orders");
    assert.deepEqual(candidate.staleOrderIds, ["order-123"]);
  });
});

test("buildExecutionQueue prioritizes research-required markets when fair value is missing", async () => {
  await withTempStore((store) => {
    store.recordMarketSnapshot({
      title: "Election runoff",
      conditionId: "condition-election",
      price: 0.39,
      midpoint: 0.39,
      spreadCents: 4,
      liquidityUsd: 18000,
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ["politics"]
    });
    store.recordClassification({
      conditionId: "condition-election",
      interestTier: "A",
      researchPriorityScore: 86,
      tradeOpportunityScore: 79,
      confidenceScore: 68,
      crossMarketConsistencyScore: 71,
      decision: { source: "test" }
    });

    const queue = buildExecutionQueue(store, defaultStrategyPolicies(), defaultRiskLimits(), {
      limit: 10,
      includeWaiting: false
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0]?.action, "run-deep-research");
    assert.equal(queue[0]?.status, "research-required");
  });
});


test("listStrategyCandidates suppresses lower-ranked same-thesis entries", async () => {
  await withTempStore((store) => {
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    store.recordMarketSnapshot({
      title: "Venice mayoral winner - coalition continuity",
      conditionId: "condition-venice-a",
      price: 0.41,
      midpoint: 0.41,
      spreadCents: 2,
      liquidityUsd: 22000,
      volumeUsd: 40000,
      endDate,
      tags: ["politics"]
    });
    store.recordClassification({
      conditionId: "condition-venice-a",
      interestTier: "A",
      researchPriorityScore: 82,
      tradeOpportunityScore: 88,
      confidenceScore: 74,
      crossMarketConsistencyScore: 70,
      thesisKey: "venice-mayor-2026",
      thesisTitle: "Venice mayor 2026",
      decision: { fairValueBase: 0.58 }
    });
    store.recordResearchRun({
      marketKey: "condition:condition-venice-a",
      title: "Venice mayoral winner - continuity",
      question: "Will the continuity bloc win?",
      thesis: "Continuity remains favored versus a fragmented opposition.",
      fairValueBase: 0.58,
      supportsYes: [
        {
          source: "Local poll",
          title: "Continuity ahead",
          summary: "Supportive datapoint.",
          stance: "supports-yes",
          confidence: "high"
        }
      ],
      supportsNo: [
        {
          source: "Opposition coalition",
          title: "Consolidation risk",
          summary: "Counterpoint.",
          stance: "supports-no",
          confidence: "medium"
        }
      ],
      thesisKey: "venice-mayor-2026",
      thesisTitle: "Venice mayor 2026",
      synthesis: { fairValueBase: 0.58, thesisKey: "venice-mayor-2026" }
    });

    store.recordMarketSnapshot({
      title: "Venice mayoral winner - anti-continuity coalition",
      conditionId: "condition-venice-b",
      price: 0.42,
      midpoint: 0.42,
      spreadCents: 2,
      liquidityUsd: 21000,
      volumeUsd: 36000,
      endDate,
      tags: ["politics"]
    });
    store.recordClassification({
      conditionId: "condition-venice-b",
      interestTier: "A",
      researchPriorityScore: 80,
      tradeOpportunityScore: 78,
      confidenceScore: 70,
      crossMarketConsistencyScore: 69,
      thesisKey: "venice-mayor-2026",
      thesisTitle: "Venice mayor 2026",
      decision: { fairValueBase: 0.54 }
    });
    store.recordResearchRun({
      marketKey: "condition:condition-venice-b",
      title: "Venice mayoral winner - opposition",
      question: "Will the opposition coalition win?",
      thesis: "Opposition remains live but is the weaker expression of the same election thesis.",
      fairValueBase: 0.54,
      supportsYes: [
        {
          source: "Local poll",
          title: "Opposition still live",
          summary: "Supportive datapoint.",
          stance: "supports-yes",
          confidence: "medium"
        }
      ],
      supportsNo: [
        {
          source: "Vote fragmentation",
          title: "Fragmentation persists",
          summary: "Counterpoint.",
          stance: "supports-no",
          confidence: "high"
        }
      ],
      thesisKey: "venice-mayor-2026",
      thesisTitle: "Venice mayor 2026",
      synthesis: { fairValueBase: 0.54, thesisKey: "venice-mayor-2026" }
    });

    const candidates = listStrategyCandidates(store, defaultStrategyPolicies(), defaultRiskLimits(), {
      limit: 10,
      includeWaiting: true,
      includeBlocked: true
    });

    const leader = candidates.find((candidate) => candidate.marketKey === "condition:condition-venice-a");
    const follower = candidates.find((candidate) => candidate.marketKey === "condition:condition-venice-b");

    assert.equal(leader?.status, "preview-ready");
    assert.equal(leader?.action, "prepare-preview");
    assert.equal(follower?.status, "wait");
    assert.equal(follower?.action, "wait");
    assert.ok(follower?.blockers.some((blocker) => blocker.startsWith("thesis_peer:")));
  });
});

test("listStrategyCandidates blocks new entries when thesis exposure is already above the configured cap", async () => {
  await withTempStore((store) => {
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    store.recordMarketSnapshot({
      title: "Existing thesis exposure",
      conditionId: "condition-existing-thesis",
      price: 0.62,
      midpoint: 0.62,
      spreadCents: 3,
      liquidityUsd: 25000,
      volumeUsd: 42000,
      endDate,
      tags: ["politics"]
    });
    store.recordThesisLink({
      conditionId: "condition-existing-thesis",
      title: "Existing thesis exposure",
      thesisKey: "cabinet-formation-italy",
      thesisTitle: "Italy cabinet formation",
      confidence: 90,
      isPrimary: true
    });
    store.recordPortfolioSnapshot({
      ownerAddress: "0xabc",
      grossCurrentValueUsd: 55,
      source: "test",
      current: [
        {
          conditionId: "condition-existing-thesis",
          title: "Existing thesis exposure",
          currentValue: 55,
          outcome: "YES",
          asset_id: "tok-existing",
          size: 100,
          avgPrice: 0.55
        }
      ]
    });

    store.recordMarketSnapshot({
      title: "New correlated thesis expression",
      conditionId: "condition-new-thesis",
      price: 0.44,
      midpoint: 0.44,
      spreadCents: 2,
      liquidityUsd: 26000,
      volumeUsd: 38000,
      endDate,
      tags: ["politics"]
    });
    store.recordClassification({
      conditionId: "condition-new-thesis",
      interestTier: "A",
      researchPriorityScore: 84,
      tradeOpportunityScore: 83,
      confidenceScore: 73,
      crossMarketConsistencyScore: 72,
      thesisKey: "cabinet-formation-italy",
      thesisTitle: "Italy cabinet formation",
      decision: { fairValueBase: 0.58 }
    });
    store.recordResearchRun({
      marketKey: "condition:condition-new-thesis",
      title: "New correlated thesis expression",
      question: "Will the cabinet form on time?",
      thesis: "This market is another expression of the same cabinet-formation thesis.",
      fairValueBase: 0.58,
      supportsYes: [
        {
          source: "Negotiation tracker",
          title: "Talks progressing",
          summary: "Supportive datapoint.",
          stance: "supports-yes",
          confidence: "medium"
        }
      ],
      supportsNo: [
        {
          source: "Coalition friction",
          title: "Key risk",
          summary: "Counterpoint.",
          stance: "supports-no",
          confidence: "medium"
        }
      ],
      thesisKey: "cabinet-formation-italy",
      thesisTitle: "Italy cabinet formation",
      synthesis: { fairValueBase: 0.58, thesisKey: "cabinet-formation-italy" }
    });

    const candidates = listStrategyCandidates(
      store,
      {
        ...defaultStrategyPolicies(),
        maxThesisExposureUsd: 40
      },
      defaultRiskLimits(),
      {
        limit: 10,
        includeWaiting: true,
        includeBlocked: true
      }
    );

    const candidate = candidates.find((entry) => entry.marketKey === "condition:condition-new-thesis");
    assert.equal(candidate?.status, "blocked");
    assert.ok(candidate?.blockers.some((blocker) => blocker.startsWith("thesis_exposure_limit:")));
  });
});
