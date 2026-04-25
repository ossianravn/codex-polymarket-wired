import test from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION,
  LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION_BLOCKER,
  liveAutonomousSubmitBlockers
} from "../servers/polymarket-mcp/src/autotrader-live-boundary.js";
import { TOOLS } from "../servers/polymarket-mcp/src/tool-specs.js";

type ToolInputProperties = {
  auto_submit: { default: boolean };
  live_autonomous_submit_confirmation: { type: string };
  refresh_snapshots: { default: boolean };
  refresh_snapshot_limit: { default: number };
};

function toolInputProperties(name: string): ToolInputProperties {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  assert.ok(tool, `expected ${name} tool spec to exist`);
  return tool.inputSchema.properties as ToolInputProperties;
}

test("live-autonomous submission requires explicit confirmation in addition to auto_submit", () => {
  assert.deepEqual(liveAutonomousSubmitBlockers({
    mode: "live_autonomous",
    autoSubmit: false
  }), []);

  assert.deepEqual(liveAutonomousSubmitBlockers({
    mode: "live_autonomous",
    autoSubmit: true
  }), [LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION_BLOCKER]);

  assert.deepEqual(liveAutonomousSubmitBlockers({
    mode: "live_autonomous",
    autoSubmit: true,
    confirmation: LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION
  }), []);
});

test("non-autonomous modes never use live-autonomous submit confirmation", () => {
  assert.deepEqual(liveAutonomousSubmitBlockers({
    mode: "paper",
    autoSubmit: true
  }), []);
  assert.deepEqual(liveAutonomousSubmitBlockers({
    mode: "live_guarded",
    autoSubmit: true
  }), []);
});

test("auto-trading execution tools are preview-only by default", () => {
  const executeProperties = toolInputProperties("execute_auto_trading_decision");
  const executorProperties = toolInputProperties("run_auto_trading_executor");

  assert.equal(executeProperties.auto_submit.default, false);
  assert.equal(executeProperties.live_autonomous_submit_confirmation.type, "string");
  assert.equal(executorProperties.auto_submit.default, false);
  assert.equal(executorProperties.live_autonomous_submit_confirmation.type, "string");
});

test("auto-trading planning tools refresh snapshots by default", () => {
  const startProperties = toolInputProperties("start_auto_trading_session");
  const iterationProperties = toolInputProperties("run_auto_trading_iteration");

  assert.equal(startProperties.refresh_snapshots.default, true);
  assert.equal(startProperties.refresh_snapshot_limit.default, 50);
  assert.equal(iterationProperties.refresh_snapshots.default, true);
  assert.equal(iterationProperties.refresh_snapshot_limit.default, 50);
});
