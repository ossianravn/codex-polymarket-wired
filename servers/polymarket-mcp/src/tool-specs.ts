export interface ToolSpec {
  name: string;
  description: string;
  access: "read" | "write";
  inputSchema: Record<string, unknown>;
}

export const TOOLS: ToolSpec[] = [
  {
    name: "search_markets",
    access: "read",
    description:
      "Search Polymarket markets and events. Use for discovery, initial lookup, and watchlist expansion.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        active_only: { type: "boolean", default: true },
        include_closed: { type: "boolean", default: false },
        min_liquidity_usdc: { type: "number", minimum: 0 },
        sort_by: {
          type: "string",
          enum: ["relevance", "volume", "liquidity", "newest", "ending_soon"],
          default: "relevance"
        },
        tag_filters: {
          type: "array",
          items: { type: "string" },
          maxItems: 10
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_market_snapshot",
    access: "read",
    description:
      "Return a normalized market snapshot including identifiers, pricing, liquidity, tick size, neg-risk flag, resolution text, comments summary, and optional related markets.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        identifier_type: {
          type: "string",
          enum: ["slug", "condition_id", "token_id", "market_id"]
        },
        identifier: { type: "string", minLength: 1 },
        include_related_markets: { type: "boolean", default: true },
        include_comments: { type: "boolean", default: true },
        include_orderbook_summary: { type: "boolean", default: true }
      },
      required: ["identifier_type", "identifier"]
    }
  },
  {
    name: "get_orderbook",
    access: "read",
    description:
      "Fetch a live orderbook snapshot for a token. Use before aggressive execution or passive quote placement.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        token_id: { type: "string", minLength: 1 },
        depth: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      required: ["token_id"]
    }
  },
  {
    name: "get_price_history",
    access: "read",
    description:
      "Fetch historical prices for a token. Use for trend checks, volatility notes, and catalyst windows.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        token_id: { type: "string", minLength: 1 },
        interval: {
          type: "string",
          enum: ["1m", "5m", "15m", "1h", "6h", "1d"]
        },
        start: { type: "string", format: "date-time" },
        end: { type: "string", format: "date-time" },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 }
      },
      required: ["token_id", "interval"]
    }
  },
  {
    name: "get_recent_trades",
    access: "read",
    description:
      "Fetch recent trades for a market or token. Use to inspect flow, execution prices, and trade status.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope_type: {
          type: "string",
          enum: ["condition_id", "token_id", "market_id"]
        },
        scope_id: { type: "string", minLength: 1 },
        side: { type: "string", enum: ["BUY", "SELL"] },
        status: {
          type: "array",
          items: {
            type: "string",
            enum: ["MATCHED", "MINED", "CONFIRMED", "RETRYING", "FAILED"]
          },
          maxItems: 5
        },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      required: ["scope_type", "scope_id"]
    }
  },
  {
    name: "get_open_orders",
    access: "read",
    description:
      "Return open orders for the authenticated user, optionally filtered by market or token.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        market: { type: "string" },
        asset_id: { type: "string" },
        side: { type: "string", enum: ["BUY", "SELL"] },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 }
      }
    }
  },
  {
    name: "get_positions",
    access: "read",
    description:
      "Return user positions, optionally filtered by market. Use for exposure and portfolio review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner_address: { type: "string" },
        market: { type: "string" },
        include_closed: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 }
      }
    }
  },
  {
    name: "get_rewards_status",
    access: "read",
    description:
      "Return maker-reward or scoring context for a market or a batch of order IDs.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        market: { type: "string" },
        order_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 50
        }
      }
    }
  },
  {
    name: "get_live_alerts",
    access: "read",
    description:
      "Return cached alerts from the watcher daemon. Use for automation summaries and rapid triage.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: "string", enum: ["watchlist", "portfolio", "all"], default: "all" },
        since: { type: "string", format: "date-time" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      }
    }
  },
  {
    name: "preview_limit_order",
    access: "write",
    description:
      "Preview a resting limit order. Validates tick size, order type, neg-risk, risk limits, balances, and policy gates without placing the order.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        token_id: { type: "string", minLength: 1 },
        side: { type: "string", enum: ["BUY", "SELL"] },
        price: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        size: { type: "number", exclusiveMinimum: 0 },
        order_type: { type: "string", enum: ["GTC", "GTD"], default: "GTC" },
        expiration: { type: "string", format: "date-time" },
        post_only: { type: "boolean", default: false },
        client_order_id: { type: "string", maxLength: 128 }
      },
      required: ["token_id", "side", "price", "size"]
    }
  },
  {
    name: "preview_marketable_order",
    access: "write",
    description:
      "Preview an immediate marketable order. For BUY specify budget_usdc; for SELL specify shares. Applies slippage guards and policy checks without sending the order.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        token_id: { type: "string", minLength: 1 },
        side: { type: "string", enum: ["BUY", "SELL"] },
        order_type: { type: "string", enum: ["FOK", "FAK"], default: "FAK" },
        budget_usdc: { type: "number", exclusiveMinimum: 0 },
        shares: { type: "number", exclusiveMinimum: 0 },
        worst_price: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        max_slippage_bps: { type: "integer", minimum: 1, maximum: 5000, default: 200 },
        client_order_id: { type: "string", maxLength: 128 }
      },
      required: ["token_id", "side"]
    }
  },
  {
    name: "submit_previewed_order",
    access: "write",
    description:
      "Submit a previously previewed order. Intended as the only live-placement tool in this scaffold.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        preview_id: { type: "string", minLength: 1 },
        expected_policy_hash: { type: "string" },
        note: { type: "string", maxLength: 500 }
      },
      required: ["preview_id"]
    }
  },
  {
    name: "cancel_orders",
    access: "write",
    description:
      "Cancel a batch of specific order IDs for the authenticated user.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        order_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 100
        }
      },
      required: ["order_ids"]
    }
  },
  {
    name: "cancel_market_orders",
    access: "write",
    description:
      "Cancel all open orders for a market, optionally filtered to a single token.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        market: { type: "string" },
        asset_id: { type: "string" }
      }
    }
  },
  {
    name: "cancel_all_orders",
    access: "write",
    description:
      "Cancel every open order for the authenticated user. Use only for explicit kill-switch or cleanup actions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        acknowledge_all_markets: { type: "boolean", const: true },
        note: { type: "string", maxLength: 200 }
      },
      required: ["acknowledge_all_markets"]
    }
  }
];
