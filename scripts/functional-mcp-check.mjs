import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TOOL_NAMES = [
  "search_markets",
  "get_market_snapshot",
  "get_orderbook",
  "get_price_history",
  "get_recent_trades",
  "get_open_orders",
  "get_positions",
  "get_rewards_status",
  "get_live_alerts",
  "preview_limit_order",
  "preview_marketable_order",
  "submit_previewed_order",
  "cancel_orders",
  "cancel_market_orders",
  "cancel_all_orders"
];

function makeTransport() {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["./node_modules/tsx/dist/cli.mjs", "./servers/polymarket-mcp/src/server.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: {
      ...process.env,
      POLYMARKET_ENABLE_TRADING: "false",
      POLYMARKET_REQUIRE_PREVIEW: "true",
      POLYMARKET_REQUIRE_GEOBLOCK_CHECK: "true"
    }
  });
}

function resultSummary(result) {
  if (result?.isError) {
    return {
      kind: "error",
      message: Array.isArray(result.content)
        ? result.content.filter((item) => item?.type === "text").map((item) => item.text).join("\n")
        : "Tool returned isError=true"
    };
  }

  const structured = result?.structuredContent;
  if (!structured || typeof structured !== "object") {
    return { kind: "text_only" };
  }

  if (Array.isArray(structured)) {
    return { kind: "array", count: structured.length };
  }

  if (typeof structured.preview === "object" && structured.preview) {
    return {
      kind: "preview",
      canSubmit: structured.preview.canSubmit,
      warningCount: Array.isArray(structured.preview.warnings) ? structured.preview.warnings.length : undefined,
      previewId: structured.preview.previewId
    };
  }

  if (Array.isArray(structured.trades)) {
    return { kind: "trades", count: structured.trades.length, conditionId: structured.conditionId };
  }

  if (Array.isArray(structured.history)) {
    return { kind: "history", count: structured.history.length, tokenId: structured.tokenId };
  }

  if (Array.isArray(structured.alerts)) {
    return { kind: "alerts", count: structured.alerts.length };
  }

  if (Array.isArray(structured.orders)) {
    return { kind: "orders", count: structured.orders.length };
  }

  if (Array.isArray(structured.current)) {
    return { kind: "positions", current: structured.current.length, closed: Array.isArray(structured.closed) ? structured.closed.length : 0 };
  }

  if (Array.isArray(structured.tools)) {
    return { kind: "tools", count: structured.tools.length };
  }

  if (typeof structured === "object") {
    return {
      kind: "object",
      keys: Object.keys(structured).slice(0, 8)
    };
  }

  return { kind: typeof structured };
}

async function callTool(client, name, args, options = {}) {
  const startedAt = Date.now();
  try {
    const result = await client.callTool({
      name,
      arguments: args
    });
    if (result?.isError) {
      const message = Array.isArray(result.content)
        ? result.content.filter((item) => item?.type === "text").map((item) => item.text).join("\n")
        : "Tool returned isError=true";
      const accepted =
        options.expectErrorContains &&
        options.expectErrorContains.some((needle) => message.includes(needle));
      return {
        name,
        ok: Boolean(accepted),
        elapsedMs: Date.now() - startedAt,
        summary: resultSummary(result),
        result,
        error: message,
        expected: options.expected ?? "error",
        expectedMatched: Boolean(accepted)
      };
    }
    return {
      name,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      summary: resultSummary(result),
      result,
      expected: options.expected ?? "success"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const accepted =
      options.expectErrorContains &&
      options.expectErrorContains.some((needle) => message.includes(needle));
    return {
      name,
      ok: Boolean(accepted),
      elapsedMs: Date.now() - startedAt,
      summary: { kind: "error", message },
      error: message,
      expected: options.expected ?? "error",
      expectedMatched: Boolean(accepted)
    };
  }
}

async function main() {
  const client = new Client({
    name: "codex-functional-mcp-check",
    version: "0.1.0"
  });

  const transport = makeTransport();
  if (transport.stderr) {
    transport.stderr.on("data", () => {
      // Keep stderr drained without polluting stdout.
    });
  }

  const report = {
    environment: {
      cwd: process.cwd(),
      node: process.version
    },
    toolInventory: null,
    marketSeed: null,
    results: []
  };

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    report.toolInventory = {
      count: toolNames.length,
      missing: TOOL_NAMES.filter((name) => !toolNames.includes(name)),
      extra: toolNames.filter((name) => !TOOL_NAMES.includes(name)),
      names: toolNames
    };

    const search = await callTool(client, "search_markets", {
      query: "president",
      limit: 5,
      active_only: true,
      include_closed: false,
      sort_by: "liquidity"
    });
    report.results.push(search);

    if (!search.ok) {
      throw new Error(`search_markets failed: ${search.error}`);
    }

    const markets = search.result.structuredContent?.markets;
    if (!Array.isArray(markets) || markets.length === 0) {
      throw new Error("search_markets returned no active markets for the test query.");
    }

    const seedMarket = markets.find((market) => market?.slug) ?? markets[0];
    report.marketSeed = {
      slug: seedMarket.slug,
      conditionId: seedMarket.conditionId,
      title: seedMarket.title
    };

    const snapshot = await callTool(client, "get_market_snapshot", {
      identifier_type: "slug",
      identifier: seedMarket.slug,
      include_related_markets: true,
      include_comments: true,
      include_orderbook_summary: true
    });
    report.results.push(snapshot);
    if (!snapshot.ok) {
      throw new Error(`get_market_snapshot failed: ${snapshot.error}`);
    }

    const marketSnapshot = snapshot.result.structuredContent;
    const tokenId = marketSnapshot?.yesTokenId
      ?? marketSnapshot?.tokenIds?.[0];
    const marketSlug = marketSnapshot?.slug ?? seedMarket.slug;
    const conditionId = marketSnapshot?.conditionId ?? seedMarket.conditionId;
    const midpoint = marketSnapshot?.midpoint
      ?? marketSnapshot?.price
      ?? 0.5;
    const bestBid = marketSnapshot?.bestBid;

    if (!tokenId) {
      throw new Error("Could not derive a token_id from get_market_snapshot.");
    }

    report.results.push(
      await callTool(client, "get_orderbook", { token_id: tokenId, depth: 20 }),
      await callTool(client, "get_price_history", { token_id: tokenId, interval: "1h", limit: 24 }),
      await callTool(client, "get_recent_trades", { scope_type: "token_id", scope_id: tokenId, limit: 20 }),
      await callTool(client, "get_rewards_status", { market: marketSlug }),
      await callTool(client, "get_live_alerts", { scope: "all", limit: 10 }),
      await callTool(client, "get_positions", {
        owner_address: "0x000000000000000000000000000000000000dEaD",
        include_closed: true,
        limit: 10
      })
    );

    const previewLimit = await callTool(client, "preview_limit_order", {
      token_id: tokenId,
      side: "BUY",
      price: Number(bestBid ?? midpoint ?? 0.5),
      size: 5,
      order_type: "GTC",
      post_only: true
    });
    report.results.push(previewLimit);

    const previewMarketable = await callTool(client, "preview_marketable_order", {
      token_id: tokenId,
      side: "BUY",
      order_type: "FAK",
      budget_usdc: 5,
      max_slippage_bps: 200
    });
    report.results.push(previewMarketable);

    const previewId = previewLimit?.result?.structuredContent?.preview?.previewId
      ?? previewMarketable?.result?.structuredContent?.preview?.previewId;
    if (previewId) {
      report.results.push(
        await callTool(
          client,
          "submit_previewed_order",
          { preview_id: previewId },
          {
            expected: "guarded_error",
            expectErrorContains: [
              "not currently submit-safe",
              "Trading is disabled"
            ]
          }
        )
      );
    }

    report.results.push(
      await callTool(
        client,
        "get_open_orders",
        { limit: 5 },
        {
          expected: "auth_error",
          expectErrorContains: ["Authenticated CLOB credentials are required"]
        }
      ),
      await callTool(
        client,
        "cancel_orders",
        { order_ids: ["test-order-id"] },
        {
          expected: "auth_error",
          expectErrorContains: ["Authenticated CLOB credentials are required"]
        }
      ),
      await callTool(
        client,
        "cancel_market_orders",
        { market: conditionId ?? marketSlug },
        {
          expected: "auth_error",
          expectErrorContains: ["Authenticated CLOB credentials are required"]
        }
      ),
      await callTool(
        client,
        "cancel_all_orders",
        { acknowledge_all_markets: true, note: "functional test" },
        {
          expected: "auth_error",
          expectErrorContains: ["Authenticated CLOB credentials are required"]
        }
      )
    );
  } finally {
    await transport.close().catch(() => {});
  }

  const failed = report.results.filter((entry) => !entry.ok);
  report.summary = {
    total: report.results.length,
    passed: report.results.length - failed.length,
    failed: failed.length,
    failedTools: failed.map((entry) => ({
      name: entry.name,
      error: entry.error ?? entry.summary?.message
    }))
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
