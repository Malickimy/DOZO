/**
 * Independent QA for issue #88 — "Server: canonical unified production
 * entrypoint".
 *
 * `src/server.js` becomes the canonical production entrypoint: one imported
 * factory, one main guard, one SQLite connection, the combined public +
 * protected surface on one listener, and a clean SIGINT/SIGTERM shutdown.
 * This spec reproduces each acceptance criterion against the real process
 * rather than trusting the implementation summary:
 *
 *   AC1  importing the module binds no port and opens no database.
 *   AC2  `npm start` serves `/health`, the guarded `/api/*` routes and the
 *        public `/r/:terminal_id` redirect from one process.
 *   AC3  SIGINT and SIGTERM each close the server and DB and release the port.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../src/server.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { TEST_TOKEN } from './helpers.js';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = join(PROJECT_DIR, 'src', 'server.js');
const SERVER_MODULE_URL = pathToFileURL(SERVER_ENTRY).href;
const GOOGLE_REVIEW_BASE = 'https://search.google.com/local/writereview';

/** Ask the OS for a currently-free ephemeral port. */
async function freePort() {
  const server = createNetServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** True once nothing is listening on `port` any more. */
async function portReleased(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const free = await new Promise((resolveBind) => {
      const probe = createNetServer();
      probe.once('error', () => resolveBind(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolveBind(true)));
    });
    if (free) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
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

function waitForExit(child, timeoutMs = 8000) {
  return Promise.race([
    new Promise((resolveExit) =>
      child.on('exit', (code, signal) => resolveExit({ code, signal })),
    ),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout({ timeout: true }), timeoutMs)),
  ]);
}

// ---------------------------------------------------------------------------
// AC1 — import safety
// ---------------------------------------------------------------------------

test('#88 importing src/server.js binds no port and opens no database', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa88-import-'));
  const port = await freePort();
  const dbPath = join(dir, 'import-should-not-create.db');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // A fresh module context (new process) proves the *module scope* is inert:
  // with SEED_DEMO=true and a real DB_PATH/PORT in the env, a regression that
  // runs `start()` on import would open the DB and win the port before the probe.
  const script = `
    const { existsSync } = await import('node:fs');
    const { createServer } = await import('node:net');
    const mod = await import(process.env.SERVER_MODULE_URL);
    await new Promise((r) => setTimeout(r, 300));
    const factory = typeof mod.createServer === 'function';
    const dbAbsent = !existsSync(process.env.DB_PATH);
    const probe = createServer();
    const free = await new Promise((resolve) => {
      probe.once('error', (error) => resolve(error.code));
      probe.listen(Number(process.env.PORT), '127.0.0.1', () => resolve(true));
    });
    if (free === true) await new Promise((resolve) => probe.close(resolve));
    const ok = factory && dbAbsent && free === true;
    process.stdout.write(
      JSON.stringify({ factory, dbAbsent, portFree: free === true }),
      () => process.exit(ok ? 0 : 1),
    );
  `;

  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      SERVER_MODULE_URL,
      DB_PATH: dbPath,
      PORT: String(port),
      SEED_DEMO: 'true',
      API_TOKEN: TEST_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));

  const exit = await waitForExit(child);
  assert.equal(
    exit.code,
    0,
    `import probe exited ${JSON.stringify(exit)}\nstdout:${stdout}\nstderr:${stderr}`,
  );

  const probe = JSON.parse(stdout.trim());
  assert.equal(probe.factory, true, 'createServer is exported from src/server.js');
  assert.equal(probe.dbAbsent, true, 'importing the module opens no SQLite database');
  assert.equal(probe.portFree, true, 'importing the module does not bind a listener');
  assert.equal(existsSync(dbPath), false, 'the temp DB file is still absent after import');
});

// The in-process import at the top of this file already ran inside the test
// process; assert its shape explicitly and prove the factory reuses an injected
// connection instead of opening a second one.
test('#88 createServer reuses an injected connection (single DB open)', async (t) => {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    API_TOKEN: TEST_TOKEN,
    DB_PATH: ':memory:',
    SEED_DEMO: 'false',
  });
  const app = await createServer({ db, config, logger: false });
  t.after(async () => {
    await app.close();
    db.close();
  });

  assert.equal(app.db, db, 'the factory mounts the injected connection, opening no second one');

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200, 'the imported module is fully functional');
});

test('#88 createServer opens exactly one database file at the configured path', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa88-db-'));
  const dbPath = join(dir, 'unified.db');
  const config = loadConfig({
    API_TOKEN: TEST_TOKEN,
    DB_PATH: dbPath,
    SEED_DEMO: 'true',
  });
  const app = await createServer({ config, logger: false });
  t.after(async () => {
    await app.close();
    app.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  assert.ok(existsSync(dbPath), 'the factory created the configured database file');
  assert.deepEqual(
    readdirSync(dir).filter((name) => name.endsWith('.db')),
    ['unified.db'],
    'exactly one database file exists (no second connection)',
  );

  // The seed ran through that same connection, and both surfaces are mounted.
  const merchants = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: { 'x-api-token': TEST_TOKEN },
  });
  assert.equal(merchants.statusCode, 200);
  assert.equal(merchants.json().length, 1, 'seedDemo used the factory connection');

  const redirect = await app.inject({ method: 'GET', url: '/r/DEMOTERM01' });
  assert.equal(redirect.statusCode, 302, 'the factory mounts the combined surface');
});

// ---------------------------------------------------------------------------
// AC2 — combined one-process routes via `npm start`
// ---------------------------------------------------------------------------

test('#88 npm start serves health, guarded API and the public redirect on one process', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa88-combined-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;

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

  assert.ok(await waitForHealth(`${base}/health`), `npm start healthy on :${port}\n${output}`);

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200, 'the unified process serves /health');
  assert.deepEqual(await health.json(), { status: 'ok' });

  const denied = await fetch(`${base}/api/merchants`);
  assert.equal(denied.status, 401, 'protected /api/* without a token stays guarded');

  const merchants = await fetch(`${base}/api/merchants`, {
    headers: { 'x-api-token': TEST_TOKEN },
  });
  assert.equal(merchants.status, 200, 'protected /api/* with the operator token succeeds');

  // Same origin/port as /health and /api/*: #88 combines the public redirect
  // surface onto the one process (reversing #50's dashboard-only default).
  const redirect = await fetch(`${base}/r/DEMOTERM01`, { redirect: 'manual' });
  assert.equal(redirect.status, 302, 'the public /r/:terminal_id redirect is mounted');
  assert.match(
    redirect.headers.get('location') ?? '',
    new RegExp(`^${GOOGLE_REVIEW_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?placeid=`),
    'the redirect targets the Google review form',
  );
});

// ---------------------------------------------------------------------------
// AC3 — clean shutdown on SIGINT and SIGTERM
// ---------------------------------------------------------------------------

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`#88 the unified entrypoint exits 0 and releases the port on ${signal}`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'dozo-qa88-shutdown-'));
    const port = await freePort();

    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: PROJECT_DIR,
      detached: true, // own process group so the signal reaches the real server
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(port),
        DB_PATH: join(dir, 'dozo.db'),
        SEED_DEMO: 'true',
        API_TOKEN: TEST_TOKEN,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        killTree(child, 'SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      rmSync(dir, { recursive: true, force: true });
    });

    assert.ok(
      await waitForHealth(`http://127.0.0.1:${port}/health`),
      `entrypoint healthy on :${port}\n${output}`,
    );

    killTree(child, signal);
    const exit = await waitForExit(child);
    assert.equal(exit.timeout, undefined, `entrypoint did not exit on ${signal}\n${output}`);
    assert.equal(
      exit.code,
      0,
      `entrypoint exited 0 on ${signal} (${JSON.stringify(exit)})\n${output}`,
    );
    assert.ok(await portReleased(port), `port ${port} released after ${signal}`);
    assert.throws(
      () => process.kill(child.pid, 0),
      /ESRCH/,
      'no orphan server process remains after shutdown',
    );
  });
}
