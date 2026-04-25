import type {
  StateStore,
  StoredAutoTradingDecisionRecord,
  StoredAutoTradingSessionRecord
} from "../../state-store/src/index.js";
import type { AutoTradingResearchRequest } from "./index.js";

export interface ResearchEvidenceItem {
  source: string;
  title: string;
  url?: string;
  summary: string;
  stance: "supports_yes" | "supports_no" | "neutral" | string;
  confidence?: number | string;
}

export interface ResearchEvidenceBundle {
  marketKey: string;
  title?: string;
  question?: string;
  thesis: string;
  fairValueLow: number;
  fairValueBase: number;
  fairValueHigh: number;
  supportsYes: ResearchEvidenceItem[];
  supportsNo: ResearchEvidenceItem[];
  openQuestions?: string[];
  providers?: string[];
  notes?: string;
  completedAt?: string;
  skillVersion?: string;
  policyVersion?: string;
  modelId?: string;
  promptHash?: string;
  automationName?: string;
}

export interface ResearchRequestWorkerInput {
  sessionId?: string;
  limit?: number;
  now?: Date;
  evidenceBundles?: ResearchEvidenceBundle[];
  markDecisionPayload?: boolean;
}

export interface ResearchRequestWorkerResult {
  generatedAt: string;
  scannedDecisions: number;
  pendingRequests: number;
  recordedResearchRuns: number;
  skippedWithoutEvidence: number;
  skippedAlreadyCompleted: number;
  skippedInvalidEvidence: number;
  requests: Array<{
    decisionId: string;
    sessionId: string;
    marketKey: string;
    status: "recorded" | "pending" | "already_completed" | "invalid_evidence";
    researchRunId?: string;
    reasonCodes: string[];
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeProbability(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  const probability = numeric > 1 ? numeric / 100 : numeric;
  return probability > 0 && probability < 1 ? Number(probability.toFixed(4)) : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function evidenceStance(item: ResearchEvidenceItem): "yes" | "no" | "neutral" {
  const stance = String(item.stance ?? "").toLowerCase();
  if (["supports_no", "no", "oppose", "bearish", "negative", "counter"].some((token) => stance.includes(token))) {
    return "no";
  }
  if (["supports_yes", "yes", "support", "bullish", "positive"].some((token) => stance.includes(token))) {
    return "yes";
  }
  return "neutral";
}

function textHasVenuePriceContamination(values: unknown[]): boolean {
  const text = values.map((value) => String(value ?? "").toLowerCase()).join("\n");
  return [
    "venue price",
    "venue market price",
    "exchange market price",
    "market-implied",
    "market implied",
    "polymarket odds",
    "polymarket price",
    "orderbook",
    "order book",
    "best bid",
    "best ask",
    "midpoint"
  ].some((token) => text.includes(token));
}

function decisionResearchRequest(decision: StoredAutoTradingDecisionRecord): AutoTradingResearchRequest | undefined {
  return asRecord(decision.payload.researchRequest) as unknown as AutoTradingResearchRequest | undefined;
}

function decisionResearchStatus(decision: StoredAutoTradingDecisionRecord): Record<string, unknown> | undefined {
  return asRecord(decision.payload.researchRequestStatus);
}

function evidenceBundleMap(bundles: ResearchEvidenceBundle[] | undefined): Map<string, ResearchEvidenceBundle> {
  const output = new Map<string, ResearchEvidenceBundle>();
  for (const bundle of bundles ?? []) {
    output.set(bundle.marketKey, bundle);
  }
  return output;
}

function validateEvidenceBundle(bundle: ResearchEvidenceBundle): string[] {
  const reasons: string[] = [];
  const fairValueLow = normalizeProbability(bundle.fairValueLow);
  const fairValueBase = normalizeProbability(bundle.fairValueBase);
  const fairValueHigh = normalizeProbability(bundle.fairValueHigh);
  if (fairValueLow === undefined || fairValueBase === undefined || fairValueHigh === undefined) {
    reasons.push("invalid_fair_value_probability");
  } else if (fairValueLow > fairValueBase || fairValueBase > fairValueHigh) {
    reasons.push("invalid_fair_value_interval");
  }
  if (!bundle.thesis.trim()) {
    reasons.push("missing_thesis");
  }
  const evidence = [...bundle.supportsYes, ...bundle.supportsNo];
  if (evidence.length < 2) {
    reasons.push("insufficient_evidence_items");
  }
  if (bundle.supportsNo.filter((item) => evidenceStance(item) === "no").length < 1) {
    reasons.push("missing_counter_evidence");
  }
  if (textHasVenuePriceContamination([
    bundle.title,
    bundle.question,
    bundle.thesis,
    bundle.notes,
    ...asStringArray(bundle.providers),
    ...evidence.flatMap((item) => [item.source, item.title, item.summary])
  ])) {
    reasons.push("venue_price_contaminated_evidence");
  }
  return reasons;
}

function storedEvidenceItems(items: ResearchEvidenceItem[]): Array<{
  source: string;
  title: string;
  url?: string;
  summary: string;
  stance: string;
  confidence: string;
}> {
  return items.map((item) => ({
    source: item.source,
    title: item.title,
    url: item.url,
    summary: item.summary,
    stance: item.stance,
    confidence: String(item.confidence ?? "unknown")
  }));
}

function sessionsToScan(store: StateStore, sessionId?: string): StoredAutoTradingSessionRecord[] {
  if (sessionId) {
    const session = store.getAutoTradingSession(sessionId);
    return session ? [session] : [];
  }
  return store.listAutoTradingSessions({ status: "active", limit: 5 });
}

export function runResearchRequestWorker(
  store: StateStore,
  input: ResearchRequestWorkerInput = {}
): ResearchRequestWorkerResult {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  const evidenceByMarketKey = evidenceBundleMap(input.evidenceBundles);
  const markDecisionPayload = input.markDecisionPayload ?? true;
  const result: ResearchRequestWorkerResult = {
    generatedAt: now.toISOString(),
    scannedDecisions: 0,
    pendingRequests: 0,
    recordedResearchRuns: 0,
    skippedWithoutEvidence: 0,
    skippedAlreadyCompleted: 0,
    skippedInvalidEvidence: 0,
    requests: []
  };

  for (const session of sessionsToScan(store, input.sessionId)) {
    const decisions = store.listAutoTradingDecisions({ sessionId: session.sessionId, limit });
    result.scannedDecisions += decisions.length;
    for (const decision of decisions) {
      const request = decisionResearchRequest(decision);
      if (!request?.marketKey) {
        continue;
      }
      const existingStatus = decisionResearchStatus(decision);
      if (existingStatus?.status === "recorded" && typeof existingStatus.researchRunId === "string") {
        result.skippedAlreadyCompleted += 1;
        result.requests.push({
          decisionId: decision.decisionId,
          sessionId: decision.sessionId,
          marketKey: request.marketKey,
          status: "already_completed",
          researchRunId: existingStatus.researchRunId,
          reasonCodes: ["research_request_already_recorded"]
        });
        continue;
      }

      result.pendingRequests += 1;
      const bundle = evidenceByMarketKey.get(request.marketKey);
      if (!bundle) {
        result.skippedWithoutEvidence += 1;
        result.requests.push({
          decisionId: decision.decisionId,
          sessionId: decision.sessionId,
          marketKey: request.marketKey,
          status: "pending",
          reasonCodes: ["missing_independent_evidence_bundle"]
        });
        continue;
      }

      const validationErrors = validateEvidenceBundle(bundle);
      if (validationErrors.length > 0) {
        result.skippedInvalidEvidence += 1;
        if (markDecisionPayload) {
          store.updateAutoTradingDecisionPayload(decision.decisionId, {
            researchRequestStatus: {
              status: "invalid_evidence",
              checkedAt: now.toISOString(),
              reasonCodes: validationErrors
            }
          });
        }
        result.requests.push({
          decisionId: decision.decisionId,
          sessionId: decision.sessionId,
          marketKey: request.marketKey,
          status: "invalid_evidence",
          reasonCodes: validationErrors
        });
        continue;
      }

      const researchRunId = store.recordResearchRun({
        marketKey: request.marketKey,
        title: bundle.title ?? request.title ?? decision.title ?? request.marketKey,
        question: bundle.question ?? request.researchQuestion,
        thesis: bundle.thesis,
        fairValueLow: normalizeProbability(bundle.fairValueLow),
        fairValueBase: normalizeProbability(bundle.fairValueBase),
        fairValueHigh: normalizeProbability(bundle.fairValueHigh),
        supportsYes: storedEvidenceItems(bundle.supportsYes),
        supportsNo: storedEvidenceItems(bundle.supportsNo),
        openQuestions: bundle.openQuestions ?? [],
        providers: bundle.providers ?? [],
        notes: bundle.notes,
        completedAt: bundle.completedAt ?? now.toISOString(),
        skillVersion: bundle.skillVersion,
        policyVersion: bundle.policyVersion,
        modelId: bundle.modelId,
        promptHash: bundle.promptHash,
        automationName: bundle.automationName ?? "autotrader-research-worker"
      });
      if (markDecisionPayload) {
        store.updateAutoTradingDecisionPayload(decision.decisionId, {
          researchRequestStatus: {
            status: "recorded",
            recordedAt: now.toISOString(),
            researchRunId
          }
        });
      }
      result.recordedResearchRuns += 1;
      result.requests.push({
        decisionId: decision.decisionId,
        sessionId: decision.sessionId,
        marketKey: request.marketKey,
        status: "recorded",
        researchRunId,
        reasonCodes: ["research_run_recorded"]
      });
    }
  }

  return result;
}
