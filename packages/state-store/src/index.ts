import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface StoredPolicyWarning {
  code: string;
  severity: "info" | "warn" | "block";
  message: string;
}

export interface StoredPreviewRecord {
  previewId: string;
  createdAt: string;
  orderKind: "limit" | "marketable";
  normalizedParams: Record<string, unknown>;
  warnings: StoredPolicyWarning[];
  canSubmit: boolean;
  policyHash: string;
  submissionPayload: Record<string, unknown>;
  marketSnapshot?: unknown;
}

export interface StoredAlertRecord {
  id: string;
  scope: "watchlist" | "portfolio" | "all";
  severity: "info" | "warn" | "critical";
  category: string;
  title: string;
  message: string;
  createdAt: string;
  marketKey?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredMarketSnapshot {
  title: string;
  slug?: string;
  marketId?: string;
  eventId?: string;
  conditionId?: string;
  tokenIds?: string[];
  yesTokenId?: string;
  noTokenId?: string;
  price?: number;
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
  spreadCents?: number;
  liquidityUsd?: number;
  volumeUsd?: number;
  minimumTickSize?: number;
  minimumOrderSize?: number;
  negRisk?: boolean;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  category?: string;
  tags?: string[];
  resolutionText?: string;
  commentsSummary?: string[];
  relatedMarkets?: Array<{ title: string; identifier: string; price?: number }>;
}

export interface StoredResearchEvidenceItem {
  source: string;
  title: string;
  url?: string;
  summary: string;
  stance: string;
  confidence: string;
}

export interface StoredResearchRunInput {
  runId?: string;
  marketKey?: string;
  marketId?: string;
  conditionId?: string;
  slug?: string;
  title: string;
  question: string;
  thesis: string;
  supportsYes?: StoredResearchEvidenceItem[];
  supportsNo?: StoredResearchEvidenceItem[];
  openQuestions?: string[];
  fairValueLow?: number;
  fairValueBase?: number;
  fairValueHigh?: number;
  providers?: string[];
  notes?: string;
  skillVersion?: string;
  policyVersion?: string;
  modelId?: string;
  promptHash?: string;
  automationName?: string;
  thesisKey?: string;
  thesisTitle?: string;
  thesisConfidence?: number;
  createdAt?: string;
  completedAt?: string;
  synthesis?: Record<string, unknown>;
}

export interface StoredClassificationInput {
  marketKey?: string;
  marketId?: string;
  conditionId?: string;
  slug?: string;
  structuralType?: string;
  category?: string;
  horizonBucket?: string;
  pricingStatus?: string;
  modelabilityScore?: number;
  tradabilityScore?: number;
  resolutionAmbiguityScore?: number;
  attentionGapScore?: number;
  crossMarketConsistencyScore?: number;
  researchPriorityScore?: number;
  tradeOpportunityScore?: number;
  confidenceScore?: number;
  interestTier?: string;
  reasonCodes?: string[];
  disqualifiers?: string[];
  thesisKey?: string;
  thesisTitle?: string;
  thesisConfidence?: number;
  decision: Record<string, unknown>;
  createdAt?: string;
}

export interface StoredDevelopmentInput {
  marketKey?: string;
  marketId?: string;
  conditionId?: string;
  slug?: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  impact?: "bullish" | "bearish" | "neutral" | "unclear";
  importance?: number;
  eventTime?: string;
  discoveredAt?: string;
  tags?: string[];
  notes?: string;
  payload?: Record<string, unknown>;
}

export interface StoredOrderSubmissionInput {
  previewId?: string;
  marketKey?: string;
  marketId?: string;
  conditionId?: string;
  slug?: string;
  orderId?: string;
  side?: string;
  status?: string;
  orderKind?: string;
  price?: number;
  size?: number;
  notionalUsd?: number;
  submittedAt?: string;
  payload: Record<string, unknown>;
}

export interface StoredAutomationRunInput {
  runId?: string;
  automationName: string;
  status: string;
  projectMode?: string;
  startedAt?: string;
  finishedAt?: string;
  findingsCount?: number;
  summary?: string;
  output?: Record<string, unknown>;
}

export interface StoredAgentRunInput {
  runId?: string;
  parentRunId?: string;
  agentName: string;
  role?: string;
  marketKey?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  output?: Record<string, unknown>;
}

export interface StoredStateSummary {
  dbPath: string;
  generatedAt: string;
  counts: Record<string, number>;
  recentAlerts: StoredAlertRecord[];
  recentResearchRuns: Array<Record<string, unknown>>;
  recentClassifications: Array<Record<string, unknown>>;
  recentOrderPreviews: Array<Record<string, unknown>>;
  recentThesisLinks: StoredThesisLinkRecord[];
  latestPortfolioSnapshot?: StoredPortfolioSnapshotRecord;
}

export interface StoredMarketState {
  market: Record<string, unknown> | null;
  latestSnapshot: Record<string, unknown> | null;
  snapshots: Array<Record<string, unknown>>;
  alerts: StoredAlertRecord[];
  developments: Array<Record<string, unknown>>;
  classifications: Array<Record<string, unknown>>;
  researchRuns: Array<Record<string, unknown>>;
  previews: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  thesisLinks: StoredThesisLinkRecord[];
  portfolioPositions: StoredPortfolioPositionRecord[];
}

export interface StoredTrackedMarket {
  marketKey: string;
  title: string;
  slug?: string;
  marketId?: string;
  conditionId?: string;
  category?: string;
  endDate?: string;
  latestSnapshotAt?: string;
  latestClassificationAt?: string;
  latestInterestTier?: string;
  latestResearchAt?: string;
  latestFairValueBase?: number;
  latestOrderAt?: string;
  activeOrderCount: number;
  primaryThesisKey?: string;
  primaryThesisTitle?: string;
  latestActivityAt?: string;
}

export interface StoredOrderRecord {
  id?: number;
  orderId: string;
  previewId?: string;
  marketKey?: string;
  side?: string;
  status?: string;
  orderKind?: string;
  price?: number;
  size?: number;
  notionalUsd?: number;
  submittedAt?: string;
  updatedAt?: string;
  payload: Record<string, unknown>;
}

export interface StoredThesisLinkInput {
  marketKey?: string;
  marketId?: string;
  conditionId?: string;
  slug?: string;
  title?: string;
  thesisKey: string;
  thesisTitle?: string;
  linkSource?: string;
  confidence?: number;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface StoredThesisLinkRecord {
  id?: number;
  marketKey: string;
  thesisKey: string;
  thesisTitle?: string;
  linkSource?: string;
  confidence?: number;
  isPrimary: boolean;
  createdAt?: string;
  metadata: Record<string, unknown>;
}

export interface StoredPortfolioSnapshotInput {
  snapshotId?: string;
  ownerAddress?: string;
  capturedAt?: string;
  source?: string;
  grossCurrentValueUsd?: number;
  metadata?: Record<string, unknown>;
  current: Array<Record<string, unknown>>;
  closed?: Array<Record<string, unknown>>;
}

export interface StoredPortfolioSnapshotRecord {
  snapshotId: string;
  ownerAddress?: string;
  capturedAt: string;
  source?: string;
  grossCurrentValueUsd?: number;
  positionCount: number;
  metadata: Record<string, unknown>;
}

export interface StoredPortfolioPositionRecord {
  id?: number;
  snapshotId: string;
  ownerAddress?: string;
  marketKey?: string;
  marketId?: string;
  conditionId?: string;
  slug?: string;
  title?: string;
  outcome?: string;
  assetId?: string;
  size?: number;
  averagePrice?: number;
  currentValueUsd?: number;
  initialValueUsd?: number;
  cashPnlUsd?: number;
  percentPnl?: number;
  position: Record<string, unknown>;
}

export interface StoredMarketExposureRecord {
  marketKey: string;
  title?: string;
  category?: string;
  thesisKey?: string;
  thesisTitle?: string;
  currentValueUsd: number;
  activeOpenOrderNotionalUsd: number;
  totalExposureUsd: number;
  activeOrderCount: number;
}

export interface StoredThesisExposureRecord {
  thesisKey: string;
  thesisTitle?: string;
  currentValueUsd: number;
  activeOpenOrderNotionalUsd: number;
  totalExposureUsd: number;
  marketCount: number;
  activeOrderCount: number;
  markets: StoredMarketExposureRecord[];
}

export interface StoredPortfolioRiskSummary {
  generatedAt: string;
  latestSnapshot?: StoredPortfolioSnapshotRecord;
  grossCurrentValueUsd: number;
  grossOpenOrderNotionalUsd: number;
  grossEffectiveExposureUsd: number;
  activeOpenOrderCount: number;
  marketExposures: StoredMarketExposureRecord[];
  thesisExposures: StoredThesisExposureRecord[];
  unlinkedExposureUsd: number;
}

export interface StateStoreOptions {
  dbPath: string;
}

type SqlPrimitive = string | number | null;

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function boolToInt(value: boolean | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return value ? 1 : 0;
}

function intToBool(value: unknown): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return Number(value) !== 0;
}

function jsonString(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMarketKey(parts: {
  marketKey?: string;
  conditionId?: string;
  marketId?: string;
  slug?: string;
  title?: string;
}): string {
  const direct = parts.marketKey?.trim();
  if (direct) {
    return direct;
  }
  const condition = parts.conditionId?.trim();
  if (condition) {
    return `condition:${condition}`;
  }
  const marketId = parts.marketId?.trim();
  if (marketId) {
    return `market:${marketId}`;
  }
  const slug = parts.slug?.trim();
  if (slug) {
    return `slug:${slug}`;
  }
  const title = parts.title?.trim();
  if (title) {
    return `title:${title.toLowerCase().replace(/\s+/g, "-")}`;
  }
  return `unknown:${randomUUID()}`;
}

function normalizeThesisKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `thesis-${randomUUID()}`;
}

function ensureDbDirectory(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
}

function rowRecord(row: unknown): Record<string, unknown> {
  return (row ?? {}) as Record<string, unknown>;
}

function unknownRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function orderRowToRecord(row: unknown): StoredOrderRecord {
  const record = rowRecord(row);
  return {
    id: asNumber(record.id),
    orderId: String(record.order_id ?? ""),
    previewId: typeof record.preview_id === "string" ? record.preview_id : undefined,
    marketKey: typeof record.market_key === "string" ? record.market_key : undefined,
    side: typeof record.side === "string" ? record.side : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    orderKind: typeof record.order_kind === "string" ? record.order_kind : undefined,
    price: asNumber(record.price),
    size: asNumber(record.size),
    notionalUsd: asNumber(record.notional_usd),
    submittedAt: typeof record.submitted_at === "string" ? record.submitted_at : undefined,
    updatedAt: typeof record.updated_at === "string" ? record.updated_at : undefined,
    payload: parseJson<Record<string, unknown>>(record.payload_json, {})
  } satisfies StoredOrderRecord;
}

export class StateStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(options: StateStoreOptions) {
    this.dbPath = path.resolve(options.dbPath);
    ensureDbDirectory(this.dbPath);
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS markets (
        market_key TEXT PRIMARY KEY,
        market_id TEXT,
        condition_id TEXT,
        event_id TEXT,
        slug TEXT,
        title TEXT NOT NULL,
        category TEXT,
        end_date TEXT,
        yes_token_id TEXT,
        no_token_id TEXT,
        active INTEGER,
        closed INTEGER,
        tags_json TEXT NOT NULL DEFAULT '[]',
        resolution_text TEXT,
        latest_snapshot_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_market_id ON markets(market_id) WHERE market_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_condition_id ON markets(condition_id) WHERE condition_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_slug ON markets(slug) WHERE slug IS NOT NULL;

      CREATE TABLE IF NOT EXISTS market_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        title TEXT NOT NULL,
        market_id TEXT,
        condition_id TEXT,
        event_id TEXT,
        slug TEXT,
        price REAL,
        best_bid REAL,
        best_ask REAL,
        midpoint REAL,
        spread_cents REAL,
        liquidity_usd REAL,
        volume_usd REAL,
        minimum_tick_size REAL,
        minimum_order_size REAL,
        neg_risk INTEGER,
        active INTEGER,
        closed INTEGER,
        end_date TEXT,
        category TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        comments_summary_json TEXT NOT NULL DEFAULT '[]',
        related_markets_json TEXT NOT NULL DEFAULT '[]',
        snapshot_json TEXT NOT NULL,
        FOREIGN KEY(market_key) REFERENCES markets(market_key) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_time ON market_snapshots(market_key, captured_at DESC);

      CREATE TABLE IF NOT EXISTS order_previews (
        preview_id TEXT PRIMARY KEY,
        market_key TEXT,
        created_at TEXT NOT NULL,
        order_kind TEXT NOT NULL,
        normalized_params_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        can_submit INTEGER NOT NULL,
        policy_hash TEXT NOT NULL,
        submission_payload_json TEXT NOT NULL,
        market_snapshot_json TEXT,
        submitted_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_order_previews_market_time ON order_previews(market_key, created_at DESC);

      CREATE TABLE IF NOT EXISTS alerts (
        alert_id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        market_key TEXT,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_scope_time ON alerts(scope, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_market_time ON alerts(market_key, created_at DESC);

      CREATE TABLE IF NOT EXISTS developments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT,
        impact TEXT,
        importance INTEGER,
        event_time TEXT,
        discovered_at TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_developments_market_time ON developments(market_key, discovered_at DESC);

      CREATE TABLE IF NOT EXISTS research_runs (
        run_id TEXT PRIMARY KEY,
        market_key TEXT,
        title TEXT NOT NULL,
        question TEXT NOT NULL,
        thesis TEXT NOT NULL,
        fair_value_low REAL,
        fair_value_base REAL,
        fair_value_high REAL,
        open_questions_json TEXT NOT NULL DEFAULT '[]',
        providers_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        skill_version TEXT,
        policy_version TEXT,
        model_id TEXT,
        prompt_hash TEXT,
        automation_name TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        synthesis_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_research_runs_market_time ON research_runs(market_key, completed_at DESC);

      CREATE TABLE IF NOT EXISTS evidence_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        summary TEXT NOT NULL,
        stance TEXT NOT NULL,
        confidence TEXT NOT NULL,
        item_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES research_runs(run_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_items_run_id ON evidence_items(run_id);

      CREATE TABLE IF NOT EXISTS classifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        structural_type TEXT,
        category TEXT,
        horizon_bucket TEXT,
        pricing_status TEXT,
        modelability_score REAL,
        tradability_score REAL,
        resolution_ambiguity_score REAL,
        attention_gap_score REAL,
        cross_market_consistency_score REAL,
        research_priority_score REAL,
        trade_opportunity_score REAL,
        confidence_score REAL,
        interest_tier TEXT,
        reason_codes_json TEXT NOT NULL DEFAULT '[]',
        disqualifiers_json TEXT NOT NULL DEFAULT '[]',
        decision_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_classifications_market_time ON classifications(market_key, created_at DESC);

      CREATE TABLE IF NOT EXISTS automation_runs (
        run_id TEXT PRIMARY KEY,
        automation_name TEXT NOT NULL,
        status TEXT NOT NULL,
        project_mode TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        findings_count INTEGER,
        summary TEXT,
        output_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_automation_runs_name_time ON automation_runs(automation_name, started_at DESC);

      CREATE TABLE IF NOT EXISTS agent_runs (
        run_id TEXT PRIMARY KEY,
        parent_run_id TEXT,
        agent_name TEXT NOT NULL,
        role TEXT,
        market_key TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        output_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parent_run_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_market_time ON agent_runs(market_key, started_at DESC);

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE,
        preview_id TEXT,
        market_key TEXT,
        side TEXT,
        status TEXT,
        order_kind TEXT,
        price REAL,
        size REAL,
        notional_usd REAL,
        submitted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_market_time ON orders(market_key, submitted_at DESC);

      CREATE TABLE IF NOT EXISTS theses (
        thesis_key TEXT PRIMARY KEY,
        thesis_title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS market_thesis_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_key TEXT NOT NULL,
        thesis_key TEXT NOT NULL,
        link_source TEXT NOT NULL,
        confidence REAL,
        is_primary INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_market_thesis_links_market_time ON market_thesis_links(market_key, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_market_thesis_links_thesis_time ON market_thesis_links(thesis_key, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        owner_address TEXT,
        captured_at TEXT NOT NULL,
        source TEXT,
        gross_current_value_usd REAL,
        position_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_time ON portfolio_snapshots(captured_at DESC);

      CREATE TABLE IF NOT EXISTS portfolio_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id TEXT NOT NULL,
        owner_address TEXT,
        market_key TEXT,
        market_id TEXT,
        condition_id TEXT,
        slug TEXT,
        title TEXT,
        outcome TEXT,
        asset_id TEXT,
        size REAL,
        average_price REAL,
        current_value_usd REAL,
        initial_value_usd REAL,
        cash_pnl_usd REAL,
        percent_pnl REAL,
        position_json TEXT NOT NULL,
        FOREIGN KEY(snapshot_id) REFERENCES portfolio_snapshots(snapshot_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_portfolio_positions_snapshot_market ON portfolio_positions(snapshot_id, market_key);
      CREATE INDEX IF NOT EXISTS idx_portfolio_positions_market ON portfolio_positions(market_key);
    `);
  }

  private preparedCount(tableName: string): number {
    const row = rowRecord(this.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get());
    return Number(row.count ?? 0);
  }

  private marketRowByAnyIdentifier(args: {
    marketKey?: string;
    conditionId?: string;
    marketId?: string;
    slug?: string;
  }): Record<string, unknown> | null {
    const marketKey = args.marketKey?.trim();
    if (marketKey) {
      return rowRecord(this.db.prepare(`SELECT * FROM markets WHERE market_key = ? LIMIT 1`).get(marketKey)) || null;
    }
    const conditionId = args.conditionId?.trim();
    if (conditionId) {
      const row = this.db.prepare(`SELECT * FROM markets WHERE condition_id = ? LIMIT 1`).get(conditionId);
      return row ? rowRecord(row) : null;
    }
    const marketId = args.marketId?.trim();
    if (marketId) {
      const row = this.db.prepare(`SELECT * FROM markets WHERE market_id = ? LIMIT 1`).get(marketId);
      return row ? rowRecord(row) : null;
    }
    const slug = args.slug?.trim();
    if (slug) {
      const row = this.db.prepare(`SELECT * FROM markets WHERE slug = ? LIMIT 1`).get(slug);
      return row ? rowRecord(row) : null;
    }
    return null;
  }

  resolveMarketKey(args: {
    marketKey?: string;
    conditionId?: string;
    marketId?: string;
    slug?: string;
    title?: string;
  }): string {
    const existing = this.marketRowByAnyIdentifier(args);
    if (existing && typeof existing.market_key === "string") {
      return existing.market_key;
    }
    return normalizeMarketKey(args);
  }

  recordMarketSnapshot(snapshot: StoredMarketSnapshot, capturedAt = nowIso()): { marketKey: string; capturedAt: string } {
    const marketKey = this.resolveMarketKey({
      conditionId: snapshot.conditionId,
      marketId: snapshot.marketId,
      slug: snapshot.slug,
      title: snapshot.title
    });
    const createdAt = nowIso();

    this.db.prepare(`
      INSERT INTO markets (
        market_key, market_id, condition_id, event_id, slug, title, category, end_date,
        yes_token_id, no_token_id, active, closed, tags_json, resolution_text, latest_snapshot_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market_key) DO UPDATE SET
        market_id = COALESCE(excluded.market_id, markets.market_id),
        condition_id = COALESCE(excluded.condition_id, markets.condition_id),
        event_id = COALESCE(excluded.event_id, markets.event_id),
        slug = COALESCE(excluded.slug, markets.slug),
        title = excluded.title,
        category = COALESCE(excluded.category, markets.category),
        end_date = COALESCE(excluded.end_date, markets.end_date),
        yes_token_id = COALESCE(excluded.yes_token_id, markets.yes_token_id),
        no_token_id = COALESCE(excluded.no_token_id, markets.no_token_id),
        active = COALESCE(excluded.active, markets.active),
        closed = COALESCE(excluded.closed, markets.closed),
        tags_json = excluded.tags_json,
        resolution_text = COALESCE(excluded.resolution_text, markets.resolution_text),
        latest_snapshot_at = excluded.latest_snapshot_at,
        updated_at = excluded.updated_at
    `).run(
      marketKey,
      snapshot.marketId ?? null,
      snapshot.conditionId ?? null,
      snapshot.eventId ?? null,
      snapshot.slug ?? null,
      snapshot.title,
      snapshot.category ?? null,
      snapshot.endDate ?? null,
      snapshot.yesTokenId ?? null,
      snapshot.noTokenId ?? null,
      boolToInt(snapshot.active),
      boolToInt(snapshot.closed),
      jsonString(snapshot.tags ?? [], []),
      snapshot.resolutionText ?? null,
      capturedAt,
      createdAt,
      createdAt
    );

    this.db.prepare(`
      INSERT INTO market_snapshots (
        market_key, captured_at, title, market_id, condition_id, event_id, slug,
        price, best_bid, best_ask, midpoint, spread_cents, liquidity_usd, volume_usd,
        minimum_tick_size, minimum_order_size, neg_risk, active, closed, end_date, category,
        tags_json, comments_summary_json, related_markets_json, snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketKey,
      capturedAt,
      snapshot.title,
      snapshot.marketId ?? null,
      snapshot.conditionId ?? null,
      snapshot.eventId ?? null,
      snapshot.slug ?? null,
      snapshot.price ?? null,
      snapshot.bestBid ?? null,
      snapshot.bestAsk ?? null,
      snapshot.midpoint ?? null,
      snapshot.spreadCents ?? null,
      snapshot.liquidityUsd ?? null,
      snapshot.volumeUsd ?? null,
      snapshot.minimumTickSize ?? null,
      snapshot.minimumOrderSize ?? null,
      boolToInt(snapshot.negRisk),
      boolToInt(snapshot.active),
      boolToInt(snapshot.closed),
      snapshot.endDate ?? null,
      snapshot.category ?? null,
      jsonString(snapshot.tags ?? [], []),
      jsonString(snapshot.commentsSummary ?? [], []),
      jsonString(snapshot.relatedMarkets ?? [], []),
      jsonString(snapshot, {})
    );

    return { marketKey, capturedAt };
  }

  getLatestMarketSnapshot(args: {
    marketKey?: string;
    conditionId?: string;
    marketId?: string;
    slug?: string;
  }): Record<string, unknown> | null {
    const marketKey = this.resolveMarketKey(args);
    const row = this.db.prepare(`
      SELECT * FROM market_snapshots
      WHERE market_key = ?
      ORDER BY captured_at DESC, id DESC
      LIMIT 1
    `).get(marketKey);
    if (!row) {
      return null;
    }
    const record = rowRecord(row);
    return {
      ...record,
      neg_risk: intToBool(record.neg_risk),
      active: intToBool(record.active),
      closed: intToBool(record.closed),
      tags: parseJson<string[]>(record.tags_json, []),
      commentsSummary: parseJson<string[]>(record.comments_summary_json, []),
      relatedMarkets: parseJson<Array<Record<string, unknown>>>(record.related_markets_json, []),
      snapshot: parseJson<Record<string, unknown>>(record.snapshot_json, {})
    };
  }

  storePreview(preview: StoredPreviewRecord): StoredPreviewRecord {
    const marketSnapshot = unknownRecord(preview.marketSnapshot);
    const marketKey = this.resolveMarketKey({
      conditionId: typeof marketSnapshot.conditionId === "string" ? marketSnapshot.conditionId : undefined,
      marketId: typeof marketSnapshot.marketId === "string" ? marketSnapshot.marketId : undefined,
      slug: typeof marketSnapshot.slug === "string" ? marketSnapshot.slug : undefined,
      title: typeof marketSnapshot.title === "string" ? marketSnapshot.title : undefined
    });

    this.db.prepare(`
      INSERT OR REPLACE INTO order_previews (
        preview_id, market_key, created_at, order_kind, normalized_params_json, warnings_json,
        can_submit, policy_hash, submission_payload_json, market_snapshot_json, submitted_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      preview.previewId,
      marketKey,
      preview.createdAt,
      preview.orderKind,
      jsonString(preview.normalizedParams, {}),
      jsonString(preview.warnings, []),
      preview.canSubmit ? 1 : 0,
      preview.policyHash,
      jsonString(preview.submissionPayload, {}),
      preview.marketSnapshot ? jsonString(preview.marketSnapshot, {}) : null,
      null,
      null
    );

    return preview;
  }

  getPreview(previewId: string): StoredPreviewRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM order_previews WHERE preview_id = ? LIMIT 1`).get(previewId);
    if (!row) {
      return undefined;
    }
    const record = rowRecord(row);
    return {
      previewId: String(record.preview_id),
      createdAt: String(record.created_at),
      orderKind: String(record.order_kind) === "marketable" ? "marketable" : "limit",
      normalizedParams: parseJson<Record<string, unknown>>(record.normalized_params_json, {}),
      warnings: parseJson<StoredPolicyWarning[]>(record.warnings_json, []),
      canSubmit: Number(record.can_submit ?? 0) !== 0,
      policyHash: String(record.policy_hash),
      submissionPayload: parseJson<Record<string, unknown>>(record.submission_payload_json, {}),
      marketSnapshot: record.market_snapshot_json
        ? parseJson<Record<string, unknown>>(record.market_snapshot_json, {})
        : undefined
    };
  }

  deletePreview(previewId: string): void {
    this.db.prepare(`UPDATE order_previews SET deleted_at = ? WHERE preview_id = ?`).run(nowIso(), previewId);
  }

  markPreviewSubmitted(previewId: string): void {
    this.db.prepare(`UPDATE order_previews SET submitted_at = ? WHERE preview_id = ?`).run(nowIso(), previewId);
  }

  recordAlerts(alerts: StoredAlertRecord[]): number {
    if (alerts.length === 0) {
      return 0;
    }
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO alerts (
        alert_id, scope, market_key, severity, category, title, message, created_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let inserted = 0;
    for (const alert of alerts) {
      const result = insert.run(
        alert.id,
        alert.scope,
        alert.marketKey ?? null,
        alert.severity,
        alert.category,
        alert.title,
        alert.message,
        alert.createdAt,
        jsonString(alert.metadata ?? {}, {})
      );
      inserted += Number(result.changes ?? 0);
    }
    return inserted;
  }

  listAlerts(args: { scope: "watchlist" | "portfolio" | "all"; since?: string; limit: number; marketKey?: string }): StoredAlertRecord[] {
    const params: SqlPrimitive[] = [];
    let where = "WHERE 1 = 1";
    if (args.scope !== "all") {
      where += " AND scope = ?";
      params.push(args.scope);
    }
    if (args.marketKey) {
      where += " AND market_key = ?";
      params.push(args.marketKey);
    }
    if (args.since) {
      where += " AND created_at >= ?";
      params.push(args.since);
    }
    params.push(args.limit);
    const rows = this.db.prepare(`
      SELECT * FROM alerts
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params);

    return rows.map((row) => {
      const record = rowRecord(row);
      return {
        id: String(record.alert_id),
        scope: String(record.scope) === "portfolio" ? "portfolio" : String(record.scope) === "watchlist" ? "watchlist" : "all",
        severity: String(record.severity) === "critical" ? "critical" : String(record.severity) === "warn" ? "warn" : "info",
        category: String(record.category),
        title: String(record.title),
        message: String(record.message),
        createdAt: String(record.created_at),
        marketKey: typeof record.market_key === "string" ? record.market_key : undefined,
        metadata: parseJson<Record<string, unknown>>(record.metadata_json, {})
      } satisfies StoredAlertRecord;
    });
  }

  recordDevelopment(input: StoredDevelopmentInput): number {
    const marketKey = this.resolveMarketKey(input);
    const discoveredAt = input.discoveredAt ?? nowIso();
    const result = this.db.prepare(`
      INSERT INTO developments (
        market_key, title, summary, source, url, impact, importance, event_time,
        discovered_at, tags_json, notes, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketKey,
      input.title,
      input.summary,
      input.source,
      input.url ?? null,
      input.impact ?? null,
      input.importance ?? null,
      input.eventTime ?? null,
      discoveredAt,
      jsonString(input.tags ?? [], []),
      input.notes ?? null,
      jsonString(input.payload ?? {}, {})
    );
    return Number(result.lastInsertRowid ?? 0);
  }

  recordResearchRun(input: StoredResearchRunInput): string {
    const runId = input.runId ?? randomUUID();
    const marketKey = this.resolveMarketKey(input);
    const createdAt = input.createdAt ?? nowIso();
    const completedAt = input.completedAt ?? createdAt;
    const supportsYes = input.supportsYes ?? [];
    const supportsNo = input.supportsNo ?? [];
    const synthesis = input.synthesis ?? {
      thesis: input.thesis,
      supportsYes,
      supportsNo,
      openQuestions: input.openQuestions ?? [],
      fairValueLow: input.fairValueLow,
      fairValueBase: input.fairValueBase,
      fairValueHigh: input.fairValueHigh
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO research_runs (
        run_id, market_key, title, question, thesis, fair_value_low, fair_value_base, fair_value_high,
        open_questions_json, providers_json, notes, skill_version, policy_version, model_id,
        prompt_hash, automation_name, created_at, completed_at, synthesis_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      marketKey,
      input.title,
      input.question,
      input.thesis,
      input.fairValueLow ?? null,
      input.fairValueBase ?? null,
      input.fairValueHigh ?? null,
      jsonString(input.openQuestions ?? [], []),
      jsonString(input.providers ?? [], []),
      input.notes ?? null,
      input.skillVersion ?? null,
      input.policyVersion ?? null,
      input.modelId ?? null,
      input.promptHash ?? null,
      input.automationName ?? null,
      createdAt,
      completedAt,
      jsonString(synthesis, {})
    );

    this.db.prepare(`DELETE FROM evidence_items WHERE run_id = ?`).run(runId);
    const insertEvidence = this.db.prepare(`
      INSERT INTO evidence_items (run_id, source, title, url, summary, stance, confidence, item_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of [...supportsYes, ...supportsNo]) {
      insertEvidence.run(
        runId,
        item.source,
        item.title,
        item.url ?? null,
        item.summary,
        item.stance,
        item.confidence,
        jsonString(item, {})
      );
    }

    const synthesisRecord = unknownRecord(synthesis);
    const thesisKey = firstString(input.thesisKey, synthesisRecord.thesisKey, synthesisRecord.thesis_key);
    const thesisTitle = firstString(input.thesisTitle, synthesisRecord.thesisTitle, synthesisRecord.thesis_title, input.title);
    const thesisConfidence =
      input.thesisConfidence ??
      asNumber(synthesisRecord.thesisConfidence ?? synthesisRecord.thesis_confidence ?? synthesisRecord.clusterConfidence);
    if (thesisKey) {
      this.recordThesisLink({
        marketKey,
        marketId: input.marketId,
        conditionId: input.conditionId,
        slug: input.slug,
        title: input.title,
        thesisKey,
        thesisTitle,
        confidence: thesisConfidence,
        linkSource: "research",
        metadata: { runId },
        createdAt: completedAt,
        isPrimary: true
      });
    }
    return runId;
  }

  recordClassification(input: StoredClassificationInput): number {
    const marketKey = this.resolveMarketKey(input);
    const createdAt = input.createdAt ?? nowIso();
    const result = this.db.prepare(`
      INSERT INTO classifications (
        market_key, created_at, structural_type, category, horizon_bucket, pricing_status,
        modelability_score, tradability_score, resolution_ambiguity_score, attention_gap_score,
        cross_market_consistency_score, research_priority_score, trade_opportunity_score,
        confidence_score, interest_tier, reason_codes_json, disqualifiers_json, decision_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketKey,
      createdAt,
      input.structuralType ?? null,
      input.category ?? null,
      input.horizonBucket ?? null,
      input.pricingStatus ?? null,
      input.modelabilityScore ?? null,
      input.tradabilityScore ?? null,
      input.resolutionAmbiguityScore ?? null,
      input.attentionGapScore ?? null,
      input.crossMarketConsistencyScore ?? null,
      input.researchPriorityScore ?? null,
      input.tradeOpportunityScore ?? null,
      input.confidenceScore ?? null,
      input.interestTier ?? null,
      jsonString(input.reasonCodes ?? [], []),
      jsonString(input.disqualifiers ?? [], []),
      jsonString(input.decision, {})
    );

    const decision = unknownRecord(input.decision);
    const thesisKey = firstString(input.thesisKey, decision.thesisKey, decision.thesis_key);
    const thesisTitle = firstString(input.thesisTitle, decision.thesisTitle, decision.thesis_title, input.category, marketKey);
    const thesisConfidence =
      input.thesisConfidence ??
      asNumber(decision.thesisConfidence ?? decision.thesis_confidence ?? decision.clusterConfidence);
    if (thesisKey) {
      this.recordThesisLink({
        marketKey,
        marketId: input.marketId,
        conditionId: input.conditionId,
        slug: input.slug,
        title: marketKey,
        thesisKey,
        thesisTitle,
        confidence: thesisConfidence,
        linkSource: "classification",
        metadata: { classificationId: Number(result.lastInsertRowid ?? 0) },
        createdAt,
        isPrimary: true
      });
    }
    return Number(result.lastInsertRowid ?? 0);
  }

  recordOrderSubmission(input: StoredOrderSubmissionInput): number {
    const marketKey = this.resolveMarketKey(input);
    const submittedAt = input.submittedAt ?? nowIso();
    const updatedAt = nowIso();
    const result = this.db.prepare(`
      INSERT INTO orders (
        order_id, preview_id, market_key, side, status, order_kind, price, size,
        notional_usd, submitted_at, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        preview_id = COALESCE(excluded.preview_id, orders.preview_id),
        market_key = COALESCE(excluded.market_key, orders.market_key),
        side = COALESCE(excluded.side, orders.side),
        status = COALESCE(excluded.status, orders.status),
        order_kind = COALESCE(excluded.order_kind, orders.order_kind),
        price = COALESCE(excluded.price, orders.price),
        size = COALESCE(excluded.size, orders.size),
        notional_usd = COALESCE(excluded.notional_usd, orders.notional_usd),
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `).run(
      input.orderId ?? `preview:${input.previewId ?? randomUUID()}`,
      input.previewId ?? null,
      marketKey,
      input.side ?? null,
      input.status ?? null,
      input.orderKind ?? null,
      input.price ?? null,
      input.size ?? null,
      input.notionalUsd ?? null,
      submittedAt,
      updatedAt,
      jsonString(input.payload, {})
    );
    return Number(result.lastInsertRowid ?? 0);
  }

  listTrackedMarkets(limit = 100): StoredTrackedMarket[] {
    const rows = this.db.prepare(`
      SELECT
        m.market_key,
        m.title,
        m.slug,
        m.market_id,
        m.condition_id,
        m.category,
        m.end_date,
        m.latest_snapshot_at,
        (
          SELECT c.created_at
          FROM classifications c
          WHERE c.market_key = m.market_key
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT 1
        ) AS latest_classification_at,
        (
          SELECT c.interest_tier
          FROM classifications c
          WHERE c.market_key = m.market_key
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT 1
        ) AS latest_interest_tier,
        (
          SELECT r.completed_at
          FROM research_runs r
          WHERE r.market_key = m.market_key
          ORDER BY r.completed_at DESC, r.run_id DESC
          LIMIT 1
        ) AS latest_research_at,
        (
          SELECT r.fair_value_base
          FROM research_runs r
          WHERE r.market_key = m.market_key
          ORDER BY r.completed_at DESC, r.run_id DESC
          LIMIT 1
        ) AS latest_fair_value_base,
        (SELECT MAX(o.submitted_at) FROM orders o WHERE o.market_key = m.market_key) AS latest_order_at,
        (
          SELECT COUNT(*)
          FROM orders o
          WHERE o.market_key = m.market_key
            AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'filled', 'failed', 'rejected', 'expired', 'closed', 'deleted', 'not_on_venue')
        ) AS active_order_count,
        (
          SELECT l.thesis_key
          FROM market_thesis_links l
          WHERE l.market_key = m.market_key AND COALESCE(l.is_primary, 1) != 0
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT 1
        ) AS primary_thesis_key,
        (
          SELECT t.thesis_title
          FROM market_thesis_links l
          LEFT JOIN theses t ON t.thesis_key = l.thesis_key
          WHERE l.market_key = m.market_key AND COALESCE(l.is_primary, 1) != 0
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT 1
        ) AS primary_thesis_title
      FROM markets m
      WHERE EXISTS (SELECT 1 FROM market_snapshots s WHERE s.market_key = m.market_key)
         OR EXISTS (SELECT 1 FROM classifications c WHERE c.market_key = m.market_key)
         OR EXISTS (SELECT 1 FROM research_runs r WHERE r.market_key = m.market_key)
         OR EXISTS (SELECT 1 FROM orders o WHERE o.market_key = m.market_key)
    `).all();

    return rows
      .map((row) => {
        const record = rowRecord(row);
        const latestActivityAt = [
          typeof record.latest_classification_at === "string" ? record.latest_classification_at : undefined,
          typeof record.latest_research_at === "string" ? record.latest_research_at : undefined,
          typeof record.latest_order_at === "string" ? record.latest_order_at : undefined,
          typeof record.latest_snapshot_at === "string" ? record.latest_snapshot_at : undefined
        ].filter((value): value is string => Boolean(value)).sort().at(-1);
        return {
          marketKey: String(record.market_key),
          title: String(record.title),
          slug: typeof record.slug === "string" ? record.slug : undefined,
          marketId: typeof record.market_id === "string" ? record.market_id : undefined,
          conditionId: typeof record.condition_id === "string" ? record.condition_id : undefined,
          category: typeof record.category === "string" ? record.category : undefined,
          endDate: typeof record.end_date === "string" ? record.end_date : undefined,
          latestSnapshotAt: typeof record.latest_snapshot_at === "string" ? record.latest_snapshot_at : undefined,
          latestClassificationAt: typeof record.latest_classification_at === "string" ? record.latest_classification_at : undefined,
          latestInterestTier: typeof record.latest_interest_tier === "string" ? record.latest_interest_tier : undefined,
          latestResearchAt: typeof record.latest_research_at === "string" ? record.latest_research_at : undefined,
          latestFairValueBase: asNumber(record.latest_fair_value_base),
          latestOrderAt: typeof record.latest_order_at === "string" ? record.latest_order_at : undefined,
          activeOrderCount: Number(record.active_order_count ?? 0),
          primaryThesisKey: typeof record.primary_thesis_key === "string" ? record.primary_thesis_key : undefined,
          primaryThesisTitle: typeof record.primary_thesis_title === "string" ? record.primary_thesis_title : undefined,
          latestActivityAt
        } satisfies StoredTrackedMarket;
      })
      .sort((left, right) => String(right.latestActivityAt ?? "").localeCompare(String(left.latestActivityAt ?? "")))
      .slice(0, Math.max(1, Math.min(500, limit)));
  }

  listOrders(args?: { marketKey?: string; activeOnly?: boolean; limit?: number }): StoredOrderRecord[] {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 100));
    const params: SqlPrimitive[] = [];
    const where: string[] = ["1 = 1"];
    if (args?.marketKey) {
      where.push("market_key = ?");
      params.push(args.marketKey);
    }
    if (args?.activeOnly) {
      where.push("lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'filled', 'failed', 'rejected', 'expired', 'closed', 'deleted', 'not_on_venue')");
    }
    params.push(limit);
    const rows = this.db.prepare(`
      SELECT * FROM orders
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(updated_at, submitted_at) DESC, id DESC
      LIMIT ?
    `).all(...params);
    return rows.map((row) => orderRowToRecord(row));
  }

  updateOrderStatus(orderId: string, status: string, payload?: Record<string, unknown>, updatedAt = nowIso()): void {
    if (payload === undefined) {
      this.db.prepare(`
        UPDATE orders
        SET status = ?, updated_at = ?
        WHERE order_id = ?
      `).run(status, updatedAt, orderId);
      return;
    }

    this.db.prepare(`
      UPDATE orders
      SET status = ?, updated_at = ?, payload_json = ?
      WHERE order_id = ?
    `).run(status, updatedAt, jsonString(payload, {}), orderId);
  }

  markOrdersMissingFromVenue(seenOrderIds: string[], status = "not_on_venue", updatedAt = nowIso()): number {
    const activeFilter = "lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'filled', 'failed', 'rejected', 'expired', 'closed', 'deleted', 'not_on_venue')";
    if (seenOrderIds.length === 0) {
      const result = this.db.prepare(`
        UPDATE orders
        SET status = ?, updated_at = ?
        WHERE ${activeFilter}
      `).run(status, updatedAt);
      return Number(result.changes ?? 0);
    }

    const placeholders = seenOrderIds.map(() => "?").join(", " );
    const result = this.db.prepare(`
      UPDATE orders
      SET status = ?, updated_at = ?
      WHERE ${activeFilter} AND order_id NOT IN (${placeholders})
    `).run(status, updatedAt, ...seenOrderIds);
    return Number(result.changes ?? 0);
  }

  recordAutomationRun(input: StoredAutomationRunInput): string {
    const runId = input.runId ?? randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO automation_runs (
        run_id, automation_name, status, project_mode, started_at, finished_at, findings_count, summary, output_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      input.automationName,
      input.status,
      input.projectMode ?? null,
      input.startedAt ?? nowIso(),
      input.finishedAt ?? null,
      input.findingsCount ?? null,
      input.summary ?? null,
      jsonString(input.output ?? {}, {})
    );
    return runId;
  }

  recordAgentRun(input: StoredAgentRunInput): string {
    const runId = input.runId ?? randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_runs (
        run_id, parent_run_id, agent_name, role, market_key, status, started_at, finished_at, output_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      input.parentRunId ?? null,
      input.agentName,
      input.role ?? null,
      input.marketKey ?? null,
      input.status,
      input.startedAt ?? nowIso(),
      input.finishedAt ?? null,
      jsonString(input.output ?? {}, {})
    );
    return runId;
  }

  recordThesisLink(input: StoredThesisLinkInput): number {
    const marketKey = this.resolveMarketKey(input);
    const createdAt = input.createdAt ?? nowIso();
    const thesisKey = normalizeThesisKey(input.thesisKey);
    const thesisTitle = (input.thesisTitle?.trim() || thesisKey);
    const metadata = input.metadata ?? {};

    this.db.prepare(`
      INSERT INTO markets (
        market_key, market_id, condition_id, slug, title, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market_key) DO UPDATE SET
        market_id = COALESCE(excluded.market_id, markets.market_id),
        condition_id = COALESCE(excluded.condition_id, markets.condition_id),
        slug = COALESCE(excluded.slug, markets.slug),
        title = COALESCE(markets.title, excluded.title),
        updated_at = excluded.updated_at
    `).run(
      marketKey,
      input.marketId ?? null,
      input.conditionId ?? null,
      input.slug ?? null,
      input.title ?? marketKey,
      jsonString([], []),
      createdAt,
      createdAt
    );

    this.db.prepare(`
      INSERT INTO theses (thesis_key, thesis_title, created_at, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(thesis_key) DO UPDATE SET
        thesis_title = COALESCE(excluded.thesis_title, theses.thesis_title),
        updated_at = excluded.updated_at,
        metadata_json = CASE
          WHEN excluded.metadata_json = '{}' THEN theses.metadata_json
          ELSE excluded.metadata_json
        END
    `).run(thesisKey, thesisTitle, createdAt, createdAt, jsonString(metadata, {}));

    if (input.isPrimary ?? true) {
      this.db.prepare(`
        UPDATE market_thesis_links
        SET is_primary = 0
        WHERE market_key = ? AND COALESCE(is_primary, 1) != 0
      `).run(marketKey);
    }

    const result = this.db.prepare(`
      INSERT INTO market_thesis_links (
        market_key, thesis_key, link_source, confidence, is_primary, created_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketKey,
      thesisKey,
      input.linkSource ?? "manual",
      input.confidence ?? null,
      (input.isPrimary ?? true) ? 1 : 0,
      createdAt,
      jsonString(metadata, {})
    );
    return Number(result.lastInsertRowid ?? 0);
  }

  listMarketThesisLinks(args: { marketKey?: string; conditionId?: string; marketId?: string; slug?: string; limit?: number }): StoredThesisLinkRecord[] {
    const marketKey = this.resolveMarketKey(args);
    const limit = Math.max(1, Math.min(100, args.limit ?? 20));
    const rows = this.db.prepare(`
      SELECT l.id, l.market_key, l.thesis_key, t.thesis_title, l.link_source, l.confidence,
             l.is_primary, l.created_at, l.metadata_json
      FROM market_thesis_links l
      LEFT JOIN theses t ON t.thesis_key = l.thesis_key
      WHERE l.market_key = ?
      ORDER BY COALESCE(l.is_primary, 1) DESC, l.created_at DESC, l.id DESC
      LIMIT ?
    `).all(marketKey, limit);
    return rows.map((row) => {
      const record = rowRecord(row);
      return {
        id: asNumber(record.id),
        marketKey: String(record.market_key ?? marketKey),
        thesisKey: String(record.thesis_key ?? ""),
        thesisTitle: typeof record.thesis_title === "string" ? record.thesis_title : undefined,
        linkSource: typeof record.link_source === "string" ? record.link_source : undefined,
        confidence: asNumber(record.confidence),
        isPrimary: Number(record.is_primary ?? 0) !== 0,
        createdAt: typeof record.created_at === "string" ? record.created_at : undefined,
        metadata: parseJson<Record<string, unknown>>(record.metadata_json, {})
      } satisfies StoredThesisLinkRecord;
    });
  }

  getLatestMarketThesisLink(args: { marketKey?: string; conditionId?: string; marketId?: string; slug?: string }): StoredThesisLinkRecord | undefined {
    return this.listMarketThesisLinks({ ...args, limit: 1 })[0];
  }

  recordPortfolioSnapshot(input: StoredPortfolioSnapshotInput): string {
    const snapshotId = input.snapshotId ?? randomUUID();
    const capturedAt = input.capturedAt ?? nowIso();
    const ownerAddress = input.ownerAddress ?? null;
    const positions = Array.isArray(input.current) ? input.current : [];
    const metadata = {
      ...(input.metadata ?? {}),
      closedCount: Array.isArray(input.closed) ? input.closed.length : 0
    };

    const upsertMarket = this.db.prepare(`
      INSERT INTO markets (
        market_key, market_id, condition_id, slug, title, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market_key) DO UPDATE SET
        market_id = COALESCE(excluded.market_id, markets.market_id),
        condition_id = COALESCE(excluded.condition_id, markets.condition_id),
        slug = COALESCE(excluded.slug, markets.slug),
        title = COALESCE(excluded.title, markets.title),
        updated_at = excluded.updated_at
    `);
    const insertPosition = this.db.prepare(`
      INSERT INTO portfolio_positions (
        snapshot_id, owner_address, market_key, market_id, condition_id, slug, title, outcome,
        asset_id, size, average_price, current_value_usd, initial_value_usd, cash_pnl_usd,
        percent_pnl, position_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO portfolio_snapshots (
          snapshot_id, owner_address, captured_at, source, gross_current_value_usd, position_count, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapshotId,
        ownerAddress,
        capturedAt,
        input.source ?? null,
        input.grossCurrentValueUsd ?? null,
        positions.length,
        jsonString(metadata, {})
      );

      for (const rawPosition of positions) {
        const row = unknownRecord(rawPosition);
        const conditionId = firstString(
          row.conditionId,
          row.condition_id,
          row.condition,
          typeof row.market === "string" && row.market.startsWith("0x") ? row.market : undefined
        );
        const marketId = firstString(
          row.market_id,
          row.marketId,
          typeof row.market === "string" && /^\d+$/.test(row.market) ? row.market : undefined
        );
        const slug = firstString(row.slug, row.market_slug, row.marketSlug);
        const title = firstString(row.title, row.question, row.marketTitle, row.market_title, row.eventTitle);
        const marketKey = conditionId || marketId || slug || title
          ? this.resolveMarketKey({ conditionId, marketId, slug, title })
          : undefined;

        if (marketKey) {
          upsertMarket.run(
            marketKey,
            marketId ?? null,
            conditionId ?? null,
            slug ?? null,
            title ?? marketKey,
            jsonString([], []),
            capturedAt,
            capturedAt
          );
        }

        insertPosition.run(
          snapshotId,
          ownerAddress,
          marketKey ?? null,
          marketId ?? null,
          conditionId ?? null,
          slug ?? null,
          title ?? null,
          firstString(row.outcome, row.side, row.tokenOutcome, row.token_outcome) ?? null,
          firstString(row.asset_id, row.assetId, row.token_id, row.tokenId) ?? null,
          asNumber(row.size ?? row.amount ?? row.quantity ?? row.shares) ?? null,
          asNumber(row.avgPrice ?? row.avg_price ?? row.averagePrice ?? row.price) ?? null,
          asNumber(row.currentValue ?? row.current_value ?? row.current_value_usd ?? row.value) ?? null,
          asNumber(row.initialValue ?? row.initial_value ?? row.initial_value_usd ?? row.costBasis) ?? null,
          asNumber(row.cashPnl ?? row.cash_pnl ?? row.realizedPnl ?? row.realized_pnl) ?? null,
          asNumber(row.percentPnl ?? row.percent_pnl ?? row.pnlPercent) ?? null,
          jsonString(rawPosition, {})
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return snapshotId;
  }

  getLatestPortfolioSnapshot(args?: { ownerAddress?: string }): StoredPortfolioSnapshotRecord | undefined {
    const row = args?.ownerAddress
      ? this.db.prepare(`
          SELECT *
          FROM portfolio_snapshots
          WHERE owner_address = ?
          ORDER BY captured_at DESC, snapshot_id DESC
          LIMIT 1
        `).get(args.ownerAddress)
      : this.db.prepare(`
          SELECT *
          FROM portfolio_snapshots
          ORDER BY captured_at DESC, snapshot_id DESC
          LIMIT 1
        `).get();
    if (!row) {
      return undefined;
    }
    const record = rowRecord(row);
    return {
      snapshotId: String(record.snapshot_id ?? ""),
      ownerAddress: typeof record.owner_address === "string" ? record.owner_address : undefined,
      capturedAt: String(record.captured_at ?? nowIso()),
      source: typeof record.source === "string" ? record.source : undefined,
      grossCurrentValueUsd: asNumber(record.gross_current_value_usd),
      positionCount: Number(record.position_count ?? 0),
      metadata: parseJson<Record<string, unknown>>(record.metadata_json, {})
    } satisfies StoredPortfolioSnapshotRecord;
  }

  listPortfolioPositions(args?: { snapshotId?: string; marketKey?: string; ownerAddress?: string; limit?: number }): StoredPortfolioPositionRecord[] {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 100));
    const snapshotId = args?.snapshotId ?? this.getLatestPortfolioSnapshot({ ownerAddress: args?.ownerAddress })?.snapshotId;
    if (!snapshotId) {
      return [];
    }
    const params: SqlPrimitive[] = [snapshotId];
    const where: string[] = ["p.snapshot_id = ?"];
    if (args?.marketKey) {
      where.push("p.market_key = ?");
      params.push(args.marketKey);
    }
    params.push(limit);
    const rows = this.db.prepare(`
      SELECT p.*
      FROM portfolio_positions p
      WHERE ${where.join(" AND ")}
      ORDER BY p.id DESC
      LIMIT ?
    `).all(...params);
    return rows.map((row) => {
      const record = rowRecord(row);
      return {
        id: asNumber(record.id),
        snapshotId: String(record.snapshot_id ?? snapshotId),
        ownerAddress: typeof record.owner_address === "string" ? record.owner_address : undefined,
        marketKey: typeof record.market_key === "string" ? record.market_key : undefined,
        marketId: typeof record.market_id === "string" ? record.market_id : undefined,
        conditionId: typeof record.condition_id === "string" ? record.condition_id : undefined,
        slug: typeof record.slug === "string" ? record.slug : undefined,
        title: typeof record.title === "string" ? record.title : undefined,
        outcome: typeof record.outcome === "string" ? record.outcome : undefined,
        assetId: typeof record.asset_id === "string" ? record.asset_id : undefined,
        size: asNumber(record.size),
        averagePrice: asNumber(record.average_price),
        currentValueUsd: asNumber(record.current_value_usd),
        initialValueUsd: asNumber(record.initial_value_usd),
        cashPnlUsd: asNumber(record.cash_pnl_usd),
        percentPnl: asNumber(record.percent_pnl),
        position: parseJson<Record<string, unknown>>(record.position_json, {})
      } satisfies StoredPortfolioPositionRecord;
    });
  }

  getPortfolioRiskSummary(args?: { ownerAddress?: string; limit?: number }): StoredPortfolioRiskSummary {
    const latestSnapshot = this.getLatestPortfolioSnapshot({ ownerAddress: args?.ownerAddress });
    const positions = latestSnapshot
      ? this.db.prepare(`
          SELECT p.*, m.title AS market_title, m.category AS market_category
          FROM portfolio_positions p
          LEFT JOIN markets m ON m.market_key = p.market_key
          WHERE p.snapshot_id = ?
          ORDER BY p.id DESC
        `).all(latestSnapshot.snapshotId)
      : [];

    const activeOrderRows = this.db.prepare(`
      SELECT o.*, m.title AS market_title, m.category AS market_category
      FROM orders o
      LEFT JOIN markets m ON m.market_key = o.market_key
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'filled', 'failed', 'rejected', 'expired', 'closed', 'deleted', 'not_on_venue')
      ORDER BY COALESCE(o.updated_at, o.submitted_at) DESC, o.id DESC
    `).all();

    const linkRows = this.db.prepare(`
      SELECT l.id, l.market_key, l.thesis_key, t.thesis_title, l.link_source, l.confidence,
             l.is_primary, l.created_at, l.metadata_json
      FROM market_thesis_links l
      LEFT JOIN theses t ON t.thesis_key = l.thesis_key
      ORDER BY l.market_key ASC, COALESCE(l.is_primary, 1) DESC, l.created_at DESC, l.id DESC
    `).all();

    const primaryLinkByMarket = new Map<string, StoredThesisLinkRecord>();
    for (const rawRow of linkRows) {
      const record = rowRecord(rawRow);
      const marketKey = String(record.market_key ?? "");
      if (!marketKey || primaryLinkByMarket.has(marketKey)) {
        continue;
      }
      primaryLinkByMarket.set(marketKey, {
        id: asNumber(record.id),
        marketKey,
        thesisKey: String(record.thesis_key ?? ""),
        thesisTitle: typeof record.thesis_title === "string" ? record.thesis_title : undefined,
        linkSource: typeof record.link_source === "string" ? record.link_source : undefined,
        confidence: asNumber(record.confidence),
        isPrimary: Number(record.is_primary ?? 0) !== 0,
        createdAt: typeof record.created_at === "string" ? record.created_at : undefined,
        metadata: parseJson<Record<string, unknown>>(record.metadata_json, {})
      });
    }

    const marketExposureMap = new Map<string, StoredMarketExposureRecord>();
    const ensureMarketExposure = (marketKey: string, title?: string, category?: string): StoredMarketExposureRecord => {
      const existing = marketExposureMap.get(marketKey);
      if (existing) {
        if (!existing.title && title) existing.title = title;
        if (!existing.category && category) existing.category = category;
        return existing;
      }
      const link = primaryLinkByMarket.get(marketKey);
      const created: StoredMarketExposureRecord = {
        marketKey,
        title,
        category,
        thesisKey: link?.thesisKey,
        thesisTitle: link?.thesisTitle,
        currentValueUsd: 0,
        activeOpenOrderNotionalUsd: 0,
        totalExposureUsd: 0,
        activeOrderCount: 0
      };
      marketExposureMap.set(marketKey, created);
      return created;
    };

    for (const rawRow of positions) {
      const record = rowRecord(rawRow);
      const marketKey = firstString(record.market_key);
      if (!marketKey) {
        continue;
      }
      const entry = ensureMarketExposure(
        marketKey,
        firstString(record.market_title, record.title),
        firstString(record.market_category)
      );
      entry.currentValueUsd += Math.abs(asNumber(record.current_value_usd) ?? 0);
    }

    for (const rawRow of activeOrderRows) {
      const record = rowRecord(rawRow);
      const marketKey = firstString(record.market_key);
      if (!marketKey) {
        continue;
      }
      const entry = ensureMarketExposure(
        marketKey,
        firstString(record.market_title),
        firstString(record.market_category)
      );
      const notionalUsd = Math.abs(
        asNumber(record.notional_usd) ??
          ((asNumber(record.price) ?? 0) * (asNumber(record.size) ?? 0))
      );
      entry.activeOpenOrderNotionalUsd += notionalUsd;
      entry.activeOrderCount += 1;
    }

    const thesisExposureMap = new Map<string, StoredThesisExposureRecord>();
    let unlinkedExposureUsd = 0;
    for (const entry of marketExposureMap.values()) {
      entry.currentValueUsd = Number(entry.currentValueUsd.toFixed(6));
      entry.activeOpenOrderNotionalUsd = Number(entry.activeOpenOrderNotionalUsd.toFixed(6));
      entry.totalExposureUsd = Number((entry.currentValueUsd + entry.activeOpenOrderNotionalUsd).toFixed(6));
      if (!entry.thesisKey) {
        unlinkedExposureUsd += entry.totalExposureUsd;
        continue;
      }
      const thesisKey = entry.thesisKey;
      let thesis = thesisExposureMap.get(thesisKey);
      if (!thesis) {
        thesis = {
          thesisKey,
          thesisTitle: entry.thesisTitle,
          currentValueUsd: 0,
          activeOpenOrderNotionalUsd: 0,
          totalExposureUsd: 0,
          marketCount: 0,
          activeOrderCount: 0,
          markets: []
        };
        thesisExposureMap.set(thesisKey, thesis);
      }
      thesis.currentValueUsd += entry.currentValueUsd;
      thesis.activeOpenOrderNotionalUsd += entry.activeOpenOrderNotionalUsd;
      thesis.totalExposureUsd += entry.totalExposureUsd;
      thesis.activeOrderCount += entry.activeOrderCount;
      thesis.marketCount += 1;
      thesis.markets.push({ ...entry });
    }

    const marketExposures = Array.from(marketExposureMap.values())
      .sort((left, right) => right.totalExposureUsd - left.totalExposureUsd)
      .slice(0, Math.max(1, Math.min(500, args?.limit ?? 200)));
    const thesisExposures = Array.from(thesisExposureMap.values())
      .map((entry) => ({
        ...entry,
        currentValueUsd: Number(entry.currentValueUsd.toFixed(6)),
        activeOpenOrderNotionalUsd: Number(entry.activeOpenOrderNotionalUsd.toFixed(6)),
        totalExposureUsd: Number(entry.totalExposureUsd.toFixed(6)),
        markets: entry.markets.sort((left, right) => right.totalExposureUsd - left.totalExposureUsd)
      }))
      .sort((left, right) => right.totalExposureUsd - left.totalExposureUsd)
      .slice(0, Math.max(1, Math.min(200, args?.limit ?? 100)));

    const grossCurrentValueUsd = Number((latestSnapshot?.grossCurrentValueUsd ?? positions.reduce((sum, rawRow) => {
      const record = rowRecord(rawRow);
      return sum + Math.abs(asNumber(record.current_value_usd) ?? 0);
    }, 0)).toFixed(6));
    const grossOpenOrderNotionalUsd = Number(Array.from(marketExposureMap.values()).reduce((sum, entry) => sum + entry.activeOpenOrderNotionalUsd, 0).toFixed(6));

    return {
      generatedAt: nowIso(),
      latestSnapshot,
      grossCurrentValueUsd,
      grossOpenOrderNotionalUsd,
      grossEffectiveExposureUsd: Number((grossCurrentValueUsd + grossOpenOrderNotionalUsd).toFixed(6)),
      activeOpenOrderCount: activeOrderRows.length,
      marketExposures,
      thesisExposures,
      unlinkedExposureUsd: Number(unlinkedExposureUsd.toFixed(6))
    } satisfies StoredPortfolioRiskSummary;
  }

  getStateSummary(limit = 10): StoredStateSummary {
    const counts = {
      markets: this.preparedCount("markets"),
      marketSnapshots: this.preparedCount("market_snapshots"),
      alerts: this.preparedCount("alerts"),
      developments: this.preparedCount("developments"),
      researchRuns: this.preparedCount("research_runs"),
      evidenceItems: this.preparedCount("evidence_items"),
      classifications: this.preparedCount("classifications"),
      orderPreviews: this.preparedCount("order_previews"),
      orders: this.preparedCount("orders"),
      theses: this.preparedCount("theses"),
      marketThesisLinks: this.preparedCount("market_thesis_links"),
      portfolioSnapshots: this.preparedCount("portfolio_snapshots"),
      portfolioPositions: this.preparedCount("portfolio_positions"),
      automationRuns: this.preparedCount("automation_runs"),
      agentRuns: this.preparedCount("agent_runs")
    } satisfies Record<string, number>;

    const recentResearchRuns = this.db.prepare(`
      SELECT run_id, market_key, title, question, thesis, fair_value_low, fair_value_base, fair_value_high,
             completed_at, automation_name
      FROM research_runs
      ORDER BY completed_at DESC
      LIMIT ?
    `).all(limit).map((row) => rowRecord(row));

    const recentClassifications = this.db.prepare(`
      SELECT market_key, created_at, structural_type, interest_tier, modelability_score,
             tradability_score, trade_opportunity_score
      FROM classifications
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(limit).map((row) => rowRecord(row));

    const recentOrderPreviews = this.db.prepare(`
      SELECT preview_id, market_key, created_at, order_kind, can_submit, policy_hash,
             submitted_at, deleted_at
      FROM order_previews
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit).map((row) => rowRecord(row));

    return {
      dbPath: this.dbPath,
      generatedAt: nowIso(),
      counts,
      recentAlerts: this.listAlerts({ scope: "all", limit }),
      recentResearchRuns,
      recentClassifications,
      recentOrderPreviews,
      recentThesisLinks: this.db.prepare(`
        SELECT l.id, l.market_key, l.thesis_key, t.thesis_title, l.link_source, l.confidence,
               l.is_primary, l.created_at, l.metadata_json
        FROM market_thesis_links l
        LEFT JOIN theses t ON t.thesis_key = l.thesis_key
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ?
      `).all(limit).map((row) => {
        const record = rowRecord(row);
        return {
          id: asNumber(record.id),
          marketKey: String(record.market_key ?? ""),
          thesisKey: String(record.thesis_key ?? ""),
          thesisTitle: typeof record.thesis_title === "string" ? record.thesis_title : undefined,
          linkSource: typeof record.link_source === "string" ? record.link_source : undefined,
          confidence: asNumber(record.confidence),
          isPrimary: Number(record.is_primary ?? 0) !== 0,
          createdAt: typeof record.created_at === "string" ? record.created_at : undefined,
          metadata: parseJson<Record<string, unknown>>(record.metadata_json, {})
        } satisfies StoredThesisLinkRecord;
      }),
      latestPortfolioSnapshot: this.getLatestPortfolioSnapshot()
    };
  }

  getMarketState(args: { marketKey?: string; conditionId?: string; marketId?: string; slug?: string; limit?: number }): StoredMarketState {
    const marketKey = this.resolveMarketKey(args);
    const limit = Math.max(1, Math.min(100, args.limit ?? 20));
    const marketRow = this.db.prepare(`SELECT * FROM markets WHERE market_key = ? LIMIT 1`).get(marketKey);
    const latestSnapshot = this.getLatestMarketSnapshot({ marketKey });

    const snapshots = this.db.prepare(`
      SELECT id, market_key, captured_at, price, best_bid, best_ask, midpoint, spread_cents,
             liquidity_usd, volume_usd, category, end_date, snapshot_json
      FROM market_snapshots
      WHERE market_key = ?
      ORDER BY captured_at DESC, id DESC
      LIMIT ?
    `).all(marketKey, limit).map((row) => {
      const record = rowRecord(row);
      return {
        ...record,
        snapshot: parseJson<Record<string, unknown>>(record.snapshot_json, {})
      };
    });

    const developments = this.db.prepare(`
      SELECT * FROM developments
      WHERE market_key = ?
      ORDER BY discovered_at DESC, id DESC
      LIMIT ?
    `).all(marketKey, limit).map((row) => {
      const record = rowRecord(row);
      return {
        ...record,
        tags: parseJson<string[]>(record.tags_json, []),
        payload: parseJson<Record<string, unknown>>(record.payload_json, {})
      };
    });

    const classifications = this.db.prepare(`
      SELECT * FROM classifications
      WHERE market_key = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(marketKey, limit).map((row) => {
      const record = rowRecord(row);
      return {
        ...record,
        reasonCodes: parseJson<string[]>(record.reason_codes_json, []),
        disqualifiers: parseJson<string[]>(record.disqualifiers_json, []),
        decision: parseJson<Record<string, unknown>>(record.decision_json, {})
      };
    });

    const researchRuns = this.db.prepare(`
      SELECT * FROM research_runs
      WHERE market_key = ?
      ORDER BY completed_at DESC, run_id DESC
      LIMIT ?
    `).all(marketKey, limit).map((row) => {
      const record = rowRecord(row);
      const evidence = this.db.prepare(`
        SELECT source, title, url, summary, stance, confidence, item_json
        FROM evidence_items
        WHERE run_id = ?
        ORDER BY id ASC
      `).all(String(record.run_id)).map((item) => {
        const evidenceRow = rowRecord(item);
        return parseJson<Record<string, unknown>>(evidenceRow.item_json, {
          source: evidenceRow.source,
          title: evidenceRow.title,
          url: evidenceRow.url,
          summary: evidenceRow.summary,
          stance: evidenceRow.stance,
          confidence: evidenceRow.confidence
        });
      });
      return {
        ...record,
        openQuestions: parseJson<string[]>(record.open_questions_json, []),
        providers: parseJson<string[]>(record.providers_json, []),
        synthesis: parseJson<Record<string, unknown>>(record.synthesis_json, {}),
        evidence
      };
    });

    const previews = this.db.prepare(`
      SELECT * FROM order_previews
      WHERE market_key = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(marketKey, limit).map((row) => {
      const record = rowRecord(row);
      return {
        previewId: record.preview_id,
        createdAt: record.created_at,
        orderKind: record.order_kind,
        canSubmit: Number(record.can_submit ?? 0) !== 0,
        policyHash: record.policy_hash,
        normalizedParams: parseJson<Record<string, unknown>>(record.normalized_params_json, {}),
        warnings: parseJson<StoredPolicyWarning[]>(record.warnings_json, []),
        marketSnapshot: record.market_snapshot_json
          ? parseJson<Record<string, unknown>>(record.market_snapshot_json, {})
          : undefined,
        submittedAt: record.submitted_at,
        deletedAt: record.deleted_at
      };
    });

    const orders = this.db.prepare(`
      SELECT * FROM orders
      WHERE market_key = ?
      ORDER BY submitted_at DESC, id DESC
      LIMIT ?
    `).all(marketKey, limit).map((row) => {
      const record = rowRecord(row);
      return {
        ...record,
        payload: parseJson<Record<string, unknown>>(record.payload_json, {})
      };
    });

    const thesisLinks = this.listMarketThesisLinks({ marketKey, limit });
    const portfolioPositions = this.listPortfolioPositions({ marketKey, limit });

    return {
      market: marketRow ? rowRecord(marketRow) : null,
      latestSnapshot,
      snapshots,
      alerts: this.listAlerts({ scope: "all", marketKey, limit }),
      developments,
      classifications,
      researchRuns,
      previews,
      orders,
      thesisLinks,
      portfolioPositions
    };
  }

  close(): void {
    this.db.close();
    stateStoreCache.delete(this.dbPath);
  }
}

const stateStoreCache = new Map<string, StateStore>();

export function openStateStore(dbPath: string): StateStore {
  const resolved = path.resolve(dbPath);
  const cached = stateStoreCache.get(resolved);
  if (cached) {
    return cached;
  }
  const store = new StateStore({ dbPath: resolved });
  stateStoreCache.set(resolved, store);
  return store;
}
