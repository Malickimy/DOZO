import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_TERMINAL_ID } from './helpers.js';
import { hashToken } from '../src/lib/token.js';

async function redeemTerminal(app, { merchantId = 'M1', label, terminalId }) {
  const issued = await app.inject({
    method: 'POST',
    url: `/api/merchants/${merchantId}/registers/${encodeURIComponent(label)}/setup-code`,
    headers: authHeaders(),
  });
  assert.equal(issued.statusCode, 201);
  const redeemed = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: authHeaders(),
    payload: { code: issued.json().code, terminal_id: terminalId },
  });
  assert.equal(redeemed.statusCode, 200);
  return redeemed.json().api_token;
}

test('redeem issues a per-terminal token and stores only its hash', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 40);

  const row = db
    .prepare('SELECT api_token_hash FROM terminals WHERE terminal_id = ?')
    .get('TOKENA01');
  assert.equal(row.api_token_hash, hashToken(token));
  assert.notEqual(row.api_token_hash, token, 'the plaintext token is never stored');
});

test('a terminal token reaches its own heartbeat but not another terminal', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  const own = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(token),
    payload: { terminal_id: 'TOKENA01' },
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().ok, true);

  const cross = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(token),
    payload: { terminal_id: TEST_TERMINAL_ID },
  });
  assert.equal(cross.statusCode, 401);
  assert.equal(cross.json().error, 'unauthorized');
});

test('a terminal token reaches its own config but not another terminal', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  const own = await app.inject({
    method: 'GET',
    url: '/api/terminals/TOKENA01/config',
    headers: authHeaders(token),
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().terminal_id, 'TOKENA01');

  const cross = await app.inject({
    method: 'GET',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(token),
  });
  assert.equal(cross.statusCode, 401);

  const crossPatch = await app.inject({
    method: 'PATCH',
    url: `/api/terminals/${TEST_TERMINAL_ID}`,
    headers: authHeaders(token),
    payload: { active: false },
  });
  assert.equal(crossPatch.statusCode, 401);
});

test('a terminal token reaches only its own merchant registers', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M2', 'ChIJ_M2', '2026-01-01T00:00:00.000Z');

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  const own = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/registers',
    headers: authHeaders(token),
  });
  assert.equal(own.statusCode, 200);

  const cross = await app.inject({
    method: 'GET',
    url: '/api/merchants/M2/registers',
    headers: authHeaders(token),
  });
  assert.equal(cross.statusCode, 401);
});

test('the operator token still reaches dashboard routes and any terminal', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const beat = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(),
    payload: { terminal_id: TEST_TERMINAL_ID },
  });
  assert.equal(beat.statusCode, 200);

  const merchants = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: authHeaders(),
  });
  assert.equal(merchants.statusCode, 200);
});

test('a terminal token cannot touch another merchant via any merchant route (G01)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M2', 'ChIJ_M2', '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run('M2TERM01', 'M2', 'M2 front', '2026-01-01T00:00:00.000Z');

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  const headers = authHeaders(token);

  const crossReads = [
    ['GET', '/api/merchants'],
    ['GET', '/api/merchants/M2/terminals'],
    ['GET', '/api/merchants/M2/summary'],
    ['GET', '/api/merchants/M2/scans'],
    ['GET', '/api/merchants/M2/scans/series'],
  ];
  for (const [method, url] of crossReads) {
    const res = await app.inject({ method, url, headers });
    assert.equal(res.statusCode, 401, `${method} ${url} is scoped to the token's merchant`);
  }

  const crossWrite = await app.inject({
    method: 'PUT',
    url: '/api/merchants/M2/google-place-id',
    headers,
    payload: { google_place_id: 'ChIJ_HIJACKED' },
  });
  assert.equal(crossWrite.statusCode, 401, 'the cross-merchant WRITE is rejected');
  assert.equal(
    db
      .prepare('SELECT google_place_id FROM merchants WHERE merchant_id = ?')
      .get('M2').google_place_id,
    'ChIJ_M2',
    'the rejected write left M2 untouched',
  );

  // The terminal token still reaches its own merchant.
  const own = await app.inject({ method: 'GET', url: '/api/merchants/M1/summary', headers });
  assert.equal(own.statusCode, 200);

  // ...and the operator token keeps full access to the other merchant.
  const operator = await app.inject({
    method: 'GET',
    url: '/api/merchants/M2/terminals',
    headers: authHeaders(),
  });
  assert.equal(operator.statusCode, 200, 'the operator token is unaffected');
});

test('a terminal token cannot PUT another terminal config (G22)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  const cross = await app.inject({
    method: 'PUT',
    url: `/api/terminals/${TEST_TERMINAL_ID}/config`,
    headers: authHeaders(token),
    payload: { display_enabled: false },
  });
  assert.equal(cross.statusCode, 401);

  const own = await app.inject({
    method: 'PUT',
    url: '/api/terminals/TOKENA01/config',
    headers: authHeaders(token),
    payload: { display_enabled: false },
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().display_enabled, false);
});

test('a rotated token replaces the previous one', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const first = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  const second = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  assert.notEqual(first, second);

  const staleCheck = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(first),
    payload: { terminal_id: 'TOKENA01' },
  });
  assert.equal(staleCheck.statusCode, 401, 'the previous token stops working');

  const fresh = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(second),
    payload: { terminal_id: 'TOKENA01' },
  });
  assert.equal(fresh.statusCode, 200);
});
