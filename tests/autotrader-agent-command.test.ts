import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import http from "node:http";

async function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-agent-command-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runAgentCommand(args: string[], env: Record<string, string | undefined>, cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ["--import", "tsx", path.join(cwd, "scripts", "autotrader-agent-command.ts"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      POLYMARKET_ENABLE_TRADING: "false"
    }
  });
}

async function runAgentCommandAsync(args: string[], env: Record<string, string | undefined>, cwd: string): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawn(process.execPath, ["--import", "tsx", path.join(cwd, "scripts", "autotrader-agent-command.ts"), ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
      POLYMARKET_ENABLE_TRADING: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { status, stdout, stderr };
}

function briefFixture(): Record<string, unknown> {
  return {
    kind: "polymarket_autotrader_agent_brief_v1",
    generatedAt: "2026-04-25T12:00:00.000Z",
    session: {
      sessionId: "agent-command-session",
      status: "active",
      mode: "paper",
      riskProfile: "aggressive",
      budgetUsdc: 30,
      timeframeHours: 24,
      startedAt: "2026-04-25T12:00:00.000Z",
      endsAt: "2026-04-26T12:00:00.000Z"
    },
    candidates: [{
      decisionRef: "candidate-01",
      marketKey: "condition:agent-command",
      title: "Agent command market",
      currentSystemAction: "paper_buy_yes",
      status: "proposed",
      score: 90,
      targetPrice: 0.4,
      maxSpendUsdc: 5,
      tokenId: "agent-command-yes",
      blockers: [],
      reasonCodes: ["fixture"],
      market: {
        bestAsk: 0.4,
        bestBid: 0.39,
        outcomes: ["Yes", "No"],
        disqualifiers: []
      }
    }]
  };
}

test("agent command dry_hold writes a valid hold plan", async () => {
  await withTempDir(async (dir) => {
    const cwd = process.cwd();
    const briefPath = path.join(dir, "brief.json");
    const promptPath = path.join(dir, "prompt.md");
    const planPath = path.join(dir, "plan.json");
    await writeFile(briefPath, `${JSON.stringify(briefFixture(), null, 2)}\n`, "utf8");
    await writeFile(promptPath, "Return a decision plan.", "utf8");

    const child = runAgentCommand([
      "--provider=dry_hold",
      `--brief=${briefPath}`,
      `--prompt=${promptPath}`,
      `--plan-out=${planPath}`
    ], {}, cwd);

    assert.equal(child.status, 0, String(child.stderr));
    const stdoutPlan = JSON.parse(String(child.stdout)) as Record<string, unknown>;
    const filePlan = JSON.parse(await readFile(planPath, "utf8")) as Record<string, unknown>;
    assert.equal(stdoutPlan.sessionId, "agent-command-session");
    assert.deepEqual(filePlan, stdoutPlan);
    assert.equal((stdoutPlan.decisions as Array<Record<string, unknown>>)[0]?.action, "hold");
  });
});

test("agent command fails closed without API key for openai provider", async () => {
  await withTempDir(async (dir) => {
    const cwd = process.cwd();
    const briefPath = path.join(dir, "brief.json");
    await writeFile(briefPath, `${JSON.stringify(briefFixture(), null, 2)}\n`, "utf8");

    const child = runAgentCommand([
      "--provider=openai",
      `--brief=${briefPath}`
    ], { OPENAI_API_KEY: "" }, cwd);

    assert.notEqual(child.status, 0);
    assert.match(String(child.stderr), /OPENAI_API_KEY is required/);
  });
});

test("agent command parses mocked OpenAI Responses structured output", async () => {
  await withTempDir(async (dir) => {
    const cwd = process.cwd();
    const briefPath = path.join(dir, "brief.json");
    const promptPath = path.join(dir, "prompt.md");
    await writeFile(briefPath, `${JSON.stringify(briefFixture(), null, 2)}\n`, "utf8");
    await writeFile(promptPath, "Return a decision plan.", "utf8");

    let requestBody = "";
    const server = http.createServer((request, response) => {
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        requestBody += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          output_text: JSON.stringify({
            kind: "polymarket_autotrader_agent_decision_plan_v1",
            sessionId: "agent-command-session",
            agentName: "mock-openai-agent",
            decisions: [{
              decisionRef: "candidate-01",
              action: "paper_buy_yes",
              confidence: 0.72,
              rationale: "Mock model selected a small paper buy from structured output.",
              limitPrice: 0.4,
              maxSpendUsdc: 5
            }]
          })
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const child = await runAgentCommandAsync([
        "--provider=openai",
        `--api-base-url=http://127.0.0.1:${port}/v1/responses`,
        `--brief=${briefPath}`,
        `--prompt=${promptPath}`
      ], {
        OPENAI_API_KEY: "test-key",
        AUTOTRADER_AGENT_MODEL: "test-model"
      }, cwd);

      assert.equal(child.status, 0, child.stderr);
      const plan = JSON.parse(child.stdout) as Record<string, unknown>;
      const parsedRequest = JSON.parse(requestBody) as Record<string, unknown>;
      assert.equal(parsedRequest.model, "test-model");
      assert.equal((parsedRequest.text as Record<string, unknown> | undefined)?.format && typeof (parsedRequest.text as Record<string, unknown>).format === "object", true);
      assert.equal(plan.sessionId, "agent-command-session");
      assert.equal(plan.agentName, "mock-openai-agent");
      assert.equal((plan.decisions as Array<Record<string, unknown>>)[0]?.action, "paper_buy_yes");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
