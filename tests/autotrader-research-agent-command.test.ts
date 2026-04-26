import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "poly-research-agent-command-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function templateFixture(): Record<string, unknown> {
  return {
    generatedAt: "2026-04-25T12:00:00.000Z",
    scannedDecisions: 1,
    pendingRequests: 1,
    skippedAlreadyCompleted: 0,
    templates: [{
      decisionId: "decision-1",
      sessionId: "session-1",
      marketKey: "condition:research-agent",
      title: "Research agent market",
      score: 91,
      dueAt: "2026-04-25T12:30:00.000Z",
      priority: "high",
      reasonCodes: ["forecast_gate:screening_only"],
      forecastBlockers: ["independent_forecast_screening_only"],
      requiredArtifact: {
        method: "deep_research_forecast_v1",
        minimumEvidenceItems: 2,
        requiresCounterEvidence: true,
        requiredFields: ["fairValueLow", "fairValueBase", "fairValueHigh"],
        forbiddenEvidence: ["Polymarket odds", "venue price"],
        freshnessHours: 24
      },
      marketContext: {
        eventTitle: "Research agent event",
        outcomes: ["Yes", "No"],
        reasonCodes: ["clear_resolution_text"]
      },
      researchQuestion: "Will Research agent market resolve YES?",
      evidenceBundleTemplate: {
        marketKey: "condition:research-agent",
        title: "Research agent market",
        question: "Will Research agent market resolve YES?",
        thesis: "",
        fairValueLow: null,
        fairValueBase: null,
        fairValueHigh: null,
        supportsYes: [],
        supportsNo: [],
        openQuestions: [],
        providers: [],
        notes: "",
        completedAt: null,
        automationName: "test"
      }
    }]
  };
}

test("research agent command can use Codex CLI provider to write source packs", async () => {
  await withTempDir(async (dir) => {
    const cwd = process.cwd();
    const templatePath = path.join(dir, "templates.json");
    const outPath = path.join(dir, "source-packs.json");
    const fakeCodexPath = path.join(dir, "fake-codex.mjs");
    await writeFile(templatePath, `${JSON.stringify(templateFixture(), null, 2)}\n`, "utf8");
    await writeFile(fakeCodexPath, `
import { writeFileSync } from "node:fs";

const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex < 0) {
  console.error("missing --output-last-message");
  process.exit(2);
}
writeFileSync(process.argv[outputIndex + 1], JSON.stringify({
  kind: "polymarket_autotrader_research_source_packs_v1",
  generatedAt: "2026-04-25T12:00:00.000Z",
  agentName: "fake-codex-research-agent",
  sourcePacks: [{
    marketKey: "condition:research-agent",
    title: "Research agent market",
    question: "Will Research agent market resolve YES?",
    thesis: "Independent official schedule evidence modestly supports YES while timing risk remains material.",
    fairValueLow: 0.52,
    fairValueBase: 0.61,
    fairValueHigh: 0.69,
    supportsYes: [{
      source: "Official source",
      title: "Official schedule remains active",
      url: "https://example.com/official",
      summary: "A primary source keeps the relevant milestone inside the resolution window.",
      stance: "supports_yes",
      confidence: "medium"
    }],
    supportsNo: [{
      source: "Independent report",
      title: "Timing risk remains",
      url: "https://example.com/report",
      summary: "A non-venue source describes remaining timing uncertainty before cutoff.",
      stance: "supports_no",
      confidence: "medium"
    }],
    openQuestions: ["Whether the last condition is completed before cutoff."],
    providers: ["fake-codex-research-agent"],
    notes: "Source-backed fixture without trading-screen data.",
    completedAt: "2026-04-25T12:00:00.000Z",
    numericalAnchors: ["Base rate 0.50 adjusted to 0.61 for official schedule evidence and timing risk."],
    counterCase: "The strongest counter-case is a delay past the cutoff.",
    sourceCutoff: "2026-04-25T12:00:00.000Z"
  }]
}) + "\\n");
`, "utf8");

    const child = spawnSync(process.execPath, [
      "--import",
      "tsx",
      path.join(cwd, "scripts", "autotrader-research-agent-command.ts"),
      "--provider=codex_cli",
      `--template-file=${templatePath}`,
      `--out=${outPath}`
    ], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        POLYMARKET_ENABLE_TRADING: "false",
        AUTOTRADER_CODEX_BIN: process.execPath,
        AUTOTRADER_CODEX_PREFIX_ARGS: JSON.stringify([fakeCodexPath])
      }
    });

    assert.equal(child.status, 0, String(child.stderr));
    const stdoutPlan = JSON.parse(String(child.stdout)) as Record<string, unknown>;
    const filePlan = JSON.parse(await readFile(outPath, "utf8")) as Record<string, unknown>;
    assert.deepEqual(filePlan, stdoutPlan);
    assert.equal((stdoutPlan.sourcePacks as Array<Record<string, unknown>>)[0]?.marketKey, "condition:research-agent");
  });
});

test("research agent command rejects venue-contaminated source packs", async () => {
  await withTempDir(async (dir) => {
    const cwd = process.cwd();
    const templatePath = path.join(dir, "templates.json");
    const fakeCodexPath = path.join(dir, "fake-codex.mjs");
    await writeFile(templatePath, `${JSON.stringify(templateFixture(), null, 2)}\n`, "utf8");
    await writeFile(fakeCodexPath, `
import { writeFileSync } from "node:fs";
const outputIndex = process.argv.indexOf("--output-last-message");
writeFileSync(process.argv[outputIndex + 1], JSON.stringify({
  kind: "polymarket_autotrader_research_source_packs_v1",
  generatedAt: "2026-04-25T12:00:00.000Z",
  agentName: "fake-codex-research-agent",
  sourcePacks: [{
    marketKey: "condition:research-agent",
    title: "Research agent market",
    question: "Will Research agent market resolve YES?",
    thesis: "This forecast uses Polymarket odds and must fail.",
    fairValueLow: 0.52,
    fairValueBase: 0.61,
    fairValueHigh: 0.69,
    supportsYes: [{ source: "Official source", title: "A", url: "https://example.com/a", summary: "A supports yes.", stance: "supports_yes", confidence: "medium" }],
    supportsNo: [{ source: "Independent report", title: "B", url: "https://example.com/b", summary: "B supports no.", stance: "supports_no", confidence: "medium" }],
    openQuestions: [],
    providers: ["fake"],
    notes: "bad",
    completedAt: "2026-04-25T12:00:00.000Z",
    numericalAnchors: ["Base rate 0.50 to 0.61."],
    counterCase: "Delay.",
    sourceCutoff: "2026-04-25T12:00:00.000Z"
  }]
}) + "\\n");
`, "utf8");

    const child = spawnSync(process.execPath, [
      "--import",
      "tsx",
      path.join(cwd, "scripts", "autotrader-research-agent-command.ts"),
      "--provider=codex_cli",
      `--template-file=${templatePath}`
    ], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        POLYMARKET_ENABLE_TRADING: "false",
        AUTOTRADER_CODEX_BIN: process.execPath,
        AUTOTRADER_CODEX_PREFIX_ARGS: JSON.stringify([fakeCodexPath])
      }
    });

    assert.notEqual(child.status, 0);
    assert.match(String(child.stderr), /venue-price contamination/);
  });
});

test("research agent command can delegate source packs to a local command provider", async () => {
  await withTempDir(async (dir) => {
    const cwd = process.cwd();
    const templatePath = path.join(dir, "templates.json");
    const outPath = path.join(dir, "source-packs.json");
    const fakeAgentPath = path.join(dir, "fake-research-agent.mjs");
    await writeFile(templatePath, `${JSON.stringify(templateFixture(), null, 2)}\n`, "utf8");
    await writeFile(fakeAgentPath, `
import { readFileSync } from "node:fs";

const templateFile = process.env.AUTOTRADER_RESEARCH_TEMPLATE_FILE;
if (!templateFile) {
  console.error("missing template env");
  process.exit(2);
}
const templates = JSON.parse(readFileSync(templateFile, "utf8")).templates;
console.log(JSON.stringify({
  kind: "polymarket_autotrader_research_source_packs_v1",
  generatedAt: "2026-04-25T12:00:00.000Z",
  agentName: "fake-command-research-agent",
  sourcePacks: [{
    marketKey: templates[0].marketKey,
    title: templates[0].title,
    question: templates[0].researchQuestion,
    thesis: "Independent command-agent evidence supports YES, with a credible timing counter-case.",
    fairValueLow: 0.51,
    fairValueBase: 0.59,
    fairValueHigh: 0.67,
    supportsYes: [{
      source: "Official command source",
      title: "Official status remains supportive",
      url: "https://example.com/official-command",
      summary: "A primary source indicates the relevant condition can complete inside the resolution window.",
      stance: "supports_yes",
      confidence: "medium"
    }],
    supportsNo: [{
      source: "Independent command source",
      title: "A timing dependency remains",
      url: "https://example.com/independent-command",
      summary: "A non-venue source identifies unresolved timing risk.",
      stance: "supports_no",
      confidence: "medium"
    }],
    openQuestions: ["Whether timing risk clears before cutoff."],
    providers: ["fake-command-research-agent"],
    notes: "Local command-provider fixture.",
    completedAt: "2026-04-25T12:00:00.000Z",
    numericalAnchors: ["Base rate 0.50 adjusted to 0.59 for source evidence and timing risk."],
    counterCase: "The strongest counter-case is delay beyond cutoff.",
    sourceCutoff: "2026-04-25T12:00:00.000Z"
  }]
}));
`, "utf8");

    const child = spawnSync(process.execPath, [
      "--import",
      "tsx",
      path.join(cwd, "scripts", "autotrader-research-agent-command.ts"),
      "--provider=command",
      `--template-file=${templatePath}`,
      `--out=${outPath}`,
      `--command="${process.execPath}" "${fakeAgentPath}"`
    ], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        POLYMARKET_ENABLE_TRADING: "false"
      }
    });

    assert.equal(child.status, 0, String(child.stderr));
    const stdoutPlan = JSON.parse(String(child.stdout)) as Record<string, unknown>;
    const filePlan = JSON.parse(await readFile(outPath, "utf8")) as Record<string, unknown>;
    const sourcePacks = stdoutPlan.sourcePacks as Array<{ providers?: string[] }>;
    assert.deepEqual(filePlan, stdoutPlan);
    assert.equal(sourcePacks[0]?.providers?.[0], "fake-command-research-agent");
  });
});
