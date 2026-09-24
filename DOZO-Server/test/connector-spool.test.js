import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConnectorApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createSpool } from '../src/lib/spool.js';
import { createForwarder } from '../src/lib/forwarder.js';
import { TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

function makeContext(spoolPath) {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    REDIRECT_DOMAIN: 'http://localhost:3000',
    DASHBOARD_CONNECTOR_SECRET: 'sekret',
    DASHBOARD_INGEST_URL: 'http://dashboard.test',
    CONNECTOR_SPOOL_PATH: spoolPath,
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

test('/r/:id dual-writes the scan locally and to the spool', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-spool-'));
  const { db, config } = makeContext(join(dir, 'spool.jsonl'));
  const app = buildConnectorApp({
    db,
    config,
    now: () => new Date('2026-01-01T10:00:00.000Z'),
  });
  const spool = createSpool({ filePath: config.connectorSpoolPath });
  app.decorate('spool', spool);
  t.after(() => {
    app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const res = await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'Mozilla/5.0 (Spool Test)' },
  });
  assert.equal(res.statusCode, 302);

  const row = db.prepare('SELECT event_id, scanned_at FROM scans').get();
  assert.ok(row.event_id, 'the local row carries an event_id');

  const entries = spool.readAll();
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    event_id: row.event_id,
    terminal_id: TEST_TERMINAL_ID,
    merchant_id: 'M1',
    scanned_at: '2026-01-01T10:00:00.000Z',
    user_agent: 'Mozilla/5.0 (Spool Test)',
  });
});

test('the forwarder POSTs spooled scans and keeps failures for retry', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-spool-'));
  const spool = createSpool({ filePath: join(dir, 'spool.jsonl') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  spool.append({ event_id: 'ok-1', terminal_id: TEST_TERMINAL_ID, merchant_id: 'M1' });
  spool.append({ event_id: 'fail-1', terminal_id: TEST_TERMINAL_ID, merchant_id: 'M1' });

  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (JSON.parse(options.body).event_id === 'fail-1') {
      throw new Error('boom');
    }
    return { ok: true, status: 202 };
  };
  const forwarder = createForwarder({
    spool,
    ingestUrl: 'http://dashboard.test/',
    secret: 'sekret',
    logger: { warn() {} },
    fetchImpl,
  });

  await forwarder.drain();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://dashboard.test/scans');
  assert.equal(calls[0].options.headers['x-connector-secret'], 'sekret');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    event_id: 'ok-1',
    terminal_id: TEST_TERMINAL_ID,
    merchant_id: 'M1',
  });

  const remaining = spool.readAll();
  assert.deepEqual(
    remaining.map((entry) => entry.event_id),
    ['fail-1'],
    'only the failed entry stays spooled',
  );
});
