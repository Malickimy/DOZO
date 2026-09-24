import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConnectorApp, buildDashboardApp } from '../src/app.js';
import { createDashboard } from '../src/dashboard.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { authHeaders, TEST_TOKEN, TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

const CONNECTOR_SECRET = 'connector-test-secret';

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
