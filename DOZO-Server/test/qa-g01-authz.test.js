/**
 * Independent adversarial coverage for G01 (per-terminal token must not reach
 * another merchant on any `merchants.js` route) plus the cross-cutting
 * terminal-scoped routes (config / lifecycle / heartbeat / registers).
 *
 * Distinct from the author's `terminal-tokens.test.js`: this spec exercises the
 * full M2 route matrix with `?since/?until` variants, asserts the rejected
 * response bodies never leak M2 data, snapshots and re-checks M2 state after the
 * rejected writes, and pins operator + own-merchant regressions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTestContext,
  authHeaders,
  redeemTerminal,
  insertMerchant,
  insertTerminal,
  insertRegister,
  insertScan,
} from './qa-adversarial-helpers.js';

const WINDOW = '?since=2026-01-01T00:00:00.000Z&until=2026-01-03T00:00:00.000Z';

// Every merchant-scoped surface in `src/routes/merchants.js`.
function m2Routes() {
  return [
    ['GET', '/api/merchants/M2/terminals'],
    ['GET', '/api/merchants/M2/registers'],
    ['GET', '/api/merchants/M2/summary'],
    ['GET', `/api/merchants/M2/summary${WINDOW}`],
    ['GET', '/api/merchants/M2/scans'],
    ['GET', `/api/merchants/M2/scans${WINDOW}`],
    ['GET', '/api/merchants/M2/scans/series'],
    ['GET', `/api/merchants/M2/scans/series${WINDOW}`],
    ['PUT', '/api/merchants/M2/google-place-id'],
  ];
}

function payloadFor(method) {
  return method === 'PUT' ? { google_place_id: 'ChIJ_HIJACKED' } : undefined;
}

function snapshotM2(db) {
  return {
    merchant: db
      .prepare('SELECT merchant_id, google_place_id, created_at FROM merchants WHERE merchant_id = ?')
      .get('M2'),
    terminals: db
      .prepare(
        'SELECT terminal_id, merchant_id, label, active, last_seen FROM terminals WHERE merchant_id = ? ORDER BY terminal_id',
      )
      .all('M2'),
    registers: db
      .prepare('SELECT label, terminal_id, active FROM registers WHERE merchant_id = ? ORDER BY label')
      .all('M2'),
    scans: db
      .prepare(
        `SELECT s.id, s.event_id, s.terminal_id, s.scanned_at
           FROM scans s JOIN terminals t ON t.terminal_id = s.terminal_id
          WHERE t.merchant_id = ? ORDER BY s.id`,
      )
      .all('M2'),
  };
}

async function seed() {
  const ctx = makeTestContext();
  const { db } = ctx;
  insertMerchant(db, 'M2', 'ChIJ_M2');
  insertTerminal(db, { terminalId: 'M2TERM01', merchantId: 'M2', label: 'M2 front' });
  insertRegister(db, { merchantId: 'M2', label: 'M2 lane', terminalId: 'M2TERM01' });
  insertScan(db, { terminalId: 'M2TERM01', scannedAt: '2026-01-02T10:00:00.000Z', eventId: 'm2-evt-1' });
  insertScan(db, { terminalId: 'M2TERM01', scannedAt: '2026-01-02T11:00:00.000Z', eventId: 'm2-evt-2' });
  const redeemed = await redeemTerminal(ctx.app, {
    merchantId: 'M1',
    label: 'Till 1',
    terminalId: 'TOKENA01',
  });
  return { ...ctx, terminalToken: redeemed.api_token };
}

function closeCtx(t, ctx) {
  t.after(() => {
    ctx.app.close();
    ctx.db.close();
  });
}

test('G01: an M1 terminal token is rejected on every M2 merchant route and mutates nothing', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, db, terminalToken } = ctx;
  const headers = authHeaders(terminalToken);
  const before = snapshotM2(db);

  const directory = await app.inject({ method: 'GET', url: '/api/merchants', headers });
  assert.equal(directory.statusCode, 401, 'the merchant directory is operator-only');
  assert.deepEqual(directory.json(), { error: 'unauthorized' });

  for (const [method, url] of m2Routes()) {
    const res = await app.inject({ method, url, headers, payload: payloadFor(method) });
    assert.equal(res.statusCode, 401, `${method} ${url} must be 401 for a foreign terminal token`);
    assert.deepEqual(res.json(), { error: 'unauthorized' }, `${method} ${url} body`);
    assert.ok(!res.body.includes('ChIJ_M2'), `${method} ${url} leaked M2 data`);
  }

  assert.deepEqual(snapshotM2(db), before, 'no M2 row changed after the rejected requests');
});

test('G01: the operator token still reaches every M2 merchant route (no regression)', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, db } = ctx;
  const headers = authHeaders();

  const directory = await app.inject({ method: 'GET', url: '/api/merchants', headers });
  assert.equal(directory.statusCode, 200);
  assert.deepEqual(
    directory.json().map((merchant) => merchant.merchant_id).sort(),
    ['M1', 'M2'],
  );

  for (const [method, url] of m2Routes()) {
    const res = await app.inject({ method, url, headers, payload: payloadFor(method) });
    assert.equal(res.statusCode, 200, `${method} ${url} must stay reachable for the operator`);
  }

  const m1Terminals = await app.inject({ method: 'GET', url: '/api/merchants/M1/terminals', headers });
  assert.equal(m1Terminals.statusCode, 200);

  // Undo this test's write so a later failure cannot be blamed on it.
  db.prepare('UPDATE merchants SET google_place_id = ? WHERE merchant_id = ?').run('ChIJ_M2', 'M2');
});

test('G01: an M1 terminal token reads its own merchant but not the directory', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, terminalToken } = ctx;
  const headers = authHeaders(terminalToken);

  const directory = await app.inject({ method: 'GET', url: '/api/merchants', headers });
  assert.equal(directory.statusCode, 401, 'the terminal token never lists the merchant directory');

  for (const url of [
    '/api/merchants/M1/terminals',
    '/api/merchants/M1/registers',
    '/api/merchants/M1/summary',
    `/api/merchants/M1/summary${WINDOW}`,
    '/api/merchants/M1/scans',
    `/api/merchants/M1/scans${WINDOW}`,
    '/api/merchants/M1/scans/series',
    `/api/merchants/M1/scans/series${WINDOW}`,
  ]) {
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 200, `${url} stays reachable for the own-merchant terminal token`);
  }
});

test('G01 (flag): a terminal token can still rewrite its own merchant google_place_id', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, db, terminalToken } = ctx;

  const res = await app.inject({
    method: 'PUT',
    url: '/api/merchants/M1/google-place-id',
    headers: authHeaders(terminalToken),
    payload: { google_place_id: 'ChIJ_OWN_WRITE' },
  });

  // Pinning current behavior, not endorsing it: "own merchant" is still a
  // merchant-wide, all-terminals write. Reported as a least-privilege question.
  assert.equal(res.statusCode, 200);
  assert.equal(
    db.prepare('SELECT google_place_id FROM merchants WHERE merchant_id = ?').get('M1').google_place_id,
    'ChIJ_OWN_WRITE',
  );
});

test('G01: an M1 terminal token cannot read or mutate an M2 terminal (cross-cutting authz)', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, db, terminalToken } = ctx;
  const headers = authHeaders(terminalToken);
  const terminalShape =
    'SELECT active, label, last_seen, display_enabled, display_timeout_seconds FROM terminals WHERE terminal_id = ?';
  const before = db.prepare(terminalShape).get('M2TERM01');

  for (const [method, url, payload] of [
    ['GET', '/api/terminals/M2TERM01/config', undefined],
    ['PUT', '/api/terminals/M2TERM01/config', { display_enabled: false }],
    ['PATCH', '/api/terminals/M2TERM01', { active: false, label: 'pwned' }],
    ['POST', '/api/heartbeat', { terminal_id: 'M2TERM01' }],
  ]) {
    const res = await app.inject({ method, url, headers, payload });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
    assert.deepEqual(res.json(), { error: 'unauthorized' });
  }

  assert.deepEqual(
    db.prepare(terminalShape).get('M2TERM01'),
    before,
    'the foreign terminal row is untouched',
  );

  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/terminals/M2TERM01/config', headers: authHeaders() }))
      .statusCode,
    200,
    'the operator still reads the foreign terminal',
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/heartbeat',
        headers: authHeaders(),
        payload: { terminal_id: 'M2TERM01' },
      })
    ).statusCode,
    200,
    'the operator still heartbeats the foreign terminal',
  );
});

test('G01: the terminal token still reaches its own config, lifecycle and heartbeat', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, terminalToken } = ctx;
  const headers = authHeaders(terminalToken);

  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/terminals/TOKENA01/config', headers })).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/terminals/TOKENA01/config',
        headers,
        payload: { display_enabled: false, display_timeout_seconds: 20 },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: '/api/terminals/TOKENA01',
        headers,
        payload: { label: 'Till 1' },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/heartbeat',
        headers,
        payload: { terminal_id: 'TOKENA01' },
      })
    ).statusCode,
    200,
  );
});

test('G01 probe: GET /api/merchants/:id is not a route (404, no data leak)', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app } = ctx;

  // The task brief lists `GET /api/merchants/:id`; the implementation has no
  // such route. This pins that absence (gap report) rather than asserting 401.
  for (const headers of [authHeaders(), authHeaders(ctx.terminalToken)]) {
    const res = await app.inject({ method: 'GET', url: '/api/merchants/M2', headers });
    assert.equal(res.statusCode, 404);
    assert.ok(!res.body.includes('ChIJ_M2'), 'the 404 leaks no merchant data');
  }
});
