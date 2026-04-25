import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REQUIRED_TOOLS = [
  "ingest_market_universe",
  "start_auto_trading_session",
  "list_auto_trading_sessions",
  "run_auto_trading_iteration",
  "get_auto_trading_session",
  "run_auto_trading_executor"
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sessionId: undefined,
    sessionName: "autotrader heartbeat live_guarded no submit",
    stateDbPath: "state/autotrader-heartbeat.sqlite",
    ingest: true,
    source: "composite",
    universePages: 1,
    pageSize: 100,
    enrichTopN: 0,
    budgetUsdc: 30,
    timeframeHours: 24,
    riskProfile: "aggressive",
    mode: "live_guarded",
    maxSingleOrderUsdc: 5,
    maxOpenPositions: 3,
    maxMarketHorizonHours: 72,
    minLiquidityUsdc: 1000,
    maxSpreadCents: 12,
    stopLossUsdc: 10,
    limit: 25,
    executorLimit: 5,
    previewLimit: 1
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--session-id") {
      options.sessionId = next;
      index += 1;
    } else if (arg.startsWith("--session-id=")) {
      options.sessionId = arg.split("=")[1];
    } else if (arg === "--session-name") {
      options.sessionName = next;
      index += 1;
    } else if (arg.startsWith("--session-name=")) {
      options.sessionName = arg.split("=")[1];
    } else if (arg === "--state-db") {
      options.stateDbPath = next;
      index += 1;
    } else if (arg.startsWith("--state-db=")) {
      options.stateDbPath = arg.split("=")[1];
    } else if (arg === "--no-ingest") {
      options.ingest = false;
    } else if (arg === "--source") {
      options.source = next;
      index += 1;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1];
    } else if (arg === "--universe-pages") {
      options.universePages = Number(next);
      index += 1;
    } else if (arg.startsWith("--universe-pages=")) {
      options.universePages = Number(arg.split("=")[1]);
    } else if (arg === "--page-size") {
      options.pageSize = Number(next);
      index += 1;
    } else if (arg.startsWith("--page-size=")) {
      options.pageSize = Number(arg.split("=")[1]);
    } else if (arg === "--enrich-top-n") {
      options.enrichTopN = Number(next);
      index += 1;
    } else if (arg.startsWith("--enrich-top-n=")) {
      options.enrichTopN = Number(arg.split("=")[1]);
    } else if (arg === "--budget-usdc") {
      options.budgetUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--budget-usdc=")) {
      options.budgetUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--timeframe-hours") {
      options.timeframeHours = Number(next);
      index += 1;
    } else if (arg.startsWith("--timeframe-hours=")) {
      options.timeframeHours = Number(arg.split("=")[1]);
    } else if (arg === "--risk-profile") {
      options.riskProfile = next;
      index += 1;
    } else if (arg.startsWith("--risk-profile=")) {
      options.riskProfile = arg.split("=")[1];
    } else if (arg === "--mode") {
      options.mode = next;
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg === "--max-single-order-usdc") {
      options.maxSingleOrderUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-single-order-usdc=")) {
      options.maxSingleOrderUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--max-open-positions") {
      options.maxOpenPositions = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-open-positions=")) {
      options.maxOpenPositions = Number(arg.split("=")[1]);
    } else if (arg === "--max-market-horizon-hours") {
      options.maxMarketHorizonHours = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-market-horizon-hours=")) {
      options.maxMarketHorizonHours = Number(arg.split("=")[1]);
    } else if (arg === "--min-liquidity-usdc") {
      options.minLiquidityUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--min-liquidity-usdc=")) {
      options.minLiquidityUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--max-spread-cents") {
      options.maxSpreadCents = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-spread-cents=")) {
      options.maxSpreadCents = Number(arg.split("=")[1]);
    } else if (arg === "--stop-loss-usdc") {
      options.stopLossUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--stop-loss-usdc=")) {
      options.stopLossUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
    } else if (arg === "--executor-limit") {
      options.executorLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--executor-limit=")) {
      options.executorLimit = Number(arg.split("=")[1]);
    } else if (arg === "--preview-limit") {
      options.previewLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--preview-limit=")) {
      options.previewLimit = Number(arg.split("=")[1]);
    } else if (arg === "--no-preview") {
      options.previewLimit = 0;
    }
  }
  return options;
}

function makeTransport(options) {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["./node_modules/tsx/dist/cli.mjs", "./servers/polymarket-mcp/src/server.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: {
      ...process.env,
      POLYMARKET_ENABLE_TRADING: "false",
      POLYMARKET_REQUIRE_PREVIEW: "true",
      POLYMARKET_REQUIRE_GEOBLOCK_CHECK: "true",
      POLYMARKET_STATE_DB_PATH: options.stateDbPath
    }
  });
}

function textFromResult(result) {
  if (!Array.isArray(result?.content)) {
    return "";
  }
  return result.content
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function compactToolResult(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const text = textFromResult(result);
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function callTool(client, name, args) {
  const startedAt = Date.now();
  const result = await client.callTool({ name, arguments: args });
  if (result?.isError) {
    throw new Error(`${name} failed: ${textFromResult(result) || "Tool returned isError=true"}`);
  }
  return {
    elapsedMs: Date.now() - startedAt,
    output: compactToolResult(result)
  };
}

function countActions(decisions = []) {
  return decisions.reduce((counts, decision) => {
    const action = decision?.action ?? "unknown";
    counts[action] = (counts[action] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeExecutor(output) {
  const results = Array.isArray(output?.results) ? output.results : [];
  return {
    candidateCount: output?.candidateCount ?? 0,
    executedCount: output?.executedCount ?? 0,
    statuses: results.reduce((counts, item) => {
      const status = item?.execution?.status ?? "no_execution";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {}),
    previewIds: results.map((item) => item?.previewId).filter(Boolean),
    submitted: results.filter((item) => item?.execution?.status === "submitted").length
  };
}

function sessionIsUsable(session, options) {
  if (!session || session.status !== "active" || session.mode !== options.mode) {
    return false;
  }
  if (options.sessionName && session.name !== options.sessionName) {
    return false;
  }
  const endsAt = Date.parse(session.endsAt);
  return Number.isFinite(endsAt) && endsAt > Date.now();
}

async function findOrCreateSession(client, options, report) {
  if (options.sessionId) {
    const existing = await callTool(client, "get_auto_trading_session", {
      session_id: options.sessionId,
      decision_limit: 25,
      compact: true
    });
    report.sessionLookup = {
      source: "session_id",
      elapsedMs: existing.elapsedMs,
      sessionId: options.sessionId
    };
    return { sessionId: options.sessionId, started: false, iterationOutput: undefined };
  }

  const listed = await callTool(client, "list_auto_trading_sessions", {
    status: "active",
    mode: options.mode,
    include_expired: false,
    limit: 100
  });
  const sessions = Array.isArray(listed.output?.sessions) ? listed.output.sessions : [];
  const reusable = sessions.find((session) => sessionIsUsable(session, options));
  report.sessionLookup = {
    source: "list_auto_trading_sessions",
    elapsedMs: listed.elapsedMs,
    activeCount: listed.output?.count ?? sessions.length,
    reusedSessionId: reusable?.sessionId
  };
  if (reusable?.sessionId) {
    return { sessionId: reusable.sessionId, started: false, iterationOutput: undefined };
  }

  const started = await callTool(client, "start_auto_trading_session", {
    name: options.sessionName,
    budget_usdc: options.budgetUsdc,
    timeframe_hours: options.timeframeHours,
    risk_profile: options.riskProfile,
    mode: options.mode,
    max_single_order_usdc: options.maxSingleOrderUsdc,
    max_open_positions: options.maxOpenPositions,
    max_market_horizon_hours: Math.max(options.maxMarketHorizonHours, options.timeframeHours),
    min_liquidity_usdc: options.minLiquidityUsdc,
    max_spread_cents: options.maxSpreadCents,
    stop_loss_usdc: Math.min(options.stopLossUsdc, options.budgetUsdc),
    limit: options.limit,
    compact: true
  });
  const sessionId = started.output?.session?.sessionId ?? started.output?.sessionId;
  if (!sessionId) {
    throw new Error("Could not derive session ID from start_auto_trading_session.");
  }
  const decisions = Array.isArray(started.output?.candidates) ? started.output.candidates : [];
  report.sessionStarted = {
    elapsedMs: started.elapsedMs,
    sessionId,
    actionCounts: countActions(decisions),
    proposedOrders: started.output?.summary?.proposedOrders,
    nextRunAt: started.output?.summary?.nextRunAt
  };
  return { sessionId, started: true, iterationOutput: started.output };
}

async function main() {
  const options = parseArgs();
  const client = new Client({
    name: "codex-autotrader-heartbeat",
    version: "0.1.0"
  });
  const transport = makeTransport(options);
  if (transport.stderr) {
    transport.stderr.on("data", () => {
      // Drain server logs so stdio remains healthy.
    });
  }

  const report = {
    environment: {
      cwd: process.cwd(),
      node: process.version,
      stateDbPath: options.stateDbPath,
      tradingEnabled: false
    },
    options: {
      sessionName: options.sessionName,
      mode: options.mode,
      riskProfile: options.riskProfile,
      budgetUsdc: options.budgetUsdc,
      timeframeHours: options.timeframeHours,
      executorLimit: options.executorLimit,
      previewLimit: options.previewLimit
    },
    toolInventory: null,
    universe: null,
    sessionLookup: null,
    sessionStarted: null,
    iteration: null,
    dryRunExecutor: null,
    previewExecutor: null,
    summary: null
  };

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    const missing = REQUIRED_TOOLS.filter((name) => !toolNames.includes(name));
    report.toolInventory = {
      count: toolNames.length,
      missing,
      required: REQUIRED_TOOLS
    };
    if (missing.length > 0) {
      throw new Error(`Missing required MCP tools: ${missing.join(", ")}`);
    }

    if (options.ingest) {
      const universe = await callTool(client, "ingest_market_universe", {
        active_only: true,
        include_closed: false,
        source: options.source,
        page_size: options.pageSize,
        limit_pages: options.universePages,
        min_liquidity_usdc: options.minLiquidityUsdc,
        enrich_top_n: options.enrichTopN,
        enrichment_profile: options.enrichTopN > 0 ? "microstructure" : "none"
      });
      report.universe = {
        elapsedMs: universe.elapsedMs,
        runId: universe.output?.runId ?? universe.output?.run_id,
        totalMarkets: universe.output?.totalMarkets ?? universe.output?.total_markets,
        enrichedMarkets: universe.output?.enrichedMarkets ?? universe.output?.enriched_markets
      };
    }

    const session = await findOrCreateSession(client, options, report);
    const iteration = session.iterationOutput
      ? { elapsedMs: 0, output: session.iterationOutput }
      : await callTool(client, "run_auto_trading_iteration", {
        session_id: session.sessionId,
        limit: options.limit,
        compact: true
      });
    const decisions = Array.isArray(iteration.output?.candidates) ? iteration.output.candidates : [];
    report.iteration = {
      elapsedMs: iteration.elapsedMs,
      sessionId: session.sessionId,
      startedThisRun: session.started,
      actionCounts: countActions(decisions),
      proposedOrders: iteration.output?.summary?.proposedOrders,
      nextRunAt: iteration.output?.summary?.nextRunAt
    };

    const dryRunExecutor = await callTool(client, "run_auto_trading_executor", {
      session_id: session.sessionId,
      limit: options.executorLimit,
      auto_submit: false,
      dry_run: true
    });
    report.dryRunExecutor = {
      elapsedMs: dryRunExecutor.elapsedMs,
      ...summarizeExecutor(dryRunExecutor.output)
    };

    if (options.previewLimit > 0) {
      const previewExecutor = await callTool(client, "run_auto_trading_executor", {
        session_id: session.sessionId,
        limit: options.previewLimit,
        auto_submit: false,
        dry_run: false
      });
      report.previewExecutor = {
        elapsedMs: previewExecutor.elapsedMs,
        ...summarizeExecutor(previewExecutor.output)
      };
    }

    const submittedOrders = (report.previewExecutor?.submitted ?? 0);
    report.summary = {
      ok: true,
      sessionId: session.sessionId,
      startedThisRun: session.started,
      dryRunCandidates: report.dryRunExecutor.candidateCount,
      previewAttempts: report.previewExecutor?.executedCount ?? 0,
      previewIds: report.previewExecutor?.previewIds ?? [],
      submittedOrders,
      noSubmitInvariantHeld: submittedOrders === 0,
      nextRunAt: report.iteration.nextRunAt
    };
    if (!report.summary.noSubmitInvariantHeld) {
      throw new Error("Heartbeat invariant failed: executor submitted an order while POLYMARKET_ENABLE_TRADING=false.");
    }
  } finally {
    await transport.close().catch(() => {});
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
