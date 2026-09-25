import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTestContext,
  authHeaders,
  TEST_TERMINAL_ID,
  TEST_PLACE_ID,
} from './helpers.js';

function insertScan(db, { id, terminalId = TEST_TERMINAL_ID, scannedAt, userAgent = 'UA' }) {
  db.prepare(
    `INSERT INTO scans (id, terminal_id, scanned_at, user_agent)
     VALUES (?, ?, ?, ?)`,
  ).run(id, terminalId, scannedAt, userAgent);
}

test('GET /api/merchants lists merchants', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: authHeaders(),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].merchant_id, 'M1');
  assert.equal(body[0].google_place_id, 'ChIJ_TEST_PLACE_ID');
  assert.equal(body[0].created_at, '2026-01-01T00:00:00.000Z');
});

test('GET /api/merchants/:id/terminals reports scan_count and last_scan_at', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertScan(db, { id: 1, scannedAt: '2026-01-01T01:00:00.000Z' });
  insertScan(db, { id: 2, scannedAt: '2026-01-01T02:00:00.000Z' });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/terminals',
    headers: authHeaders(),
  });

  assert.equal(res.statusCode, 200);
  const terminals = res.json();
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].terminal_id, TEST_TERMINAL_ID);
  assert.equal(terminals[0].label, 'Front counter');
  assert.equal(terminals[0].active, true);
  assert.equal(terminals[0].scan_count, 2);
  assert.equal(terminals[0].last_scan_at, '2026-01-01T02:00:00.000Z');
  assert.equal(
    terminals[0].static_review_url,
    `https://search.google.com/local/writereview?placeid=${TEST_PLACE_ID}`,
  );
});

test('GET /api/merchants/:id/terminals returns zero counts without scans', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/terminals',
    headers: authHeaders(),
  });

  const terminals = res.json();
  assert.equal(terminals[0].scan_count, 0);
  assert.equal(terminals[0].last_scan_at, null);
});

test('GET /api/merchants/:id/summary aggregates scans per terminal', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertScan(db, { id: 1, scannedAt: '2026-01-01T01:00:00.000Z' });
  insertScan(db, { id: 2, scannedAt: '2026-01-01T02:00:00.000Z' });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/summary',
    headers: authHeaders(),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.merchant_id, 'M1');
  assert.equal(body.total_scans, 2);
  assert.equal(body.terminal_count, 1);
  assert.deepEqual(body.scans_by_terminal, [
    { terminal_id: TEST_TERMINAL_ID, label: 'Front counter', scan_count: 2 },
  ]);
});

test('GET /api/merchants/:id/scans filters by terminal, window and limit', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertScan(db, { id: 1, scannedAt: '2026-01-01T01:00:00.000Z', userAgent: 'A' });
  insertScan(db, { id: 2, scannedAt: '2026-01-02T01:00:00.000Z', userAgent: 'B' });
  insertScan(db, { id: 3, scannedAt: '2026-01-03T01:00:00.000Z', userAgent: 'C' });

  const all = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans',
    headers: authHeaders(),
  });
  assert.equal(all.json().length, 3);
  assert.equal(all.json()[0].id, 3, 'newest scan first');

  const limited = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans?limit=2',
    headers: authHeaders(),
  });
  assert.equal(limited.json().length, 2);

  const since = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans?since=2026-01-02T00:00:00.000Z',
    headers: authHeaders(),
  });
  assert.deepEqual(
    since.json().map((scan) => scan.id),
    [3, 2],
  );

  const until = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans?until=2026-01-02T00:00:00.000Z',
    headers: authHeaders(),
  });
  assert.deepEqual(
    until.json().map((scan) => scan.id),
    [1],
  );

  const otherTerminal = await app.inject({
    method: 'GET',
    url: `/api/merchants/M1/scans?terminal_id=${TEST_TERMINAL_ID}`,
    headers: authHeaders(),
  });
  assert.equal(otherTerminal.json().length, 3);

  const missingTerminal = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans?terminal_id=NOPE',
    headers: authHeaders(),
  });
  assert.equal(missingTerminal.json().length, 0);
});

test('GET /api/merchants/:id/scans defaults limit to 100 and caps at 1000', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const insert = db.prepare(
    `INSERT INTO scans (terminal_id, scanned_at, user_agent) VALUES (?, ?, 'UA')`,
  );
  const insertMany = db.transaction((count) => {
    for (let i = 0; i < count; i += 1) {
      insert.run(TEST_TERMINAL_ID, `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`);
    }
  });
  insertMany(150);

  const defaulted = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans',
    headers: authHeaders(),
  });
  assert.equal(defaulted.json().length, 100);

  const capped = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans?limit=5000',
    headers: authHeaders(),
  });
  assert.equal(capped.json().length, 150);

  const zero = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans?limit=0',
    headers: authHeaders(),
  });
  assert.equal(zero.json().length, 1);
});

test('GET /api/merchants/:id/scans/series buckets by Europe/Warsaw day', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  // Warsaw is UTC+1 in January: 23:30Z is already the next local day.
  insertScan(db, { id: 1, scannedAt: '2026-01-01T22:30:00.000Z' });
  insertScan(db, { id: 2, scannedAt: '2026-01-01T23:30:00.000Z' });
  insertScan(db, { id: 3, scannedAt: '2026-01-02T10:00:00.000Z' });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans/series',
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [
    { day: '2026-01-01', count: 1 },
    { day: '2026-01-02', count: 2 },
  ]);

  const filtered = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans/series?since=2026-01-01T23:00:00.000Z',
    headers: authHeaders(),
  });
  assert.deepEqual(filtered.json(), [{ day: '2026-01-02', count: 2 }]);
});

test('GET /api/merchants/:id/scans/series validates bucket and merchant', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const empty = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans/series',
    headers: authHeaders(),
  });
  assert.deepEqual(empty.json(), []);

  const badBucket = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/scans/series?bucket=hour',
    headers: authHeaders(),
  });
  assert.equal(badBucket.statusCode, 400);
  assert.equal(badBucket.json().error, 'invalid_bucket');

  const unknown = await app.inject({
    method: 'GET',
    url: '/api/merchants/NOPE/scans/series',
    headers: authHeaders(),
  });
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.json().error, 'unknown_merchant');
});

test('unknown merchant returns 404 across merchant routes', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  for (const [method, url] of [
    ['GET', '/api/merchants/NOPE/terminals'],
    ['GET', '/api/merchants/NOPE/summary'],
    ['GET', '/api/merchants/NOPE/scans'],
    ['PUT', '/api/merchants/NOPE/google-place-id'],
  ]) {
    const res = await app.inject({
      method,
      url,
      headers: authHeaders(),
      payload: method === 'PUT' ? { google_place_id: 'ChIJ' } : undefined,
    });
    assert.equal(res.statusCode, 404, `${method} ${url}`);
    assert.equal(res.json().error, 'unknown_merchant');
  }
});

test('PUT /api/merchants/:id/google-place-id updates and rejects blank', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const updated = await app.inject({
    method: 'PUT',
    url: '/api/merchants/M1/google-place-id',
    headers: authHeaders(),
    payload: { google_place_id: 'ChIJ_NEW' },
  });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.json(), { merchant_id: 'M1', google_place_id: 'ChIJ_NEW' });
  assert.equal(
    db.prepare('SELECT google_place_id FROM merchants WHERE merchant_id = ?').get('M1')
      .google_place_id,
    'ChIJ_NEW',
  );

  const blank = await app.inject({
    method: 'PUT',
    url: '/api/merchants/M1/google-place-id',
    headers: authHeaders(),
    payload: { google_place_id: '   ' },
  });
  assert.equal(blank.statusCode, 400);
  assert.equal(blank.json().error, 'invalid_google_place_id');

  const missing = await app.inject({
    method: 'PUT',
    url: '/api/merchants/M1/google-place-id',
    headers: authHeaders(),
    payload: {},
  });
  assert.equal(missing.statusCode, 400);
});

test('merchant routes require the API token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({ method: 'GET', url: '/api/merchants' });
  assert.equal(res.statusCode, 401);
});
