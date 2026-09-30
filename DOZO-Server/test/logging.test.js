/**
 * Hardening I: structured logs. An accepted redirect scan and an accepted
 * connector ingest each emit one JSON line. Tests capture the logger stream
 * rather than scraping stdout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { buildApp, buildDashboardApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

const START = '2026-01-01T00:00:00.000Z';
const CONNECTOR_SECRET = 'logging-connector-secret';

function captureLogger() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: { level: 'info', stream }, lines };
}

function records(lines, event) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record.event === event);
}

function seed(db) {
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, START);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', START);
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('an accepted redirect scan emits a structured JSON log line', async (t) => {
  const db = openDatabase(':memory:');
  const config = loadConfig({ REDIRECT_DOMAIN: 'http://localhost:3000' });
  seed(db);
  const { logger, lines } = captureLogger();
  const app = buildApp({ db, config, now: () => new Date(START), logger });
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'Logging Test' },
  });
  assert.equal(res.statusCode, 302);

  await flush();
  const [record] = records(lines, 'scan.recorded');
  assert.ok(record, 'a scan.recorded line is emitted');
  assert.equal(record.terminal_id, TEST_TERMINAL_ID);
  assert.equal(record.merchant_id, 'M1');
  assert.equal(record.scanned_at, START);
  assert.equal(record.client_ip, '127.0.0.1');
  assert.equal(typeof record.event_id, 'string');
  assert.ok(record.event_id.length >= 32, 'the log carries the scan event_id');
});

test('an accepted connector ingest emits a structured JSON log line', async (t) => {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    DASHBOARD_CONNECTOR_SECRET: CONNECTOR_SECRET,
    REDIRECT_DOMAIN: 'http://localhost:3000',
  });
  seed(db);
  const { logger, lines } = captureLogger();
  const app = buildDashboardApp({ db, config, logger });
  t.after(() => {
    app.close();
    db.close();
  });

  const body = {
    event_id: 'log-evt-1',
    terminal_id: TEST_TERMINAL_ID,
    merchant_id: 'M1',
    scanned_at: '2026-01-01T10:00:00.000Z',
    user_agent: 'Logging Test',
  };
  const first = await app.inject({
    method: 'POST',
    url: '/scans',
    headers: { 'x-connector-secret': CONNECTOR_SECRET },
    payload: body,
  });
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), { status: 'accepted' });

  const duplicate = await app.inject({
    method: 'POST',
    url: '/scans',
    headers: { 'x-connector-secret': CONNECTOR_SECRET },
    payload: body,
  });
  assert.deepEqual(duplicate.json(), { status: 'duplicate' });

  await flush();
  const ingest = records(lines, 'scan.ingested');
  assert.equal(ingest.length, 2, 'both the accepted and duplicate ingests are logged');
  assert.equal(ingest[0].status, 'accepted');
  assert.equal(ingest[0].event_id, 'log-evt-1');
  assert.equal(ingest[1].status, 'duplicate');
});
