/**
 * Independent adversarial coverage for G03 (`POST /scans` unparseable/odd JSON
 * -> `400 {error:'malformed'}`) and G04 (inactive terminal -> `202 accepted`
 * with no scan row), plus the `/r/:terminal_id` dual-write and `/scans`
 * idempotency regressions the brief calls out.
 *
 * Distinct from the author's `scans.test.js`: this spec feeds JSON arrays and
 * scalars, probes the auth-ordering of the malformed mapping, proves the drop is
 * lifted when the terminal is reactivated, repeats inactive events, and drives
 * an end-to-end connector dual-write with a real spool file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, buildDashboardApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createSpool } from '../src/lib/spool.js';

const CONNECTOR_SECRET = 'qa-connector-secret';
const OPERATOR_TOKEN = 'qa-operator-token';
const ACTIVE = 'TERM0001';
const INACTIVE = 'TERMOFF01';
const START = '2026-01-01T00:00:00.000Z';

const SCAN = {
  event_id: 'evt-1',
  terminal_id: ACTIVE,
  merchant_id: 'M1',
  scanned_at: '2026-01-01T10:00:00.000Z',
  user_agent: 'QA-Adversarial',
};

function seedDb(db) {
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', 'ChIJ_M1', START);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(ACTIVE, 'M1', 'Front counter', START);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 0, NULL, ?)`,
  ).run(INACTIVE, 'M1', 'Retired till', START);
}

function makeContext(env = {}) {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    API_TOKEN: OPERATOR_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    DASHBOARD_CONNECTOR_SECRET: CONNECTOR_SECRET,
    ...env,
  });
  seedDb(db);
  return { db, config, app: buildDashboardApp({ db, config }) };
}

function connectorHeaders(contentType = 'application/json') {
  return { 'content-type': contentType, 'x-connector-secret': CONNECTOR_SECRET };
}

function ingest(app, payload) {
  return app.inject({ method: 'POST', url: '/scans', headers: connectorHeaders(), payload });
}

function scanCount(db, terminalId = null) {
  if (terminalId) {
    return db.prepare('SELECT COUNT(*) AS c FROM scans WHERE terminal_id = ?').get(terminalId).c;
  }
  return db.prepare('SELECT COUNT(*) AS c FROM scans').get().c;
}

test('G03: a raw non-JSON body with application/json is 400 malformed', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/scans',
    headers: connectorHeaders(),
    payload: '{"event_id": ',
  });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'malformed' });
  assert.equal(scanCount(db), 0);
});

test('G03: JSON arrays and scalars are 400 malformed, never accepted', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  for (const raw of ['[1,2,3]', '"hello"', '42', 'true', 'null', '']) {
    const res = await app.inject({
      method: 'POST',
      url: '/scans',
      headers: connectorHeaders(),
      payload: raw,
    });
    assert.equal(res.statusCode, 400, `body ${raw}`);
    assert.deepEqual(res.json(), { error: 'malformed' }, `body ${raw}`);
  }
  assert.equal(scanCount(db), 0, 'none of the odd bodies wrote a row');
});

test('G03 (flag): malformed bodies are rejected before the connector secret is checked', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  // Body parsing happens in Fastify before `preHandler`, so an unauthenticated
  // caller gets the parse verdict (400) rather than 401. No data leaks, but the
  // secret is not the first gate. Reported as an ordering question.
  const noSecret = await app.inject({
    method: 'POST',
    url: '/scans',
    headers: { 'content-type': 'application/json' },
    payload: '{ nope',
  });
  assert.equal(noSecret.statusCode, 400);
  assert.deepEqual(noSecret.json(), { error: 'malformed' });

  const wrongSecret = await app.inject({
    method: 'POST',
    url: '/scans',
    headers: { 'content-type': 'application/json', 'x-connector-secret': 'wrong' },
    payload: '{ nope',
  });
  assert.equal(wrongSecret.statusCode, 400);
  assert.equal(scanCount(db), 0);
});

test('G04: an inactive terminal is dropped with 202 and no row, then writes once reactivated', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const before = scanCount(db);
  const dropped = await ingest(app, { ...SCAN, event_id: 'evt-off-1', terminal_id: INACTIVE });
  assert.equal(dropped.statusCode, 202);
  assert.deepEqual(dropped.json(), { status: 'accepted' });
  assert.equal(scanCount(db, INACTIVE), 0, 'no row for the inactive terminal');
  assert.equal(scanCount(db), before, 'the total scan count is unchanged');

  const reactivate = await app.inject({
    method: 'PATCH',
    url: `/api/terminals/${INACTIVE}`,
    headers: { 'x-api-token': OPERATOR_TOKEN },
    payload: { active: true },
  });
  assert.equal(reactivate.statusCode, 200);

  const accepted = await ingest(app, { ...SCAN, event_id: 'evt-off-2', terminal_id: INACTIVE });
  assert.equal(accepted.statusCode, 202);
  assert.deepEqual(accepted.json(), { status: 'accepted' });
  assert.equal(scanCount(db, INACTIVE), 1, 'an active terminal writes again');
});

test('G04: repeated events for an inactive terminal stay accepted-and-dropped', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const body = { ...SCAN, event_id: 'evt-off-repeat', terminal_id: INACTIVE };
  for (let i = 0; i < 2; i += 1) {
    const res = await ingest(app, body);
    assert.equal(res.statusCode, 202, `attempt ${i + 1}`);
    assert.deepEqual(res.json(), { status: 'accepted' });
  }
  assert.equal(scanCount(db, INACTIVE), 0, 'even a repeat never materializes a row');
});

test('G04 regression: an unknown terminal is still dropped with 202 and no row', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await ingest(app, { ...SCAN, event_id: 'evt-ghost', terminal_id: 'GHOST001' });
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.json(), { status: 'accepted' });
  assert.equal(scanCount(db, 'GHOST001'), 0);
});

test('G04 regression: /scans idempotency on an active terminal is intact', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const first = await ingest(app, SCAN);
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), { status: 'accepted' });

  const duplicate = await ingest(app, SCAN);
  assert.equal(duplicate.statusCode, 202);
  assert.deepEqual(duplicate.json(), { status: 'duplicate' });
  assert.equal(scanCount(db), 1);
});

test('G04 regression: /r/:terminal_id still dual-writes locally and to the spool', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-spool-'));
  const db = openDatabase(':memory:');
  const config = loadConfig({
    API_TOKEN: OPERATOR_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    DASHBOARD_CONNECTOR_SECRET: CONNECTOR_SECRET,
    DASHBOARD_INGEST_URL: 'http://dashboard.test',
    CONNECTOR_SPOOL_PATH: join(dir, 'spool.jsonl'),
  });
  seedDb(db);
  const app = buildApp({ db, config, now: () => new Date('2026-01-01T10:00:00.000Z') });
  const spool = createSpool({ filePath: config.connectorSpoolPath });
  app.decorate('spool', spool);
  t.after(() => {
    app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const res = await app.inject({
    method: 'GET',
    url: `/r/${ACTIVE}`,
    headers: { 'user-agent': 'QA dual write' },
  });
  assert.equal(res.statusCode, 302);

  const row = db.prepare('SELECT event_id, scanned_at FROM scans').get();
  assert.ok(row.event_id, 'the local row still carries an event_id');

  const entries = spool.readAll();
  assert.equal(entries.length, 1, 'exactly one spool entry');
  assert.deepEqual(entries[0], {
    event_id: row.event_id,
    terminal_id: ACTIVE,
    merchant_id: 'M1',
    scanned_at: '2026-01-01T10:00:00.000Z',
    user_agent: 'QA dual write',
  });

  // An inactive terminal still 404s and writes nothing anywhere.
  const inactiveRes = await app.inject({ method: 'GET', url: `/r/${INACTIVE}` });
  assert.equal(inactiveRes.statusCode, 404);
  assert.equal(inactiveRes.json().error, 'inactive_terminal');
  assert.equal(spool.readAll().length, 1, 'the inactive attempt adds no spool entry');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM scans').get().c, 1);
});
