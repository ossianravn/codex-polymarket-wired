import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveRuntimeDotenvPath } from "../packages/polymarket-core/src/index.js";

test("resolveRuntimeDotenvPath falls back from cached plugin cwd to installed plugin env", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codex-poly-env-"));
  const codexHome = path.join(root, ".codex");
  const installedPluginRoot = path.join(codexHome, "plugins", "codex-polymarket");
  const cachedPluginRoot = path.join(
    codexHome,
    "plugins",
    "cache",
    "local-personal",
    "codex-polymarket",
    "local"
  );

  mkdirSync(path.join(installedPluginRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(path.join(cachedPluginRoot, ".codex-plugin"), { recursive: true });
  writeFileSync(path.join(installedPluginRoot, ".codex-plugin", "plugin.json"), "{}");
  writeFileSync(path.join(cachedPluginRoot, ".codex-plugin", "plugin.json"), "{}");
  writeFileSync(path.join(installedPluginRoot, ".env"), "POLYMARKET_ENABLE_TRADING=true\n");

  assert.equal(resolveRuntimeDotenvPath(cachedPluginRoot), path.join(installedPluginRoot, ".env"));
});

test("resolveRuntimeDotenvPath prefers the current plugin root env when present", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codex-poly-env-"));
  const pluginRoot = path.join(root, "codex-polymarket");
  const nestedDir = path.join(pluginRoot, "servers", "polymarket-mcp", "src");

  mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "{}");
  writeFileSync(path.join(pluginRoot, ".env"), "POLYMARKET_ENABLE_TRADING=true\n");

  assert.equal(resolveRuntimeDotenvPath(nestedDir), path.join(pluginRoot, ".env"));
});
