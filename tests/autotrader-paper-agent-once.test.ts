import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentCommand,
  buildDaemonArgs,
  buildDaemonEnv,
  parsePaperAgentOnceArgs
} from "../scripts/autotrader-paper-agent-once.js";

test("paper agent once defaults to dry hold and fail-closed live execution", () => {
  const options = parsePaperAgentOnceArgs([
    "--session-id",
    "session-1",
    "--budget",
    "30",
    "--timeframe-hours",
    "24",
    "--risk-profile",
    "aggressive",
    "--fast",
    "--force"
  ]);

  assert.equal(options.provider, "dry_hold");
  assert.equal(options.fast, true);
  assert.equal(options.force, true);

  const env = buildDaemonEnv(options);
  assert.equal(env.AUTOTRADER_SESSION_ID, "session-1");
  assert.equal(env.AUTOTRADER_MODE, "paper");
  assert.equal(env.AUTOTRADER_BUDGET_USDC, "30");
  assert.equal(env.AUTOTRADER_TIMEFRAME_HOURS, "24");
  assert.equal(env.AUTOTRADER_RISK_PROFILE, "aggressive");
  assert.equal(env.POLYMARKET_ENABLE_TRADING, "false");
  assert.match(env.AUTOTRADER_AGENT_COMMAND ?? "", /autotrader-agent-command\.ts/);
  assert.match(env.AUTOTRADER_AGENT_COMMAND ?? "", /--provider=dry_hold/);

  const args = buildDaemonArgs(options);
  assert.ok(args.includes("--agent-loop"));
  assert.ok(args.includes("--force"));
  assert.ok(args.includes("--no-auto-refresh-universe"));
  assert.ok(args.includes("--no-refresh-snapshots"));
  assert.ok(args.includes("--no-auto-forecast"));
});

test("paper agent once supports OpenAI provider command configuration", () => {
  const options = parsePaperAgentOnceArgs([
    "--session-id=session-2",
    "--provider=openai",
    "--model=gpt-5.2",
    "--api-base-url=http://127.0.0.1:9999/responses",
    "--candidate-limit=8"
  ]);

  assert.equal(options.provider, "openai");
  assert.equal(options.model, "gpt-5.2");
  assert.equal(options.candidateLimit, "8");

  const command = buildAgentCommand(options);
  assert.match(command, /--provider=openai/);
  assert.match(command, /--model=gpt-5\.2/);
  assert.match(command, /--api-base-url=http:\/\/127\.0\.0\.1:9999\/responses/);

  const args = buildDaemonArgs(options);
  assert.ok(!args.includes("--no-refresh-snapshots"));
  assert.deepEqual(args.slice(0, 4), ["--import", "tsx", ".\\scripts\\autotrader-daemon.ts", "--once"]);
  assert.equal(args[args.indexOf("--agent-candidate-limit")], undefined);
  assert.ok(args.includes("--agent-candidate-limit=8"));
});

test("paper agent once requires an explicit session id", () => {
  const original = process.env.AUTOTRADER_SESSION_ID;
  delete process.env.AUTOTRADER_SESSION_ID;
  try {
    const options = parsePaperAgentOnceArgs([]);
    assert.throws(() => buildDaemonEnv(options), /session/i);
  } finally {
    if (original === undefined) {
      delete process.env.AUTOTRADER_SESSION_ID;
    } else {
      process.env.AUTOTRADER_SESSION_ID = original;
    }
  }
});
