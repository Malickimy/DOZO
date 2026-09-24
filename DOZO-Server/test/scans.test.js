import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { buildDashboardApp } from '../src/app.js';
import { migrate, openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

const CONNECTOR_SECRET = 'connector-test-secret';
const SCAN = {
  event_id: 'evt-0001',
  terminal_id: TEST_TERMINAL_ID,
  merchant_id: 'M1',
  scanned_at: '2026-01-01T10:00:00.000Z',
  user_agent: 'Mozilla/5.0 (Ingest Test)',
};

function makeContext() {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    REDIRECT_DOMAIN: 'http://localhost:3000',
    DASHBOARD_CONNECTOR_SECRET: CONNECTOR_SECRET,
  });
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', '2026-01-01T00:00:00.000Z');
  return { db, config, app: buildDashboardApp({ db, config }) };
}

function post(app, body, headers = { 'x-connector-secret': CONNECTOR_SECRET }) {
  return app.inject({ method: 'POST', url: '/scans', headers, payload: body });
}

test('POST /scans requires the connector secret', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const missing = await post(app, SCAN, {});
  assert.equal(missing.statusCode, 401);

  const wrong = await post(app, SCAN, { 'x-connector-secret': 'nope' });
  assert.equal(wrong.statusCode, 401);
});

test('POST /scans accepts a new event and is idempotent on event_id', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const first = await post(app, SCAN);
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), { status: 'accepted' });

  const row = db
    .prepare('SELECT terminal_id, scanned_at, user_agent, event_id FROM scans WHERE event_id = ?')
    .get(SCAN.event_id);
  assert.equal(row.terminal_id, TEST_TERMINAL_ID);
  assert.equal(row.scanned_at, SCAN.scanned_at);
  assert.equal(row.user_agent, SCAN.user_agent);

  const second = await post(app, SCAN);
  assert.equal(second.statusCode, 202);
  assert.deepEqual(second.json(), { status: 'duplicate' });
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM scans').get().c, 1);
});

test('POST /scans rejects malformed payloads with 400', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  for (const bad of [
    { ...SCAN, event_id: '' },
    { ...SCAN, terminal_id: '' },
    { ...SCAN, merchant_id: '' },
    { ...SCAN, scanned_at: 'not-a-date' },
  ]) {
    const res = await post(app, bad);
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
    assert.equal(res.json().error, 'malformed');
  }
});

test('POST /scans drops an unknown terminal with 202 and no row', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await post(app, { ...SCAN, event_id: 'evt-unknown', terminal_id: 'NOPE0001' });
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.json(), { status: 'accepted' });
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM scans').get().c, 0);
});

test('migrate repairs scans.event_id when a v5 database skipped v4', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE merchants (merchant_id TEXT PRIMARY KEY, google_place_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE terminals (
      terminal_id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, label TEXT,
      active INTEGER NOT NULL DEFAULT 1, last_seen TEXT, created_at TEXT NOT NULL,
      display_enabled INTEGER NOT NULL DEFAULT 1, display_timeout_seconds INTEGER NOT NULL DEFAULT 15
    );
    CREATE TABLE scans (id INTEGER PRIMARY KEY AUTOINCREMENT, terminal_id TEXT, scanned_at TEXT, user_agent TEXT);
  `);
  db.pragma('user_version = 5');

  migrate(db);

  const columns = db.prepare('PRAGMA table_info(scans)').all().map((row) => row.name);
  assert.ok(columns.includes('event_id'), 'the missing column is reconciled');
  const index = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_scans_event_id'")
    .get();
  assert.ok(index, 'the unique event_id index is reconciled');
});

test('migration v4 makes scans.event_id unique', async (t) => {
  const { app, db } = makeContext();
  t.after(() => {
    app.close();
    db.close();
  });

  assert.ok(db.pragma('user_version', { simple: true }) >= 4);
  const insert = db.prepare(
    'INSERT INTO scans (terminal_id, scanned_at, user_agent, event_id) VALUES (?, ?, NULL, ?)',
  );
  insert.run(TEST_TERMINAL_ID, '2026-01-01T00:00:00.000Z', 'dup');
  assert.throws(() => insert.run(TEST_TERMINAL_ID, '2026-01-01T00:01:00.000Z', 'dup'));
});
