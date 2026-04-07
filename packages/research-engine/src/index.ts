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
