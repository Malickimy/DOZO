/**
 * Hardening I: `scripts/uptime-check.sh`, the external probe for `/health`.
 * `/health` is exempt from the rate limiter so this poller can run continuously.
 *
 * The probe runs asynchronously so the in-process test server keeps serving
 * while curl is in flight (a blocking spawnSync would deadlock the event loop).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UPTIME_SH = join(PROJECT_DIR, 'scripts', 'uptime-check.sh');

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => resolveListen(server));
  });
}

function run(env) {
  return new Promise((resolveRun) => {
    execFile('bash', [UPTIME_SH], { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      resolveRun({ status: error ? (error.code ?? 1) : 0, stdout, stderr });
    });
  });
}

test('uptime-check.sh exits 0 when /health answers status ok', async (t) => {
  const server = await listen((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
  });
  t.after(() => server.close());
  const { port } = server.address();

  const result = await run({ HEALTH_URL: `http://127.0.0.1:${port}/health`, RETRIES: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK:/);
});

test('uptime-check.sh exits non-zero when /health is unhealthy', async (t) => {
  const server = await listen((request, response) => {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'down' }));
  });
  t.after(() => server.close());
  const { port } = server.address();

  const result = await run({
    HEALTH_URL: `http://127.0.0.1:${port}/health`,
    RETRIES: '1',
    TIMEOUT_SECONDS: '2',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FAIL/);
});

test('uptime-check.sh exits non-zero when the server is unreachable', async () => {
  const result = await run({
    HEALTH_URL: 'http://127.0.0.1:1/health',
    RETRIES: '1',
    TIMEOUT_SECONDS: '2',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FAIL/);
});
