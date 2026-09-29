import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders } from './helpers.js';

test('heartbeat updates last_seen and offline list reports stale terminals', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const beat = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(),
    payload: { terminal_id: 'TERM0001' },
  });
  assert.equal(beat.statusCode, 200);
  assert.equal(beat.json().ok, true);

  const lastSeen = db
    .prepare('SELECT last_seen FROM terminals WHERE terminal_id = ?')
    .get('TERM0001');
  assert.equal(lastSeen.last_seen, '2026-01-01T00:00:00.000Z');

  clock.advanceMs(24 * 60 * 60 * 1000 + 1);
  const offline = await app.inject({
    method: 'GET',
    url: '/api/terminals/offline',
    headers: authHeaders(),
  });
  assert.equal(offline.statusCode, 200);
  assert.equal(offline.json().terminals.length, 1);
  assert.equal(offline.json().terminals[0].terminal_id, 'TERM0001');
});

test('the offline fleet list is operator-only; a terminal token gets 401 (P1)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  // A second merchant's terminal must never be reachable to M1's terminal token.
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M2', 'ChIJ_M2', '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run('M2TERM01', 'M2', 'M2 front', '2026-01-01T00:00:00.000Z');

  const issued = await app.inject({
    method: 'POST',
    url: `/api/merchants/M1/registers/${encodeURIComponent('Till 1')}/setup-code`,
    headers: authHeaders(),
  });
  assert.equal(issued.statusCode, 201);
  const redeemed = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: authHeaders(),
    payload: { code: issued.json().code, terminal_id: 'TOKENA01' },
  });
  assert.equal(redeemed.statusCode, 200);
  const terminalToken = redeemed.json().api_token;

  const operator = await app.inject({
    method: 'GET',
    url: '/api/terminals/offline',
    headers: authHeaders(),
  });
  assert.equal(operator.statusCode, 200, 'the operator keeps the fleet view');
  assert.ok(
    operator
      .json()
      .terminals.some((row) => row.merchant_id === 'M2'),
    'the operator sees M2',
  );

  const asTerminal = await app.inject({
    method: 'GET',
    url: '/api/terminals/offline',
    headers: authHeaders(terminalToken),
  });
  assert.equal(asTerminal.statusCode, 401, 'a terminal token is rejected');
  assert.deepEqual(asTerminal.json(), { error: 'unauthorized' });
  assert.ok(!asTerminal.body.includes('M2TERM01'), 'the 401 leaks no M2 terminal');
});
