import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REQUIRED_TOOLS = [
  "ingest_market_universe",
  "start_auto_trading_session",
  "run_auto_trading_iteration",
  "get_auto_trading_session",
  "run_auto_trading_executor"
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    stateDbPath: "state/autotrader-mcp-smoke.sqlite",
    ingest: true,
    source: "composite",
    universePages: 1,
    pageSize: 100,
    enrichTopN: 0,
    budgetUsdc: 30,
    timeframeHours: 24,
    maxSingleOrderUsdc: 5,
    limit: 25
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--state-db") {
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
    } else if (arg === "--max-single-order-usdc") {
      options.maxSingleOrderUsdc = Number(next);
      index += 1;
    } else if (arg.startsWith("--max-single-order-usdc=")) {
      options.maxSingleOrderUsdc = Number(arg.split("=")[1]);
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
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

async function main() {
  const options = parseArgs();
  const client = new Client({
    name: "codex-autotrader-mcp-smoke",
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
    toolInventory: null,
    universe: null,
    session: null,
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
        min_liquidity_usdc: 1000,
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

    const started = await callTool(client, "start_auto_trading_session", {
      name: "mcp smoke live_guarded no submit",
      budget_usdc: options.budgetUsdc,
      timeframe_hours: options.timeframeHours,
      risk_profile: "aggressive",
      mode: "live_guarded",
      max_single_order_usdc: options.maxSingleOrderUsdc,
      max_open_positions: 3,
      max_market_horizon_hours: Math.max(options.timeframeHours, 72),
      min_liquidity_usdc: 1000,
      max_spread_cents: 12,
      stop_loss_usdc: Math.min(10, options.budgetUsdc * 0.35),
      limit: options.limit,
      compact: true
    });
    const sessionId = started.output?.session?.sessionId ?? started.output?.sessionId;
    const decisions = Array.isArray(started.output?.candidates) ? started.output.candidates : [];
    report.session = {
      elapsedMs: started.elapsedMs,
      sessionId,
      mode: started.output?.summary?.mode ?? started.output?.session?.mode,
      actionCounts: countActions(decisions),
      proposedOrders: started.output?.summary?.proposedOrders,
      nextRunAt: started.output?.summary?.nextRunAt
    };
    if (!sessionId) {
      throw new Error("Could not derive session ID from start_auto_trading_session.");
    }

    const iteration = await callTool(client, "run_auto_trading_iteration", {
      session_id: sessionId,
      limit: options.limit,
      compact: true
    });
    const iterationDecisions = Array.isArray(iteration.output?.candidates) ? iteration.output.candidates : [];
    report.iteration = {
      elapsedMs: iteration.elapsedMs,
      actionCounts: countActions(iterationDecisions),
      proposedOrders: iteration.output?.summary?.proposedOrders,
      nextRunAt: iteration.output?.summary?.nextRunAt
    };

    const dryRunExecutor = await callTool(client, "run_auto_trading_executor", {
      session_id: sessionId,
      limit: 3,
      auto_submit: false,
      dry_run: true
    });
    report.dryRunExecutor = {
      elapsedMs: dryRunExecutor.elapsedMs,
      ...summarizeExecutor(dryRunExecutor.output)
    };

    const previewExecutor = await callTool(client, "run_auto_trading_executor", {
      session_id: sessionId,
      limit: 1,
      auto_submit: false,
      dry_run: false
    });
    report.previewExecutor = {
      elapsedMs: previewExecutor.elapsedMs,
      ...summarizeExecutor(previewExecutor.output)
    };

    report.summary = {
      ok: true,
      liveGuardedSessionCreated: Boolean(sessionId),
      dryRunCandidates: report.dryRunExecutor.candidateCount,
      previewAttempts: report.previewExecutor.executedCount,
      previewIds: report.previewExecutor.previewIds,
      submittedOrders: report.previewExecutor.submitted,
      noSubmitInvariantHeld: report.previewExecutor.submitted === 0
    };
    if (!report.summary.noSubmitInvariantHeld) {
      throw new Error("Smoke invariant failed: executor submitted an order while POLYMARKET_ENABLE_TRADING=false.");
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
