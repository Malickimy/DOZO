import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_TERMINAL_ID, TEST_PLACE_ID } from './helpers.js';

test('migration adds display defaults to existing terminals', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const row = db
    .prepare(
      'SELECT display_enabled, display_timeout_seconds FROM terminals WHERE terminal_id = ?',
    )
    .get(TEST_TERMINAL_ID);
  assert.equal(row.display_enabled, 1);
  assert.equal(row.display_timeout_seconds, 15);
});

test('GET /api/terminals/:id/config returns the full config shape', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    terminal_id: TEST_TERMINAL_ID,
    merchant_id: 'M1',
    google_place_id: TEST_PLACE_ID,
    label: 'Front counter',
    active: true,
    display_enabled: true,
    display_timeout_seconds: 15,
    redirect_base_url: 'http://localhost:3000',
  });
});

test('GET /api/terminals/:id/config 404s for unknown terminal', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/terminals/NOPE9999/config',
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'unknown_terminal');
});

test('PUT /api/terminals/:id/config updates display_enabled and timeout', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
    payload: { display_enabled: false, display_timeout_seconds: 22 },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.display_enabled, false);
  assert.equal(body.display_timeout_seconds, 22);
  assert.equal(body.redirect_base_url, 'http://localhost:3000');
});

test('PUT /api/terminals/:id/config clamps timeout to 5..30', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const low = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
    payload: { display_timeout_seconds: 1 },
  });
  assert.equal(low.json().display_timeout_seconds, 5);

  const high = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
    payload: { display_timeout_seconds: 999 },
  });
  assert.equal(high.json().display_timeout_seconds, 30);
});

test('PUT /api/terminals/:id/config with no fields is a no-op', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
    payload: {},
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().display_enabled, true);
  assert.equal(res.json().display_timeout_seconds, 15);
});

test('PUT /api/terminals/:id/config rejects invalid types', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const badEnabled = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
    payload: { display_enabled: 'yes' },
  });
  assert.equal(badEnabled.statusCode, 400);
  assert.equal(badEnabled.json().error, 'invalid_display_enabled');

  const badTimeout = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(),
    payload: { display_timeout_seconds: 'soon' },
  });
  assert.equal(badTimeout.statusCode, 400);
  assert.equal(badTimeout.json().error, 'invalid_display_timeout_seconds');
});

test('PUT /api/terminals/:id/config 404s for unknown terminal', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'PUT',
    url: '/api/terminals/NOPE9999/config',
    headers: authHeaders(),
    payload: { display_enabled: false },
  });
  assert.equal(res.statusCode, 404);
});

test('CORS preflight is answered without a token and allows dashboard headers', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'OPTIONS',
    url: '/api/merchants',
    headers: {
      origin: 'http://dashboard.example',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-api-token,content-type',
    },
  });

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.match(res.headers['access-control-allow-methods'], /GET/);
  assert.match(res.headers['access-control-allow-methods'], /PUT/);
  assert.match(res.headers['access-control-allow-headers'].toLowerCase(), /x-api-token/);
});

test('DASHBOARD_ORIGIN restricts allowed origins when configured', async (t) => {
  const { app, db } = makeTestContext({
    env: { DASHBOARD_ORIGIN: 'https://dash.example.com' },
  });
  t.after(() => {
    app.close();
    db.close();
  });

  const allowed = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: { ...authHeaders(), origin: 'https://dash.example.com' },
  });
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://dash.example.com');

  const blocked = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: { ...authHeaders(), origin: 'https://evil.example.com' },
  });
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
