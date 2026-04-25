import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildResearchEvidenceTemplate,
  runResearchRequestWorker,
  type AutoTradingResearchRequest,
  type ResearchEvidenceBundle
} from "../packages/auto-trader/src/index.js";
import { openStateStore } from "../packages/state-store/src/index.js";

async function withTempStore(
  fn: (store: ReturnType<typeof openStateStore>) => Promise<void> | void
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-research-worker-"));
  const store = openStateStore(path.join(dir, "polymarket.sqlite"));
  try {
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function isoAfter(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function fixtureResearchRequest(now: Date): AutoTradingResearchRequest {
  return {
    requestId: "research:test:condition:template",
    createdAt: now.toISOString(),
    dueAt: isoAfter(now, 0.5),
    priority: "high",
    marketKey: "condition:template",
    title: "Template market",
    score: 91,
    forecastBlockers: ["independent_forecast_screening_only"],
    reasonCodes: ["forecast_gate:screening_only"],
    requiredArtifact: {
      method: "deep_research_forecast_v1",
      minimumEvidenceItems: 2,
      requiresCounterEvidence: true,
      requiredFields: [
        "fairValueLow",
        "fairValueBase",
        "fairValueHigh",
        "supportsYes",
        "supportsNo",
        "openQuestions",
        "providers",
        "completedAt"
      ],
      forbiddenEvidence: [
        "Polymarket odds",
        "venue price",
        "orderbook",
        "best bid",
        "best ask",
        "spread",
        "recent venue trades",
        "market-implied probability"
      ],
      freshnessHours: 24
    },
    researchQuestion: "Will Template market resolve YES?",
    marketContext: {
      eventTitle: "Template event",
      eventSlug: "template-event",
      categoryGroup: "politics",
      structuralType: "single-binary",
      opportunityMode: "resolution-watch",
      horizonBucket: "short-0-7d",
      endDate: isoAfter(now, 12),
      outcomes: ["Yes", "No"],
      reasonCodes: ["clear_resolution_text"]
    }
  };
}

test("research worker exports pending requests as evidence templates", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const session = store.createAutoTradingSession({
      sessionId: "research-template-session",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:template",
      title: "Template market",
      action: "research_required",
      status: "research",
      score: 91,
      reasonCodes: ["forecast_gate:screening_only"],
      blockers: ["independent_forecast_screening_only"],
      payload: {
        researchRequest: fixtureResearchRequest(now)
      }
    });

    const result = buildResearchEvidenceTemplate(store, {
      sessionId: session.sessionId,
      now,
      limit: 10
    });

    assert.equal(result.scannedDecisions, 1);
    assert.equal(result.pendingRequests, 1);
    assert.equal(result.templates.length, 1);
    const template = result.templates[0];
    assert.equal(template.marketKey, "condition:template");
    assert.equal(template.requiredArtifact.method, "deep_research_forecast_v1");
    assert.equal(template.evidenceBundleTemplate.marketKey, "condition:template");
    assert.equal(template.evidenceBundleTemplate.fairValueBase, null);
    assert.match(template.evidenceBundleTemplate.notes, /external evidence/);
    assert.equal(template.evidenceBundleTemplate.supportsNo[0]?.stance, "supports_no");
  });
});

test("research worker records valid evidence and suppresses completed templates", async () => {
  await withTempStore((store) => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const session = store.createAutoTradingSession({
      sessionId: "research-record-session",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      mandate: {
        budgetUsdc: 30,
        timeframeHours: 24,
        riskProfile: "aggressive",
        mode: "paper"
      }
    });
    store.recordAutoTradingDecision({
      sessionId: session.sessionId,
      iterationId: "iteration-1",
      marketKey: "condition:template",
      title: "Template market",
      action: "research_required",
      status: "research",
      score: 91,
      reasonCodes: ["forecast_gate:screening_only"],
      blockers: ["independent_forecast_screening_only"],
      payload: {
        researchRequest: fixtureResearchRequest(now)
      }
    });
    const bundle: ResearchEvidenceBundle = {
      marketKey: "condition:template",
      title: "Template market",
      question: "Will Template market resolve YES?",
      thesis: "Independent public reporting and official schedules modestly favor YES, while timing uncertainty remains material.",
      fairValueLow: 0.55,
      fairValueBase: 0.64,
      fairValueHigh: 0.72,
      supportsYes: [{
        source: "Official schedule",
        title: "Published deadline remains active",
        url: "https://example.com/schedule",
        summary: "The official schedule still lists the relevant event inside the forecast window.",
        stance: "supports_yes",
        confidence: "medium"
      }],
      supportsNo: [{
        source: "Independent news report",
        title: "Delay risk remains unresolved",
        url: "https://example.com/delay",
        summary: "A non-venue report describes unresolved constraints that could push completion outside the window.",
        stance: "supports_no",
        confidence: "medium"
      }],
      openQuestions: ["Whether the final procedural step occurs before the cutoff."],
      providers: ["unit-test-researcher"],
      notes: "Independent sealed research fixture based only on external evidence and source reasoning.",
      completedAt: now.toISOString(),
      automationName: "unit-test"
    };

    const recorded = runResearchRequestWorker(store, {
      sessionId: session.sessionId,
      now,
      limit: 10,
      evidenceBundles: [bundle]
    });
    assert.equal(recorded.recordedResearchRuns, 1);
    assert.equal(recorded.requests[0]?.status, "recorded");
    assert.ok(recorded.requests[0]?.researchRunId);

    const templateAfterRecord = buildResearchEvidenceTemplate(store, {
      sessionId: session.sessionId,
      now,
      limit: 10
    });
    assert.equal(templateAfterRecord.pendingRequests, 0);
    assert.equal(templateAfterRecord.skippedAlreadyCompleted, 1);
    assert.equal(templateAfterRecord.templates.length, 0);

    const secondRun = runResearchRequestWorker(store, {
      sessionId: session.sessionId,
      now,
      limit: 10,
      evidenceBundles: [bundle]
    });
    assert.equal(secondRun.recordedResearchRuns, 0);
    assert.equal(secondRun.skippedAlreadyCompleted, 1);
  });
});
