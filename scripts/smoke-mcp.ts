import { spawn } from 'node:child_process';
import process from 'node:process';

const child = spawn(
  process.execPath,
  ['./node_modules/tsx/dist/cli.mjs', './servers/polymarket-mcp/src/server.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      POLYMARKET_ENABLE_TRADING: 'false',
      POLYMARKET_REQUIRE_PREVIEW: 'true',
      POLYMARKET_REQUIRE_GEOBLOCK_CHECK: 'true'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  }
);

let stderr = '';
let stdout = '';
let settled = false;

const fail = (message: string): never => {
  if (!child.killed) {
    child.kill('SIGTERM');
  }
  throw new Error(`${message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
};

const timer = setTimeout(() => {
  if (!settled) {
    settled = true;
    try {
      fail('Timed out waiting for MCP server startup.');
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}, 15000);

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
  if (!settled && stdout.trim().length > 0) {
    settled = true;
    clearTimeout(timer);
    console.error('MCP server wrote to stdout during startup, which would corrupt the stdio transport.');
    console.error('stdout:\n' + stdout);
    console.error('stderr:\n' + stderr);
    child.kill('SIGTERM');
    process.exit(1);
  }
});

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
  if (!settled && stderr.includes('polymarket MCP server running on stdio')) {
    settled = true;
    clearTimeout(timer);
    child.kill('SIGTERM');
    console.log('MCP smoke test passed.');
    process.exit(0);
  }
});

child.on('exit', (code) => {
  if (!settled) {
    settled = true;
    clearTimeout(timer);
    if (code === 0 && stderr.includes('polymarket MCP server running on stdio')) {
      console.log('MCP smoke test passed.');
      process.exit(0);
    }
    console.error(`MCP server exited before startup confirmation (code ${code ?? 'null'}).`);
    console.error('stdout:\n' + stdout);
    console.error('stderr:\n' + stderr);
    process.exit(1);
  }
});
