import type {
  ResearchEvidenceBundle,
  ResearchEvidenceItem,
  ResearchEvidenceTemplateResult,
  ResearchRequestEvidenceTemplate
} from "./research-request-worker.js";

export interface ResearchSourceEvidenceItem {
  source: string;
  title: string;
  url?: string;
  summary: string;
  stance: "supports_yes" | "supports_no" | "neutral" | string;
  confidence?: number | string;
}

export interface ResearchSourcePack {
  marketKey: string;
  title?: string;
  question?: string;
  thesis: string;
  fairValueLow?: number;
  fairValueBase: number;
  fairValueHigh?: number;
  uncertainty?: number;
  uncertaintyProbability?: number;
  supportsYes?: ResearchSourceEvidenceItem[];
  supportsNo?: ResearchSourceEvidenceItem[];
  evidence?: ResearchSourceEvidenceItem[];
  openQuestions?: string[];
  providers?: string[];
  notes?: string;
  completedAt?: string;
  skillVersion?: string;
  policyVersion?: string;
  modelId?: string;
  promptHash?: string;
  automationName?: string;
  numericalAnchors?: string[];
  counterCase?: string;
  sourceCutoff?: string;
}

export interface ResearchEvidenceProviderInput {
  templates: ResearchEvidenceTemplateResult | ResearchRequestEvidenceTemplate[];
  sourcePacks: ResearchSourcePack[];
  now?: Date;
  requireTemplate?: boolean;
  automationName?: string;
}

export interface ResearchEvidenceProviderIssue {
  marketKey: string;
  status: "bundle_ready" | "missing_template" | "missing_source_pack" | "invalid_source_pack";
  reasonCodes: string[];
}

export interface ResearchEvidenceProviderResult {
  generatedAt: string;
  scannedTemplates: number;
  sourcePacks: number;
  writtenBundles: number;
  skippedMissingTemplate: number;
  skippedMissingSourcePack: number;
  skippedInvalid: number;
  evidenceBundles: ResearchEvidenceBundle[];
  issues: ResearchEvidenceProviderIssue[];
}

function templatesArray(
  templates: ResearchEvidenceTemplateResult | ResearchRequestEvidenceTemplate[]
): ResearchRequestEvidenceTemplate[] {
  return Array.isArray(templates) ? templates : templates.templates;
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

function clampProbability(value: number): number {
  return Math.max(0.001, Math.min(0.999, Number(value.toFixed(4))));
}

function evidenceStance(item: ResearchSourceEvidenceItem): "yes" | "no" | "neutral" {
  const stance = String(item.stance ?? "").toLowerCase();
  if (["supports_no", "no", "oppose", "bearish", "negative", "counter"].some((token) => stance.includes(token))) {
    return "no";
  }
  if (["supports_yes", "yes", "support", "bullish", "positive"].some((token) => stance.includes(token))) {
    return "yes";
  }
  return "neutral";
}

function venuePriceContaminationTokens(): string[] {
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
  ];
}

function textHasVenuePriceContamination(values: unknown[]): boolean {
  const text = values.map((value) => String(value ?? "").toLowerCase()).join("\n");
  return venuePriceContaminationTokens().some((token) => text.includes(token));
}

function evidenceItems(pack: ResearchSourcePack): ResearchSourceEvidenceItem[] {
  return [
    ...(pack.supportsYes ?? []),
    ...(pack.supportsNo ?? []),
    ...(pack.evidence ?? [])
  ];
}

function validateSourcePack(pack: ResearchSourcePack): {
  fairValueLow?: number;
  fairValueBase?: number;
  fairValueHigh?: number;
  supportsYes: ResearchSourceEvidenceItem[];
  supportsNo: ResearchSourceEvidenceItem[];
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const fairValueBase = normalizeProbability(pack.fairValueBase);
  let fairValueLow = normalizeProbability(pack.fairValueLow);
  let fairValueHigh = normalizeProbability(pack.fairValueHigh);
  const uncertainty = normalizeProbability(pack.uncertaintyProbability ?? pack.uncertainty);

  if (fairValueBase === undefined) {
    reasonCodes.push("invalid_fair_value_base");
  }
  if (fairValueBase !== undefined && (fairValueLow === undefined || fairValueHigh === undefined) && uncertainty !== undefined) {
    fairValueLow = clampProbability(fairValueBase - uncertainty);
    fairValueHigh = clampProbability(fairValueBase + uncertainty);
  }
  if (fairValueLow === undefined || fairValueHigh === undefined) {
    reasonCodes.push("missing_fair_value_interval");
  } else if (fairValueBase !== undefined && (fairValueLow > fairValueBase || fairValueBase > fairValueHigh)) {
    reasonCodes.push("invalid_fair_value_interval");
  }
  if (!pack.thesis.trim()) {
    reasonCodes.push("missing_thesis");
  }

  const allEvidence = evidenceItems(pack);
  const supportsYes = allEvidence.filter((item) => evidenceStance(item) === "yes");
  const supportsNo = allEvidence.filter((item) => evidenceStance(item) === "no");
  if (allEvidence.length < 2) {
    reasonCodes.push("insufficient_evidence_items");
  }
  if (supportsNo.length < 1) {
    reasonCodes.push("missing_counter_evidence");
  }
  if (!pack.numericalAnchors || pack.numericalAnchors.length < 1) {
    reasonCodes.push("missing_numerical_anchors");
  }
  if (textHasVenuePriceContamination([
    pack.title,
    pack.question,
    pack.thesis,
    pack.notes,
    pack.counterCase,
    pack.sourceCutoff,
    ...(pack.openQuestions ?? []),
    ...(pack.providers ?? []),
    ...(pack.numericalAnchors ?? []),
    ...allEvidence.flatMap((item) => [item.source, item.title, item.summary])
  ])) {
    reasonCodes.push("venue_price_contaminated_source_pack");
  }

  return {
    fairValueLow,
    fairValueBase,
    fairValueHigh,
    supportsYes,
    supportsNo,
    reasonCodes
  };
}

function toEvidenceItem(item: ResearchSourceEvidenceItem): ResearchEvidenceItem {
  return {
    source: item.source,
    title: item.title,
    url: item.url,
    summary: item.summary,
    stance: item.stance,
    confidence: item.confidence ?? "unknown"
  };
}

function buildBundle(
  pack: ResearchSourcePack,
  template: ResearchRequestEvidenceTemplate | undefined,
  validation: NonNullable<ReturnType<typeof validateSourcePack>>,
  now: Date,
  automationName: string
): ResearchEvidenceBundle {
  return {
    marketKey: pack.marketKey,
    title: pack.title ?? template?.title,
    question: pack.question ?? template?.researchQuestion,
    thesis: pack.thesis,
    fairValueLow: validation.fairValueLow as number,
    fairValueBase: validation.fairValueBase as number,
    fairValueHigh: validation.fairValueHigh as number,
    supportsYes: validation.supportsYes.map(toEvidenceItem),
    supportsNo: validation.supportsNo.map(toEvidenceItem),
    openQuestions: pack.openQuestions ?? [],
    providers: pack.providers ?? [],
    notes: [
      pack.notes,
      pack.counterCase ? `Counter-case: ${pack.counterCase}` : undefined,
      pack.sourceCutoff ? `Source cutoff: ${pack.sourceCutoff}` : undefined,
      ...(pack.numericalAnchors ?? []).map((anchor) => `Numerical anchor: ${anchor}`)
    ].filter((value): value is string => Boolean(value)).join(" "),
    completedAt: pack.completedAt ?? now.toISOString(),
    skillVersion: pack.skillVersion,
    policyVersion: pack.policyVersion,
    modelId: pack.modelId,
    promptHash: pack.promptHash,
    automationName: pack.automationName ?? automationName
  };
}

export function buildResearchEvidenceBundles(
  input: ResearchEvidenceProviderInput
): ResearchEvidenceProviderResult {
  const now = input.now ?? new Date();
  const requireTemplate = input.requireTemplate ?? true;
  const templates = templatesArray(input.templates);
  const templateByMarketKey = new Map(templates.map((template) => [template.marketKey, template]));
  const packByMarketKey = new Map(input.sourcePacks.map((pack) => [pack.marketKey, pack]));
  const result: ResearchEvidenceProviderResult = {
    generatedAt: now.toISOString(),
    scannedTemplates: templates.length,
    sourcePacks: input.sourcePacks.length,
    writtenBundles: 0,
    skippedMissingTemplate: 0,
    skippedMissingSourcePack: 0,
    skippedInvalid: 0,
    evidenceBundles: [],
    issues: []
  };

  const marketKeys = requireTemplate
    ? templates.map((template) => template.marketKey)
    : Array.from(new Set([...templates.map((template) => template.marketKey), ...input.sourcePacks.map((pack) => pack.marketKey)]));

  for (const marketKey of marketKeys) {
    const template = templateByMarketKey.get(marketKey);
    if (!template && requireTemplate) {
      result.skippedMissingTemplate += 1;
      result.issues.push({ marketKey, status: "missing_template", reasonCodes: ["missing_research_request_template"] });
      continue;
    }
    const pack = packByMarketKey.get(marketKey);
    if (!pack) {
      result.skippedMissingSourcePack += 1;
      result.issues.push({ marketKey, status: "missing_source_pack", reasonCodes: ["missing_source_pack"] });
      continue;
    }
    const validation = validateSourcePack(pack);
    if (validation.reasonCodes.length > 0) {
      result.skippedInvalid += 1;
      result.issues.push({ marketKey, status: "invalid_source_pack", reasonCodes: validation.reasonCodes });
      continue;
    }
    result.evidenceBundles.push(buildBundle(
      pack,
      template,
      validation,
      now,
      input.automationName ?? "autotrader-research-provider"
    ));
    result.writtenBundles += 1;
    result.issues.push({ marketKey, status: "bundle_ready", reasonCodes: ["evidence_bundle_ready"] });
  }

  if (requireTemplate) {
    for (const pack of input.sourcePacks) {
      if (!templateByMarketKey.has(pack.marketKey)) {
        result.skippedMissingTemplate += 1;
        result.issues.push({
          marketKey: pack.marketKey,
          status: "missing_template",
          reasonCodes: ["source_pack_without_pending_research_template"]
        });
      }
    }
  }

  return result;
}
