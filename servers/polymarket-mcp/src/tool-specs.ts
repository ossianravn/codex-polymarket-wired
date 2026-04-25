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
    name: "get_bookmarked_markets",
    access: "read",
    description:
      "Return the authenticated user's Polymarket website bookmarked markets using the rewards favorites feed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        page_size: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        next_cursor: { type: "string" }
      }
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
    name: "get_state_summary",
    access: "read",
    description:
      "Return a compact summary of the local SQLite state store, including counts and recent alerts, research runs, classifications, and previews.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 }
      }
    }
  },
  {
    name: "get_market_state",
    access: "read",
    description:
      "Return the stored state for a single market, including recent snapshots, alerts, developments, research runs, classifications, thesis links, portfolio positions, and previews.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        identifier_type: {
          type: "string",
          enum: ["slug", "condition_id", "token_id", "market_id"]
        },
        identifier: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
      },
      required: ["identifier_type", "identifier"]
    }
  },
  {
    name: "get_portfolio_risk_summary",
    access: "read",
    description:
      "Return persisted portfolio exposure, active-order notional, and thesis-level aggregation from the local SQLite state store.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      }
    }
  },
  {
    name: "get_strategy_candidates",
    access: "read",
    description:
      "Return ranked strategy candidates derived only from persisted SQLite state, including latest classifications, research runs, snapshots, and orders.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        interest_tiers: {
          type: "array",
          items: { type: "string", enum: ["A", "B", "C", "AVOID"] },
          maxItems: 4
        },
        include_waiting: { type: "boolean", default: false },
        include_blocked: { type: "boolean", default: false }
      }
    }
  },
  {
    name: "get_execution_queue",
    access: "read",
    description:
      "Return the deterministic execution queue derived from persisted SQLite state. Use to see which markets need research refresh, strategy work, preview generation, monitoring, or stale-order cleanup.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        include_waiting: { type: "boolean", default: false }
      }
    }
  },
  {
    name: "start_auto_trading_session",
    access: "write",
    description:
      "Create an autonomous trading mandate from budget, timeframe, and risk profile, then persist the first paper decision iteration. This plans paper entries/exits only; it does not submit live orders.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: 120 },
        budget_usdc: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
        timeframe_hours: { type: "number", exclusiveMinimum: 0, maximum: 720 },
        risk_profile: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
        mode: { type: "string", enum: ["paper", "live_guarded", "live_autonomous"], default: "paper" },
        max_single_order_usdc: { type: "number", exclusiveMinimum: 0 },
        max_open_positions: { type: "integer", minimum: 1, maximum: 50 },
        max_market_horizon_hours: { type: "number", exclusiveMinimum: 0 },
        min_liquidity_usdc: { type: "number", minimum: 0 },
        max_spread_cents: { type: "number", exclusiveMinimum: 0 },
        stop_loss_usdc: { type: "number", minimum: 0 },
        take_profit_pct: { type: "number", exclusiveMinimum: 0 },
        position_stop_loss_pct: { type: "number", exclusiveMinimum: 0 },
        time_exit_hours: { type: "number", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        compact: { type: "boolean", default: true, description: "Return compact agent-facing decisions without raw market payloads." }
      },
      required: ["budget_usdc", "timeframe_hours", "risk_profile"]
    }
  },
  {
    name: "run_auto_trading_iteration",
    access: "write",
    description:
      "Run another paper planning iteration for an existing autonomous trading session and persist entry/exit decisions plus next-check schedule.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        session_id: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        compact: { type: "boolean", default: true, description: "Return compact agent-facing decisions without raw market payloads." }
      },
      required: ["session_id"]
    }
  },
  {
    name: "get_auto_trading_session",
    access: "read",
    description:
      "Return an autonomous trading session mandate, paper ledger summary, and latest persisted paper decisions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        session_id: { type: "string", minLength: 1 },
        decision_limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        compact: { type: "boolean", default: true, description: "Return compact decisions without raw market payloads." }
      },
      required: ["session_id"]
    }
  },
  {
    name: "ingest_market_universe",
    access: "read",
    description:
      "Pull the active Polymarket market universe from Gamma keyset endpoints, compute deterministic facets and scores, selectively enrich top candidates with CLOB microstructure, and persist the run in SQLite. Read-only: does not place or preview trades.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        active_only: { type: "boolean", default: true },
        include_closed: { type: "boolean", default: false },
        source: { type: "string", enum: ["markets_keyset", "events_keyset", "both"], default: "markets_keyset" },
        page_size: { type: "integer", minimum: 1, maximum: 1000, default: 1000 },
        limit_pages: { type: "integer", minimum: 1, maximum: 1000 },
        min_liquidity_usdc: { type: "number", minimum: 0 },
        include_tags: { type: "boolean", default: true },
        order: { type: "string", maxLength: 120, default: "volume_num,liquidity_num" },
        ascending: { type: "boolean", default: false },
        enrich_top_n: { type: "integer", minimum: 0, maximum: 1000, default: 250 },
        enrichment_profile: {
          type: "string",
          enum: ["none", "microstructure", "microstructure_and_history"],
          default: "microstructure"
        }
      }
    }
  },
  {
    name: "list_market_universe",
    access: "read",
    description:
      "List markets from a persisted universe run using facets, thresholds, views, and sort modes. Use after ingest_market_universe for sortable bet discovery.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        run_id: { type: "string" },
        view: {
          type: "string",
          enum: [
            "best_research_candidates",
            "clean_catalyst_bets",
            "execution_ready",
            "market_making_candidates",
            "cross_market_dislocations",
            "resolution_watch",
            "low_attention_modelable",
            "avoid_or_blocked"
          ]
        },
        category_groups: { type: "array", items: { type: "string" }, maxItems: 10 },
        structural_types: { type: "array", items: { type: "string" }, maxItems: 10 },
        horizon_buckets: { type: "array", items: { type: "string" }, maxItems: 10 },
        price_buckets: { type: "array", items: { type: "string" }, maxItems: 10 },
        opportunity_modes: { type: "array", items: { type: "string" }, maxItems: 10 },
        min_liquidity_usdc: { type: "number", minimum: 0 },
        min_volume_24h_usdc: { type: "number", minimum: 0 },
        max_spread_cents: { type: "number", minimum: 0 },
        min_tradability_score: { type: "number", minimum: 0, maximum: 100 },
        min_research_priority_score: { type: "number", minimum: 0, maximum: 100 },
        max_resolution_ambiguity_score: { type: "number", minimum: 0, maximum: 100 },
        include_tags: { type: "array", items: { type: "string" }, maxItems: 20 },
        exclude_tags: { type: "array", items: { type: "string" }, maxItems: 20 },
        search: { type: "string", maxLength: 200 },
        sort: {
          type: "string",
          enum: [
            "research_priority_desc",
            "trade_opportunity_desc",
            "maker_score_desc",
            "liquidity_desc",
            "volume_24h_desc",
            "ending_soon",
            "attention_gap_desc",
            "spread_asc",
            "risk_desc"
          ],
          default: "research_priority_desc"
        },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 }
      }
    }
  },
  {
    name: "get_universe_facets",
    access: "read",
    description:
      "Return counts and available facet values for the latest or specified market universe run.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        run_id: { type: "string" }
      }
    }
  },
  {
    name: "get_universe_event_clusters",
    access: "read",
    description:
      "Find multi-market event clusters in a persisted universe run, especially many-participant events with tradeable outsider/longshot markets that can re-rate sharply on outperformance.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        run_id: { type: "string" },
        profile: {
          type: "string",
          enum: ["outsider-convexity", "large-event"],
          default: "outsider-convexity"
        },
        category_groups: { type: "array", items: { type: "string" }, maxItems: 10 },
        search: { type: "string", maxLength: 200 },
        min_market_count: { type: "integer", minimum: 2, maximum: 500 },
        min_outsider_count: { type: "integer", minimum: 0, maximum: 200 },
        min_cluster_liquidity_usdc: { type: "number", minimum: 0 },
        min_outsider_liquidity_usdc: { type: "number", minimum: 0 },
        min_outsider_price: { type: "number", minimum: 0, maximum: 0.5 },
        max_outsider_price: { type: "number", minimum: 0.01, maximum: 0.5 },
        max_outsider_spread_cents: { type: "number", minimum: 0, maximum: 100 },
        sort: {
          type: "string",
          enum: ["outsider_convexity_desc", "market_count_desc", "liquidity_desc"],
          default: "outsider_convexity_desc"
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        markets_per_cluster: { type: "integer", minimum: 1, maximum: 50, default: 8 }
      }
    }
  },
  {
    name: "get_bet_candidates",
    access: "read",
    description:
      "Return preset bet candidate lists such as clean short-term markets, liquid politics, macro catalysts, market-making candidates, longshot research, resolution watch, or cross-market checks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        profile: {
          type: "string",
          enum: [
            "clean-short-term",
            "liquid-politics",
            "macro-catalyst",
            "market-making",
            "longshot-research",
            "resolution-watch",
            "cross-market"
          ]
        },
        run_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        ensure_fresh: { type: "boolean", default: false },
        max_age_minutes: { type: "integer", minimum: 1, maximum: 10080, default: 1440 }
      },
      required: ["profile"]
    }
  },
  {
    name: "enrich_universe_markets",
    access: "read",
    description:
      "Selectively refresh CLOB microstructure for specific persisted universe markets or the top N of a view. Read-only enrichment; does not place or preview trades.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        run_id: { type: "string" },
        market_keys: { type: "array", items: { type: "string" }, maxItems: 100 },
        view: { type: "string" },
        top_n: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        enrichment_profile: {
          type: "string",
          enum: ["microstructure", "microstructure_and_history"],
          default: "microstructure"
        }
      }
    }
  },
  {
    name: "promote_universe_markets_to_watchlist",
    access: "write",
    description:
      "Add selected universe markets to configs/watchlists.yaml as a managed watchlist group. Does not place or preview trades. Use only after explicit user instruction.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        run_id: { type: "string" },
        market_keys: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        watchlist_name: { type: "string", minLength: 1, maxLength: 120 },
        replace_existing_group: { type: "boolean", default: false },
        move_threshold_pct_points: { type: "number", minimum: 0, default: 3 },
        spread_threshold_cents: { type: "number", minimum: 0, default: 5 },
        include_related_markets: { type: "boolean", default: true },
        include_comments: { type: "boolean", default: true },
        scope: { type: "string", enum: ["watchlist", "portfolio", "all"], default: "watchlist" }
      },
      required: ["market_keys", "watchlist_name"]
    }
  },
  {
    name: "record_development",
    access: "write",
    description:
      "Persist a structured development or catalyst note for a market in the local SQLite state store.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        identifier_type: {
          type: "string",
          enum: ["slug", "condition_id", "token_id", "market_id"]
        },
        identifier: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1, maxLength: 300 },
        summary: { type: "string", minLength: 1, maxLength: 4000 },
        source: { type: "string", minLength: 1, maxLength: 200 },
        url: { type: "string", format: "uri" },
        impact: {
          type: "string",
          enum: ["bullish", "bearish", "neutral", "unclear"],
          default: "unclear"
        },
        importance: { type: "integer", minimum: 0, maximum: 100, default: 50 },
        event_time: { type: "string", format: "date-time" },
        discovered_at: { type: "string", format: "date-time" },
        tags: {
          type: "array",
          items: { type: "string" },
          maxItems: 20
        },
        notes: { type: "string", maxLength: 2000 },
        payload: { type: "object", additionalProperties: true }
      },
      required: ["identifier_type", "identifier", "title", "summary", "source"]
    }
  },
  {
    name: "record_thesis_link",
    access: "write",
    description:
      "Persist a thesis / correlation-cluster link for a market so the strategy and executor layers can aggregate correlated exposure.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        identifier_type: {
          type: "string",
          enum: ["slug", "condition_id", "token_id", "market_id"]
        },
        identifier: { type: "string", minLength: 1 },
        thesis_key: { type: "string", minLength: 1, maxLength: 200 },
        thesis_title: { type: "string", minLength: 1, maxLength: 300 },
        confidence: { type: "number", minimum: 0, maximum: 100 },
        is_primary: { type: "boolean", default: true },
        created_at: { type: "string", format: "date-time" },
        metadata: { type: "object", additionalProperties: true }
      },
      required: ["identifier_type", "identifier", "thesis_key"]
    }
  },
  {
    name: "record_research_synthesis",
    access: "write",
    description:
      "Persist a completed research synthesis, fair-value range, and evidence map for a market in the local SQLite state store.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        identifier_type: {
          type: "string",
          enum: ["slug", "condition_id", "token_id", "market_id"]
        },
        identifier: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1, maxLength: 300 },
        question: { type: "string", minLength: 1, maxLength: 1000 },
        thesis: { type: "string", minLength: 1, maxLength: 8000 },
        supports_yes: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: { type: "string", minLength: 1, maxLength: 200 },
              title: { type: "string", minLength: 1, maxLength: 300 },
              url: { type: "string", format: "uri" },
              summary: { type: "string", minLength: 1, maxLength: 4000 },
              stance: { type: "string", minLength: 1, maxLength: 80 },
              confidence: { type: "string", minLength: 1, maxLength: 40 }
            },
            required: ["source", "title", "summary", "stance", "confidence"]
          }
        },
        supports_no: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: { type: "string", minLength: 1, maxLength: 200 },
              title: { type: "string", minLength: 1, maxLength: 300 },
              url: { type: "string", format: "uri" },
              summary: { type: "string", minLength: 1, maxLength: 4000 },
              stance: { type: "string", minLength: 1, maxLength: 80 },
              confidence: { type: "string", minLength: 1, maxLength: 40 }
            },
            required: ["source", "title", "summary", "stance", "confidence"]
          }
        },
        open_questions: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 500 },
          maxItems: 50
        },
        fair_value_low: { type: "number" },
        fair_value_base: { type: "number" },
        fair_value_high: { type: "number" },
        providers: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 120 },
          maxItems: 20
        },
        notes: { type: "string", maxLength: 4000 },
        skill_version: { type: "string", maxLength: 120 },
        policy_version: { type: "string", maxLength: 120 },
        model_id: { type: "string", maxLength: 120 },
        prompt_hash: { type: "string", maxLength: 256 },
        automation_name: { type: "string", maxLength: 200 },
        thesis_key: { type: "string", minLength: 1, maxLength: 200 },
        thesis_title: { type: "string", minLength: 1, maxLength: 300 },
        thesis_confidence: { type: "number", minimum: 0, maximum: 100 },
        created_at: { type: "string", format: "date-time" },
        completed_at: { type: "string", format: "date-time" },
        synthesis: { type: "object", additionalProperties: true }
      },
      required: ["identifier_type", "identifier", "title", "question", "thesis"]
    }
  },
  {
    name: "record_classification",
    access: "write",
    description:
      "Persist a structured opportunity-classifier result and decision payload for a market in the local SQLite state store.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        identifier_type: {
          type: "string",
          enum: ["slug", "condition_id", "token_id", "market_id"]
        },
        identifier: { type: "string", minLength: 1 },
        structural_type: { type: "string", maxLength: 120 },
        category: { type: "string", maxLength: 120 },
        horizon_bucket: { type: "string", maxLength: 80 },
        pricing_status: { type: "string", maxLength: 80 },
        modelability_score: { type: "number", minimum: 0, maximum: 100 },
        tradability_score: { type: "number", minimum: 0, maximum: 100 },
        resolution_ambiguity_score: { type: "number", minimum: 0, maximum: 100 },
        attention_gap_score: { type: "number", minimum: 0, maximum: 100 },
        cross_market_consistency_score: { type: "number", minimum: 0, maximum: 100 },
        research_priority_score: { type: "number", minimum: 0, maximum: 100 },
        trade_opportunity_score: { type: "number", minimum: 0, maximum: 100 },
        confidence_score: { type: "number", minimum: 0, maximum: 100 },
        interest_tier: { type: "string", maxLength: 40 },
        reason_codes: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 120 },
          maxItems: 50
        },
        disqualifiers: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 120 },
          maxItems: 50
        },
        thesis_key: { type: "string", minLength: 1, maxLength: 200 },
        thesis_title: { type: "string", minLength: 1, maxLength: 300 },
        thesis_confidence: { type: "number", minimum: 0, maximum: 100 },
        decision: { type: "object", additionalProperties: true },
        created_at: { type: "string", format: "date-time" }
      },
      required: ["identifier_type", "identifier", "decision"]
    }
  },
  {
    name: "sync_bookmarked_markets_to_watchlist",
    access: "write",
    description:
      "Sync the authenticated user's bookmarked markets into configs/watchlists.yaml as a managed watchlist group.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        watchlist_name: { type: "string", minLength: 1, maxLength: 120, default: "bookmarks" },
        replace_existing_group: { type: "boolean", default: true },
        page_size: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        next_cursor: { type: "string" },
        move_threshold_pct_points: { type: "number", minimum: 0, default: 3 },
        spread_threshold_cents: { type: "number", minimum: 0, default: 5 },
        include_related_markets: { type: "boolean", default: true },
        include_comments: { type: "boolean", default: true },
        scope: { type: "string", enum: ["watchlist", "portfolio", "all"], default: "watchlist" }
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
