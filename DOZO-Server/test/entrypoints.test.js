import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConnectorApp, buildDashboardApp } from '../src/app.js';
import { createDashboard } from '../src/dashboard.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { authHeaders, TEST_TOKEN, TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

const CONNECTOR_SECRET = 'connector-test-secret';
const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function waitForHealth(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function killTree(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function makeContext({ connectorSecret = CONNECTOR_SECRET } = {}) {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    API_TOKEN: TEST_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    DASHBOARD_CONNECTOR_SECRET: connectorSecret,
  });
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', '2026-01-01T00:00:00.000Z');
  return { db, config };
}

test('connector app serves /health and /r/:id but not the dashboard API', async (t) => {
  const { db, config } = makeContext();
  const app = buildConnectorApp({ db, config, now: () => new Date('2026-01-01T00:00:00.000Z') });
  t.after(() => {
    app.close();
    db.close();
  });

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok' });

  const redirect = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}` });
  assert.equal(redirect.statusCode, 302);

  const api = await app.inject({ method: 'GET', url: '/api/merchants', headers: authHeaders() });
  assert.equal(api.statusCode, 404, 'dashboard routes are not mounted on the connector');
});

test('dashboard app serves the API but not /r/:id', async (t) => {
  const { db, config } = makeContext();
  const app = buildDashboardApp({ db, config });
  t.after(() => {
    app.close();
    db.close();
  });

  const merchants = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: authHeaders(),
  });
  assert.equal(merchants.statusCode, 200);
  assert.equal(merchants.json().length, 1);

  const redirect = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}` });
  assert.equal(redirect.statusCode, 404, 'the redirect route is not mounted on the dashboard');
});

test('GET /api/connector/config requires the connector secret', async (t) => {
  const { db, config } = makeContext();
  const app = buildDashboardApp({ db, config, now: () => new Date('2026-01-01T00:00:00.000Z') });
  t.after(() => {
    app.close();
    db.close();
  });

  const missing = await app.inject({ method: 'GET', url: '/api/connector/config' });
  assert.equal(missing.statusCode, 401);

  const wrong = await app.inject({
    method: 'GET',
    url: '/api/connector/config',
    headers: { 'x-connector-secret': 'nope' },
  });
  assert.equal(wrong.statusCode, 401);

  const operator = await app.inject({
    method: 'GET',
    url: '/api/connector/config',
    headers: authHeaders(),
  });
  assert.equal(operator.statusCode, 401, 'the operator token does not authorize the connector route');

  const ok = await app.inject({
    method: 'GET',
    url: '/api/connector/config',
    headers: { 'x-connector-secret': CONNECTOR_SECRET },
  });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json(), {
    generated_at: '2026-01-01T00:00:00.000Z',
    redirect_base_url: 'http://localhost:3000',
    terminals: [
      {
        terminal_id: TEST_TERMINAL_ID,
        merchant_id: 'M1',
        google_place_id: TEST_PLACE_ID,
        label: 'Front counter',
        active: true,
      },
    ],
  });
});

test('an unset connector secret fails closed', async (t) => {
  const { db, config } = makeContext({ connectorSecret: '' });
  const app = buildDashboardApp({ db, config });
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/connector/config',
    headers: { 'x-connector-secret': '' },
  });
  assert.equal(res.statusCode, 401);
});

test('dashboard app serves the SPA with a history fallback when dist exists', async (t) => {
  const { db, config } = makeContext();
  const dist = mkdtempSync(join(tmpdir(), 'dozo-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>DOZO</title>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("ok")');

  const app = await createDashboard({
    db,
    config: { ...config, dashboardDistPath: dist },
    logger: false,
  });
  t.after(() => {
    app.close();
    db.close();
    rmSync(dist, { recursive: true, force: true });
  });

  const root = await app.inject({ method: 'GET', url: '/' });
  assert.equal(root.statusCode, 200);
  assert.match(root.body, /DOZO/);

  const deepLink = await app.inject({ method: 'GET', url: '/registers' });
  assert.equal(deepLink.statusCode, 200);
  assert.match(deepLink.body, /DOZO/, 'unknown non-API GET paths fall back to index.html');

  const unknownApi = await app.inject({
    method: 'GET',
    url: '/api/does-not-exist',
    headers: authHeaders(),
  });
  assert.equal(unknownApi.statusCode, 404, 'unknown /api paths stay 404');
});

test('npm start is the dashboard entrypoint and start:all never runs the combined server', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, 'package.json'), 'utf8'));
  const { scripts } = pkg;

  // #50: the operator default is the dashboard split entrypoint.
  assert.equal(scripts.start, 'node src/dashboard.js');
  assert.equal(scripts.dev, 'node --watch src/dashboard.js');
  assert.equal(scripts['start:dashboard'], 'node src/dashboard.js');
  assert.equal(scripts['start:connector'], 'node src/connector.js');
  assert.doesNotMatch(scripts.start, /src\/server\.js/, 'npm start must not run the combined server');
  assert.doesNotMatch(scripts.dev, /src\/server\.js/, 'npm run dev must not run the combined server');

  // Local/demo runs the two entrypoints through the launcher, not src/server.js.
  assert.equal(scripts['start:all'], 'node scripts/start-all.js');
  assert.doesNotMatch(scripts['start:all'], /src\/server\.js/, 'start:all must not run the combined server');
  const launcher = readFileSync(join(PROJECT_DIR, 'scripts/start-all.js'), 'utf8');
  assert.match(launcher, /src\/dashboard\.js/, 'launcher spawns the dashboard entrypoint');
  assert.match(launcher, /src\/connector\.js/, 'launcher spawns the connector entrypoint');
  assert.match(launcher, /CONNECTOR_PORT/, 'launcher gives the connector its own port');

  // Whatever each script points at must be a real file.
  const entrypointPattern = /(?:src|scripts)\/[\w./-]+\.js/;
  for (const name of ['start', 'dev', 'start:dashboard', 'start:connector', 'start:all']) {
    const match = scripts[name].match(entrypointPattern);
    assert.ok(match, `scripts.${name} references an entrypoint`);
    assert.ok(
      existsSync(join(PROJECT_DIR, match[0])),
      `scripts.${name} -> ${match[0]} exists`,
    );
  }
});

test('start:all boots the connector and dashboard as two live processes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-startall-'));
  const dashboardPort = 39320;
  const connectorPort = 39321;

  const launcher = spawn(process.execPath, ['scripts/start-all.js'], {
    cwd: PROJECT_DIR,
    detached: true, // own process group so the test can tear the whole tree down
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(dashboardPort),
      CONNECTOR_PORT: String(connectorPort),
      DB_PATH: join(dir, 'dozo.db'),
      CONNECTOR_SPOOL_PATH: join(dir, 'scan-spool.jsonl'),
      DASHBOARD_DIST_PATH: join(dir, 'no-dist'),
      SEED_DEMO: 'true',
      API_TOKEN: TEST_TOKEN,
    },
  });
  let output = '';
  launcher.stdout.on('data', (chunk) => (output += chunk));
  launcher.stderr.on('data', (chunk) => (output += chunk));

  t.after(async () => {
    if (launcher.exitCode === null && launcher.signalCode === null) {
      killTree(launcher, 'SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      killTree(launcher, 'SIGKILL');
    }
    rmSync(dir, { recursive: true, force: true });
  });

  const dashboardUp = await waitForHealth(`http://127.0.0.1:${dashboardPort}/health`);
  const connectorUp = await waitForHealth(`http://127.0.0.1:${connectorPort}/health`);
  assert.ok(dashboardUp, `dashboard :${dashboardPort} is healthy\n${output}`);
  assert.ok(connectorUp, `connector :${connectorPort} is healthy\n${output}`);

  // Both surfaces are live and split: API on the dashboard, redirect on the connector.
  const merchants = await fetch(`http://127.0.0.1:${dashboardPort}/api/merchants`, {
    headers: { 'x-api-token': TEST_TOKEN },
  });
  assert.equal(merchants.status, 200, 'dashboard serves /api/*');

  const connectorApi = await fetch(`http://127.0.0.1:${connectorPort}/api/merchants`, {
    headers: { 'x-api-token': TEST_TOKEN },
  });
  assert.equal(connectorApi.status, 404, 'connector does not mount the dashboard API');

  const redirect = await fetch(`http://127.0.0.1:${connectorPort}/r/DEMOTERM01`, {
    redirect: 'manual',
  });
  assert.equal(redirect.status, 302, 'connector serves /r/:id');

  // SIGINT on the launcher must stop both children and exit cleanly.
  launcher.kill('SIGINT');
  const exit = await new Promise((resolveExit) =>
    launcher.on('exit', (code, signal) => resolveExit({ code, signal })),
  );
  assert.equal(exit.code, 0, `launcher exits cleanly (${JSON.stringify(exit)})\n${output}`);

  // The children are gone too: a second boot on the same ports would have failed.
  assert.equal(
    await waitForHealth(`http://127.0.0.1:${connectorPort}/health`, 1000),
    false,
    'connector stopped with the launcher',
  );
});

test('start:all stops the sibling and exits non-zero when one entrypoint fails', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-startall-fail-'));
  const connectorPort = 39331;

  // Occupy the dashboard port so the dashboard entrypoint fails to bind.
  const blocker = createServer();
  await new Promise((resolveListen) => blocker.listen(0, '0.0.0.0', resolveListen));
  const dashboardPort = blocker.address().port;

  const launcher = spawn(process.execPath, ['scripts/start-all.js'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(dashboardPort),
      CONNECTOR_PORT: String(connectorPort),
      DB_PATH: join(dir, 'dozo.db'),
      CONNECTOR_SPOOL_PATH: join(dir, 'scan-spool.jsonl'),
      DASHBOARD_DIST_PATH: join(dir, 'no-dist'),
      SEED_DEMO: 'true',
      API_TOKEN: TEST_TOKEN,
    },
  });
  t.after(async () => {
    if (launcher.exitCode === null && launcher.signalCode === null) {
      killTree(launcher, 'SIGKILL');
    }
    await new Promise((resolveClose) => blocker.close(resolveClose));
    rmSync(dir, { recursive: true, force: true });
  });

  const exit = await new Promise((resolveExit) =>
    launcher.on('exit', (code, signal) => resolveExit({ code, signal })),
  );
  assert.notEqual(exit.code, 0, `launcher exits non-zero (${JSON.stringify(exit)})`);
  assert.equal(
    await waitForHealth(`http://127.0.0.1:${connectorPort}/health`, 1000),
    false,
    'the sibling connector was stopped',
  );
});
