/**
 * Independent QA for Server Sprint 7 (Hardening I).
 *
 * The implementer's suites drive `app.inject` with an injected clock. These
 * tests instead boot a real Fastify server on a TCP port and speak HTTP so the
 * on-the-wire behaviour is proven: per-IP keying, `TRUST_PROXY` handling of
 * `X-Forwarded-For`, and the 429-before-auth ordering that keeps a rate-limited
 * client from ever being treated as a re-pair.
 *
 * Contract: contracts/http-api.md (rate limits + revocation, revised 2026-09-30).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { makeTestContext, authHeaders, TEST_TOKEN, TEST_PLACE_ID, TEST_TERMINAL_ID } from './helpers.js';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_SH = join(PROJECT_DIR, 'scripts', 'backup.sh');
const START = '2026-01-01T00:00:00.000Z';

/** Capture pino's JSON lines so we can assert on structured scan records. */
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

const flush = () => new Promise((resolve) => setImmediate(resolve));

function seedTerminal(db) {
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, START);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', START);
}

/** Boot the combined app on an ephemeral port against a temp file DB. */
async function boot({ env = {}, seed = seedTerminal } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-hardening-'));
  const db = openDatabase(join(dir, 'dozo.db'));
  seed(db);
  const config = loadConfig({
    API_TOKEN: TEST_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    RATE_LIMIT_REDIRECT_PER_MIN: '3',
    RATE_LIMIT_API_PER_MIN: '4',
    RATE_LIMIT_WINDOW_SECONDS: '60',
    ...env,
  });
  const { logger, lines } = captureLogger();
  const app = buildApp({ db, config, logger });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address();
  return {
    db,
    lines,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await app.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const redirect = (baseUrl, userAgent, xff) =>
  fetch(`${baseUrl}/r/${TEST_TERMINAL_ID}`, {
    redirect: 'manual',
    headers: { 'user-agent': userAgent, ...(xff ? { 'x-forwarded-for': xff } : {}) },
  });

// --- Rate limits on a real socket -------------------------------------------

test('real server: redirect 429 shape, no scan row/log, /health stays exempt', async (t) => {
  const ctx = await boot();
  t.after(ctx.close);

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await redirect(ctx.baseUrl, `QA-${i}`)).status, 302, `request ${i + 1}`);
  }

  const limited = await redirect(ctx.baseUrl, 'QA-limited');
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  assert.notEqual(limited.status, 401, 'a 429 is a backoff, never a re-pair trigger');
  assert.ok(limited.headers.get('retry-after'), 'the 429 advertises retry-after');

  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS c FROM scans').get().c, 3, 'no scan row on 429');

  await flush();
  assert.equal(records(ctx.lines, 'scan.recorded').length, 3, 'no scan.recorded line on 429');

  // The external monitor must keep getting 200s while the redirect bucket is full.
  for (let i = 0; i < 15; i += 1) {
    const health = await fetch(`${ctx.baseUrl}/health`);
    assert.equal(health.status, 200, `/health hit ${i + 1}`);
  }
});

test('real server: the /api/* limit precedes auth, so a flood is 429 not 401', async (t) => {
  const ctx = await boot();
  t.after(ctx.close);

  // Unauthenticated requests consume the /api bucket and get 401 within the limit.
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await fetch(`${ctx.baseUrl}/api/merchants`)).status, 401, `unauth ${i + 1}`);
  }

  const limited = await fetch(`${ctx.baseUrl}/api/merchants`);
  assert.equal(limited.status, 429, 'the over-limit request is throttled, not rejected');
  assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  assert.notEqual(limited.status, 401, 'an unauthenticated flood must never look like a re-pair');
});

test('real server: the redirect and /api buckets are independent', async (t) => {
  const ctx = await boot({ env: { RATE_LIMIT_REDIRECT_PER_MIN: '2', RATE_LIMIT_API_PER_MIN: '3' } });
  t.after(ctx.close);

  assert.equal((await redirect(ctx.baseUrl, 'a')).status, 302);
  assert.equal((await redirect(ctx.baseUrl, 'b')).status, 302);
  assert.equal((await redirect(ctx.baseUrl, 'c')).status, 429, 'redirect bucket exhausted');

  // A redirect flood must not eat the dashboard's /api budget.
  for (let i = 0; i < 3; i += 1) {
    const res = await fetch(`${ctx.baseUrl}/api/merchants`, {
      headers: { 'x-api-token': TEST_TOKEN },
    });
    assert.equal(res.status, 200, `api ${i + 1} within its own bucket`);
  }
  assert.equal(
    (await fetch(`${ctx.baseUrl}/api/merchants`, { headers: { 'x-api-token': TEST_TOKEN } }))
      .status,
    429,
  );
});

test('real server: TRUST_PROXY=true buckets distinct X-Forwarded-For clients', async (t) => {
  const ctx = await boot({ env: { TRUST_PROXY: 'true', RATE_LIMIT_REDIRECT_PER_MIN: '2' } });
  t.after(ctx.close);

  assert.equal((await redirect(ctx.baseUrl, 'a', '9.9.9.9')).status, 302);
  assert.equal((await redirect(ctx.baseUrl, 'b', '9.9.9.9')).status, 302);
  assert.equal((await redirect(ctx.baseUrl, 'c', '9.9.9.9')).status, 429, 'same client');
  assert.equal(
    (await redirect(ctx.baseUrl, 'd', '8.8.8.8')).status,
    302,
    'a different forwarded client has its own bucket',
  );
});

test('real server: TRUST_PROXY=false ignores X-Forwarded-For and keys the socket', async (t) => {
  const ctx = await boot({ env: { TRUST_PROXY: 'false', RATE_LIMIT_REDIRECT_PER_MIN: '2' } });
  t.after(ctx.close);

  assert.equal((await redirect(ctx.baseUrl, 'a', '9.9.9.9')).status, 302);
  assert.equal((await redirect(ctx.baseUrl, 'b', '8.8.8.8')).status, 302);
  assert.equal(
    (await redirect(ctx.baseUrl, 'c', '7.7.7.7')).status,
    429,
    'XFF is ignored without TRUST_PROXY, so one socket shares a bucket',
  );
});

// --- Revocation: the label branch + PUT config -------------------------------

async function redeem(app, label, terminalId) {
  const issued = await app.inject({
    method: 'POST',
    url: `/api/merchants/M1/registers/${encodeURIComponent(label)}/setup-code`,
    headers: authHeaders(),
  });
  assert.equal(issued.statusCode, 201, issued.body);
  const redeemed = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: authHeaders(),
    payload: { code: issued.json().code, terminal_id: terminalId },
  });
  assert.equal(redeemed.statusCode, 200, redeemed.body);
  return redeemed.json().api_token;
}

test('PATCH with a label change AND active:false still revokes (label branch)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeem(app, 'Till 1', 'TOKENA01');

  const patch = await app.inject({
    method: 'PATCH',
    url: '/api/terminals/TOKENA01',
    headers: authHeaders(),
    payload: { active: false, label: 'Back till' },
  });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(patch.json().label, 'Back till');
  assert.equal(patch.json().active, false);
  assert.equal(
    db.prepare('SELECT api_token_hash FROM terminals WHERE terminal_id = ?').get('TOKENA01')
      .api_token_hash,
    null,
    'the label branch also clears the token hash',
  );

  // PUT config is a "config" call and must 401 with the revoked token.
  const put = await app.inject({
    method: 'PUT',
    url: '/api/terminals/TOKENA01/config',
    headers: authHeaders(token),
    payload: { display_enabled: false },
  });
  assert.equal(put.statusCode, 401);
  assert.deepEqual(put.json(), { error: 'unauthorized' });

  // Revocation is per-terminal: the operator token is untouched.
  const operator = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/registers',
    headers: authHeaders(),
  });
  assert.equal(operator.statusCode, 200);
});

// --- Backup edge cases -------------------------------------------------------

function seedSource(dbPath) {
  const db = openDatabase(dbPath);
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, START);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', START);
  db.prepare(
    'INSERT INTO scans (terminal_id, scanned_at, user_agent, event_id) VALUES (?, ?, ?, ?)',
  ).run(TEST_TERMINAL_ID, START, 'QA', 'qa-evt-1');
  db.close();
}

function runBackup(env) {
  try {
    return { ok: true, out: execFileSync('bash', [BACKUP_SH], { env: { ...process.env, ...env }, encoding: 'utf8' }) };
  } catch (error) {
    return { ok: false, status: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function snapshotName(backupDir) {
  return readdirSync(backupDir).find((name) => /^dozo-\d{8}-\d{6}\.db$/.test(name));
}

test('backup.sh: BACKUP_RETENTION_DAYS=0 disables rotation', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-backup-'));
  const dbPath = join(dir, 'source.db');
  const backupDir = join(dir, 'backups');
  mkdirSync(backupDir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  seedSource(dbPath);
  const old = join(backupDir, 'dozo-20000101-000000.db');
  writeFileSync(old, 'stale');
  const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  utimesSync(old, longAgo, longAgo);

  const result = runBackup({ DB_PATH: dbPath, BACKUP_DIR: backupDir, BACKUP_RETENTION_DAYS: '0' });
  assert.ok(result.ok, result.out);
  assert.equal(existsSync(old), true, '0 disables age-based pruning');
  assert.ok(snapshotName(backupDir), 'the new snapshot is still written');
});

test('backup.sh: a missing source database exits 1 before writing anything', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-backup-'));
  const backupDir = join(dir, 'backups');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const result = runBackup({ DB_PATH: join(dir, 'does-not-exist.db'), BACKUP_DIR: backupDir });
  assert.equal(result.ok, false, 'the script must fail loudly');
  assert.equal(result.status, 1);
  assert.match(result.out, /database not found/);
  assert.equal(existsSync(backupDir), false, 'no directory is created on a missing DB');
});

test('backup.sh: DRY_RUN plans the snapshot but writes nothing', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa-backup-'));
  const dbPath = join(dir, 'source.db');
  const backupDir = join(dir, 'backups');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  seedSource(dbPath);

  const result = runBackup({ DB_PATH: dbPath, BACKUP_DIR: backupDir, DRY_RUN: '1' });
  assert.ok(result.ok, result.out);
  assert.match(result.out, /\[dry-run\]/);
  assert.equal(existsSync(backupDir), false, 'dry-run writes no snapshot');
});

test('backup.sh: the documented --help exits 0', () => {
  const out = execFileSync('bash', [BACKUP_SH, '--help'], { encoding: 'utf8' });
  assert.match(out, /Usage: backup\.sh/);
});

// --- Structured logs on rejected scans --------------------------------------

test('no scan.recorded log line for unknown or inactive terminals', async (t) => {
  const db = openDatabase(':memory:');
  const config = loadConfig({ REDIRECT_DOMAIN: 'http://localhost:3000' });
  seedTerminal(db);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 0, NULL, ?)`,
  ).run('TERMDEAD', 'M1', 'Retired', START);
  const { logger, lines } = captureLogger();
  const app = buildApp({ db, config, logger });
  t.after(() => {
    app.close();
    db.close();
  });

  const unknown = await app.inject({
    method: 'GET',
    url: '/r/NOSUCHTERM',
    headers: { 'user-agent': 'QA' },
  });
  assert.equal(unknown.statusCode, 404);

  const inactive = await app.inject({
    method: 'GET',
    url: '/r/TERMDEAD',
    headers: { 'user-agent': 'QA' },
  });
  assert.equal(inactive.statusCode, 404);

  await flush();
  assert.equal(records(lines, 'scan.recorded').length, 0, 'rejected scans are never logged');
});
