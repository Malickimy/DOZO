import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

const EXPECTED_LOCATION = `https://search.google.com/local/writereview?placeid=${TEST_PLACE_ID}`;

function scanCount(db, terminalId = TEST_TERMINAL_ID) {
  return db.prepare('SELECT COUNT(*) AS c FROM scans WHERE terminal_id = ?').get(terminalId).c;
}

test('302 redirect to Google review with correct Location and one scan row', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'Mozilla/5.0 (Test Phone)' },
  });

  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, EXPECTED_LOCATION);
  assert.equal(scanCount(db), 1);

  const row = db.prepare('SELECT * FROM scans WHERE terminal_id = ?').get(TEST_TERMINAL_ID);
  assert.equal(row.terminal_id, TEST_TERMINAL_ID);
  assert.equal(row.user_agent, 'Mozilla/5.0 (Test Phone)');
  assert.match(row.scanned_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('debounce suppresses a duplicate scan within 120s for same IP + User-Agent', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const headers = { 'user-agent': 'Mozilla/5.0 (Test Phone)' };
  const first = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}`, headers });
  const second = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}`, headers });

  assert.equal(first.statusCode, 302);
  assert.equal(second.statusCode, 302);
  assert.equal(second.headers.location, EXPECTED_LOCATION);
  assert.equal(scanCount(db), 1, 'duplicate within window must not insert');
});

test('debounce still redirects but records a new scan after the 120s window', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const headers = { 'user-agent': 'Mozilla/5.0 (Test Phone)' };
  await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}`, headers });
  assert.equal(scanCount(db), 1);

  clock.advanceMs(121_000);
  const res = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}`, headers });

  assert.equal(res.statusCode, 302);
  assert.equal(scanCount(db), 2, 'new scan allowed after TTL expiry');
});

test('a different User-Agent is not debounced', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'PhoneA' },
  });
  await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'PhoneB' },
  });

  assert.equal(scanCount(db), 2);
});

test('unknown terminal returns 404 and writes no scan', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({ method: 'GET', url: '/r/NOPE9999' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'unknown_terminal', terminal_id: 'NOPE9999' });
  assert.equal(scanCount(db, 'NOPE9999'), 0);
});

test('inactive terminal returns 404 and writes no scan', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  db.prepare('UPDATE terminals SET active = 0 WHERE terminal_id = ?').run(TEST_TERMINAL_ID);
  const res = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}` });

  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'inactive_terminal');
  assert.equal(scanCount(db), 0);
});

test('redirect route is public (no API token required)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({ method: 'GET', url: `/r/${TEST_TERMINAL_ID}` });
  assert.equal(res.statusCode, 302);
});
