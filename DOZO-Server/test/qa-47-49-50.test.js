/**
 * Independent QA for SERVER-47-49-50 (branch feat/server-47-49-50).
 *
 * These specs are deliberately separate from the author's tests and aim at the
 * ways a wrong fix could still satisfy the happy path:
 *
 *   #47  windowed summary drops/keeps the wrong rows, boundary is off-by-one,
 *        merchant isolation is lost, or a no-scan terminal disappears.
 *   #49  seedDemo duplicates / fails to bind an unoccupied register / clobbers
 *        a register that is already bound to a different terminal.
 *   #50  `npm start` still boots the combined server (regression to #50's core
 *        intent) instead of the dashboard-only entrypoint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboardApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase, seedDemo } from '../src/db.js';
import { makeTestContext, authHeaders, TEST_TOKEN, TEST_TERMINAL_ID } from './helpers.js';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function insertScan(db, { id, terminalId = TEST_TERMINAL_ID, scannedAt }) {
  db.prepare(
    `INSERT INTO scans (id, terminal_id, scanned_at, user_agent)
     VALUES (?, ?, ?, 'QA')`,
  ).run(id, terminalId, scannedAt);
}

function insertTerminal(db, { terminalId, merchantId = 'M1', label, active = 1 }) {
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, ?, NULL, '2026-01-01T00:00:00.000Z')`,
  ).run(terminalId, merchantId, label, active);
}

async function get(app, url) {
  const res = await app.inject({ method: 'GET', url, headers: authHeaders() });
  assert.equal(res.statusCode, 200, `${url} -> ${res.statusCode}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// #47 — summary window
// ---------------------------------------------------------------------------

test('#47 summary boundary is inclusive at both ends and agrees with /scans and the series', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const since = '2026-01-02T00:00:00.000Z';
  const until = '2026-01-02T12:00:00.000Z';
  insertScan(db, { id: 1, scannedAt: '2026-01-01T23:59:59.999Z' }); // just before
  insertScan(db, { id: 2, scannedAt: since }); //       inclusive lower
  insertScan(db, { id: 3, scannedAt: until }); //       inclusive upper
  insertScan(db, { id: 4, scannedAt: '2026-01-02T12:00:00.001Z' }); // just after

  const window = `since=${since}&until=${until}`;
  const summary = await get(app, `/api/merchants/M1/summary?${window}`);
  assert.equal(summary.total_scans, 2, 'both exact boundaries are inside the window');
  assert.deepEqual(summary.scans_by_terminal, [
    { terminal_id: TEST_TERMINAL_ID, label: 'Front counter', scan_count: 2 },
  ]);

  // Same window on the scans route (ms-precise) must return the same two rows.
  const scans = await get(app, `/api/merchants/M1/scans?${window}`);
  assert.deepEqual(
    scans.map((row) => row.scanned_at),
    [until, since],
    'scans route returns exactly the two boundary scans',
  );

  // And the series route shares scanWindow(), so its counts must sum to the
  // summary total for the same window.
  const series = await get(app, `/api/merchants/M1/scans/series?${window}`);
  const seriesTotal = series.reduce((sum, bucket) => sum + bucket.count, 0);
  assert.equal(seriesTotal, summary.total_scans, 'series and summary agree on the window');
});

test('#47 summary honours since-only and until-only windows independently', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertScan(db, { id: 1, scannedAt: '2026-01-01T01:00:00.000Z' });
  insertScan(db, { id: 2, scannedAt: '2026-01-02T01:00:00.000Z' });
  insertScan(db, { id: 3, scannedAt: '2026-01-03T01:00:00.000Z' });

  const bare = await get(app, '/api/merchants/M1/summary');
  assert.equal(bare.total_scans, 3, 'baseline is unwindowed');

  const sinceOnly = await get(app, '/api/merchants/M1/summary?since=2026-01-02T00:00:00.000Z');
  assert.equal(sinceOnly.total_scans, 2, 'since drops everything before it');

  const untilOnly = await get(app, '/api/merchants/M1/summary?until=2026-01-02T00:00:00.000Z');
  assert.equal(untilOnly.total_scans, 1, 'until keeps only the single included scan');

  // One-sided windows must still list the terminal (LEFT JOIN), even with no hits.
  assert.equal(sinceOnly.scans_by_terminal[0].terminal_id, TEST_TERMINAL_ID);
  assert.equal(untilOnly.scans_by_terminal[0].terminal_id, TEST_TERMINAL_ID);
});

test('#47 a full-range window is identical to the no-params baseline', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });
  insertTerminal(db, { terminalId: 'TERM0002', label: 'Back counter' });
  insertScan(db, { id: 1, scannedAt: '2026-01-01T01:00:00.000Z' });
  insertScan(db, { id: 2, terminalId: 'TERM0002', scannedAt: '2026-01-05T01:00:00.000Z' });

  const bare = await get(app, '/api/merchants/M1/summary');
  const fullRange = await get(
    app,
    '/api/merchants/M1/summary?since=2000-01-01T00:00:00.000Z&until=2999-01-01T00:00:00.000Z',
  );

  assert.deepEqual(fullRange, bare, 'windowed path preserves the exact unwindowed payload');
});

test('#47 an empty window lists every bound terminal, even one with no scans', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });
  insertTerminal(db, { terminalId: 'TERM0002', label: 'No scans' });
  insertScan(db, { id: 1, scannedAt: '2026-01-01T01:00:00.000Z' });

  const body = await get(app, '/api/merchants/M1/summary?since=2026-02-01T00:00:00.000Z');
  assert.equal(body.total_scans, 0);
  assert.equal(body.terminal_count, 2, 'zeroed rows are still terminals');
  assert.deepEqual(body.scans_by_terminal, [
    { terminal_id: TEST_TERMINAL_ID, label: 'Front counter', scan_count: 0 },
    { terminal_id: 'TERM0002', label: 'No scans', scan_count: 0 },
  ]);
});

test('#47 windowed summary is scoped to the queried merchant', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  // M2, with its own terminal and a scan inside the same window.
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M2', 'ChIJ_OTHER', '2026-01-01T00:00:00.000Z');
  insertTerminal(db, { terminalId: 'TERM0009', merchantId: 'M2', label: 'M2 terminal' });

  insertScan(db, { id: 1, scannedAt: '2026-01-02T01:00:00.000Z' }); // M1, in window
  insertScan(db, { id: 2, scannedAt: '2026-01-09T01:00:00.000Z' }); // M1, out of window
  insertScan(db, { id: 3, terminalId: 'TERM0009', scannedAt: '2026-01-02T02:00:00.000Z' }); // M2, in window

  const body = await get(
    app,
    '/api/merchants/M1/summary?since=2026-01-02T00:00:00.000Z&until=2026-01-03T00:00:00.000Z',
  );
  assert.equal(body.total_scans, 1, "M1's window excludes out-of-window and M2 scans");
  assert.deepEqual(body.scans_by_terminal, [
    { terminal_id: TEST_TERMINAL_ID, label: 'Front counter', scan_count: 1 },
  ]);
  assert.equal(body.terminal_count, 1, "M2's terminal is not listed");
});

// ---------------------------------------------------------------------------
// #49 — seedDemo register
// ---------------------------------------------------------------------------

function withTempDb(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-seed-'));
  const db = openDatabase(join(dir, 'dozo.db'));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

test('#49 seedDemo gives a fresh DB exactly one bound, active register served by the route', async (t) => {
  const db = withTempDb(t);
  seedDemo(db);
  seedDemo(db);
  seedDemo(db);

  const rows = db
    .prepare('SELECT merchant_id, label, terminal_id, active FROM registers WHERE merchant_id = ?')
    .all('demo-merchant');
  assert.equal(rows.length, 1, 'exactly one demo register after repeated seeds');
  assert.deepEqual(rows[0], {
    merchant_id: 'demo-merchant',
    label: 'Demo terminal',
    terminal_id: 'DEMOTERM01',
    active: 1,
  });

  const terminals = db
    .prepare('SELECT COUNT(*) AS total FROM terminals WHERE terminal_id = ?')
    .get('DEMOTERM01').total;
  assert.equal(terminals, 1, 'the terminal itself is not duplicated');

  // Drive the real route so a schema/casing mistake cannot hide behind SQL.
  const config = loadConfig({
    API_TOKEN: TEST_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    GOOGLE_REVIEW_BASE: 'https://search.google.com/local/writereview',
  });
  const app = buildDashboardApp({ db, config });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/demo-merchant/registers',
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 200, res.payload);
  const registers = res.json();
  assert.equal(registers.length, 1);
  assert.equal(registers[0].terminal_id, 'DEMOTERM01');
  assert.equal(registers[0].active, true);
  assert.match(registers[0].static_review_url ?? '', /placeid=/);
});

test('#49 seedDemo binds a pre-existing unoccupied demo register without duplicating it', async (t) => {
  const db = withTempDb(t);
  // Simulate a register created up-front (e.g. via a setup code) before seeding.
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('demo-merchant', 'ChIJ_SEED', '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, NULL, 1, ?)`,
  ).run('demo-merchant', 'Demo terminal', '2026-01-01T00:00:00.000Z');

  seedDemo(db);

  const rows = db
    .prepare('SELECT terminal_id, active FROM registers WHERE merchant_id = ? AND label = ?')
    .all('demo-merchant', 'Demo terminal');
  assert.equal(rows.length, 1, 'the unoccupied register is reused, not duplicated');
  assert.equal(rows[0].terminal_id, 'DEMOTERM01', 'the unoccupied register is bound');
  assert.equal(rows[0].active, 1);
});

test('#49 seedDemo never re-binds a register already occupied by another terminal', async (t) => {
  const db = withTempDb(t);
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('demo-merchant', 'ChIJ_SEED', '2026-01-01T00:00:00.000Z');
  insertTerminal(db, { terminalId: 'OTHER0001', merchantId: 'demo-merchant', label: 'Other' });
  db.prepare(
    `INSERT INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  ).run('demo-merchant', 'Demo terminal', 'OTHER0001', '2026-01-01T00:00:00.000Z');

  seedDemo(db);

  const rows = db
    .prepare('SELECT terminal_id FROM registers WHERE merchant_id = ? AND label = ?')
    .all('demo-merchant', 'Demo terminal');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].terminal_id, 'OTHER0001', 'an occupied register is left untouched');
});

// ---------------------------------------------------------------------------
// #50 — entrypoints
// ---------------------------------------------------------------------------

test('#50 no npm script runs the combined src/server.js and every entrypoint exists', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, 'package.json'), 'utf8'));
  const scripts = pkg.scripts;
  assert.equal(scripts.start, 'node src/dashboard.js');
  assert.equal(scripts.dev, 'node --watch src/dashboard.js');
  assert.equal(scripts['start:all'], 'node scripts/start-all.js');

  for (const [name, command] of Object.entries(scripts)) {
    assert.doesNotMatch(command, /src\/server\.js/, `scripts.${name} must not run the combined server`);
  }

  // The node entrypoints referenced by the scripts must resolve to real files.
  const entrypoints = readdirSync(join(PROJECT_DIR, 'src'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => `src/${file}`);
  for (const entrypoint of ['src/dashboard.js', 'src/connector.js', 'src/server.js']) {
    assert.ok(entrypoints.includes(entrypoint), `${entrypoint} exists`);
  }
});

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForHealth(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function killTree(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

test('#50 npm start boots the dashboard entrypoint only (no redirect surface)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-npmstart-'));
  const port = await freePort();

  const launcher = spawn('npm', ['start'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: join(dir, 'dozo.db'),
      DASHBOARD_DIST_PATH: join(dir, 'no-dist'),
      SEED_DEMO: 'true',
      API_TOKEN: TEST_TOKEN,
      npm_config_loglevel: 'silent',
    },
  });
  let output = '';
  launcher.stdout.on('data', (chunk) => (output += chunk));
  launcher.stderr.on('data', (chunk) => (output += chunk));

  t.after(async () => {
    if (launcher.exitCode === null && launcher.signalCode === null) {
      killTree(launcher, 'SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 500));
      killTree(launcher, 'SIGKILL');
    }
    rmSync(dir, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  assert.ok(await waitForHealth(`${base}/health`), `npm start is healthy on :${port}\n${output}`);

  const api = await fetch(`${base}/api/merchants`, { headers: { 'x-api-token': TEST_TOKEN } });
  assert.equal(api.status, 200, 'npm start serves the dashboard API');

  // Pre-#50 `npm start` ran src/server.js, the combined app, which mounted /r.
  const redirect = await fetch(`${base}/r/DEMOTERM01`, { redirect: 'manual' });
  assert.equal(redirect.status, 404, 'npm start does not mount the connector redirect');
});
