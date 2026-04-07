import {
  loadRuntimeConfig,
  resolveMarketByIdentifier,
  type IdentifierType
} from "../../polymarket-core/src/index.js";
import { openStateStore, type StoredDevelopmentInput } from "../../state-store/src/index.js";

export interface EvidenceItem {
  source: string;
  title: string;
  url?: string;
  summary: string;
  stance: "supports-yes" | "supports-no" | "neutral" | "unclear";
  confidence: "low" | "medium" | "high";
}

export interface ResearchProvider {
  name: string;
  enabled: boolean;
  search(query: string): Promise<EvidenceItem[]>;
}

export interface MarketResearchRequest {
  title: string;
  question: string;
  relatedQueries?: string[];
}

export interface ResearchSynthesis {
  thesis: string;
  supportsYes: EvidenceItem[];
  supportsNo: EvidenceItem[];
  openQuestions: string[];
  fairValueLow?: number;
  fairValueBase?: number;
  fairValueHigh?: number;
}

export interface PersistedResearchMetadata {
  identifierType: IdentifierType;
  identifier: string;
  providers?: string[];
  notes?: string;
  skillVersion?: string;
  policyVersion?: string;
  modelId?: string;
  promptHash?: string;
  automationName?: string;
  createdAt?: string;
  completedAt?: string;
}

/**
 * Placeholder interface layer for plugging in external research providers
 * such as web search, news APIs, or proprietary document sources.
 */
export async function runResearch(
  _request: MarketResearchRequest,
  _providers: ResearchProvider[]
): Promise<ResearchSynthesis> {
  return {
    thesis: "TODO: implement evidence retrieval and synthesis",
    supportsYes: [],
    supportsNo: [],
    openQuestions: []
  };
}

export async function persistResearchSynthesis(
  request: MarketResearchRequest,
  synthesis: ResearchSynthesis,
  metadata: PersistedResearchMetadata
): Promise<{ runId: string; marketKey: string; stateDbPath: string }> {
  const config = loadRuntimeConfig();
  const snapshot = await resolveMarketByIdentifier(config, metadata.identifierType, metadata.identifier, {
    includeComments: false,
    includeOrderbookSummary: true,
    includeRelatedMarkets: false
  });
  const stateStore = openStateStore(config.stateDbPath);
  const { marketKey } = stateStore.recordMarketSnapshot(snapshot);
  const runId = stateStore.recordResearchRun({
    marketKey,
    title: request.title,
    question: request.question,
    thesis: synthesis.thesis,
    supportsYes: synthesis.supportsYes,
    supportsNo: synthesis.supportsNo,
    openQuestions: synthesis.openQuestions,
    fairValueLow: synthesis.fairValueLow,
    fairValueBase: synthesis.fairValueBase,
    fairValueHigh: synthesis.fairValueHigh,
    providers: metadata.providers,
    notes: metadata.notes,
    skillVersion: metadata.skillVersion,
    policyVersion: metadata.policyVersion,
    modelId: metadata.modelId,
    promptHash: metadata.promptHash,
    automationName: metadata.automationName,
    createdAt: metadata.createdAt,
    completedAt: metadata.completedAt,
    synthesis: {
      thesis: synthesis.thesis,
      supportsYes: synthesis.supportsYes,
      supportsNo: synthesis.supportsNo,
      openQuestions: synthesis.openQuestions,
      fairValueLow: synthesis.fairValueLow,
      fairValueBase: synthesis.fairValueBase,
      fairValueHigh: synthesis.fairValueHigh
    }
  });
  return {
    runId,
    marketKey,
    stateDbPath: config.stateDbPath
  };
}

export async function persistDevelopment(
  development: Omit<StoredDevelopmentInput, "marketKey">,
  identifierType: IdentifierType,
  identifier: string
): Promise<{ developmentId: number; marketKey: string; stateDbPath: string }> {
  const config = loadRuntimeConfig();
  const snapshot = await resolveMarketByIdentifier(config, identifierType, identifier, {
    includeComments: false,
    includeOrderbookSummary: true,
    includeRelatedMarkets: false
  });
  const stateStore = openStateStore(config.stateDbPath);
  const { marketKey } = stateStore.recordMarketSnapshot(snapshot);
  const developmentId = stateStore.recordDevelopment({
    ...development,
    marketKey
  });
  return {
    developmentId,
    marketKey,
    stateDbPath: config.stateDbPath
  };
}
