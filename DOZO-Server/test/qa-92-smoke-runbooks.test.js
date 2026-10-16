/**
 * Independent QA for issue #92 — "Server: update smoke scripts, Makefile, and
 * runbooks for unified runtime".
 *
 * Acceptance criteria:
 *   1. Scripts and Make targets start and probe ONE origin.
 *   2. Docs no longer describe two containers or the connector port.
 *
 * These assertions reproduce each criterion against the real files and the real
 * `make smoke` target rather than trusting the implementation summary:
 *
 *   - `bash -n` every changed script.
 *   - `smoke.sh` / `local-multiterminal.sh` carry no connector-port / second
 *     origin logic and share the one `$BASE_URL` origin.
 *   - the root `Makefile` `smoke` target boots one unified `src/server.js`,
 *     probes one origin, and tears down the temp DB.
 *   - `make smoke` actually boots, probes and cleans up (skipped when `make` is
 *     not installed).
 *   - `/r/:terminal_id` is served from the same origin as `/health` and the API.
 *   - the changed runbooks stop describing two containers / the connector port.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PROJECT_DIR, '..');
const SMOKE_SH = join(PROJECT_DIR, 'scripts', 'smoke.sh');
const MULTI_SH = join(PROJECT_DIR, 'scripts', 'local-multiterminal.sh');
const MAKEFILE = join(REPO_ROOT, 'Makefile');

const read = (file) => readFileSync(file, 'utf8');

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
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function portReleased(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const free = await new Promise((resolveBind) => {
      const probe = createNetServer();
      probe.once('error', () => resolveBind(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolveBind(true)));
    });
    if (free) return true;
    await new Promise((r) => setTimeout(r, 100));
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
    new Promise((resolveTimeout) =>
      setTimeout(() => resolveTimeout({ timeout: true }), timeoutMs),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// AC1 — scripts: bash -n and one-origin logic
// ---------------------------------------------------------------------------

test('#92 the changed scripts pass bash -n', () => {
  for (const script of [SMOKE_SH, MULTI_SH]) {
    const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(
      result.status,
      0,
      `bash -n ${script} failed:\n${result.stderr || result.stdout}`,
    );
  }
});

test('#92 smoke.sh has no connector-port / second-origin logic', () => {
  const text = read(SMOKE_SH);

  assert.doesNotMatch(text, /CONNECTOR_PORT|CONNECTOR_BASE_URL/, 'no connector env vars');
  assert.doesNotMatch(text, /:3001\b/, 'no connector port literal');
  assert.doesNotMatch(text, /start:all|start-all\.js/, 'no split launcher');
  assert.match(
    text,
    /BASE_URL="\$\{BASE_URL:-http:\/\/127\.0\.0\.1:3000\}"/,
    'defaults to the local unified origin',
  );

  // Exactly one origin is probed: one `GET /health` request against $BASE_URL.
  const probes = text.match(/GET \/health/g) ?? [];
  assert.equal(probes.length, 1, `expected a single GET /health probe, got ${probes.length}`);
  assert.match(
    text,
    /status="\$\(request GET \/health\)"/,
    'the single probe goes through the one $BASE_URL request helper',
  );
});

test('#92 local-multiterminal.sh starts one server and probes one origin', () => {
  const text = read(MULTI_SH);

  assert.doesNotMatch(text, /CONNECTOR_PORT|CONNECTOR_BASE_URL/, 'no connector env vars');
  assert.doesNotMatch(text, /:3001\b/, 'no connector port literal');
  assert.doesNotMatch(text, /start:all|start-all\.js/, 'no split launcher');
  assert.match(text, /node src\/server\.js/, 'boots the unified entrypoint');
  assert.match(
    text,
    /redirect_base_url = http:\/\/10\.0\.2\.2:\$PORT/,
    'the redirect points at the same port as the API',
  );

  // Every executable health probe is on the one $BASE_URL; no second origin.
  const probes = text
    .split(/\r?\n/)
    .filter((line) => line.includes('curl') && line.includes('/health'));
  assert.ok(probes.length >= 1, 'has at least one health probe');
  for (const line of probes) {
    assert.match(line, /\$BASE_URL\/health/, `health probe must use $BASE_URL: ${line.trim()}`);
  }
  assert.equal(
    /CONNECTOR(_BASE_URL)?\s*=/.test(text),
    false,
    'no second-origin variable is defined',
  );
});

// ---------------------------------------------------------------------------
// AC1 — Makefile: one-origin smoke target
// ---------------------------------------------------------------------------

test('#92 the Makefile smoke target boots one origin and cleans up', () => {
  const makefile = read(MAKEFILE);

  assert.match(makefile, /^smoke:$/m, 'a `smoke` target exists');
  assert.match(makefile, /^\.PHONY:.*\bsmoke\b/m, '`smoke` is phony');

  // server-dev no longer launches the split two-process launcher.
  assert.match(makefile, /^server-dev:\n\tcd \$\(SERVER_DIR\) && SEED_DEMO=true npm start$/m);
  assert.doesNotMatch(makefile, /start:all/, 'server-dev/smoke do not use the split launcher');

  // One origin, one port, one temp DB, one unified entrypoint, one probe script.
  assert.match(makefile, /PORT=\$\(SMOKE_PORT\)/, 'smoke binds SMOKE_PORT');
  assert.match(makefile, /DB_PATH=\$\(SMOKE_DB\)/, 'smoke uses a throwaway DB');
  assert.match(makefile, /node src\/server\.js/, 'smoke runs the unified entrypoint');
  assert.match(makefile, /scripts\/smoke\.sh/, 'smoke runs the smoke probe');
  assert.match(makefile, /rm -f \$\(SMOKE_DB\)/, 'smoke removes the temp DB on teardown');
  assert.doesNotMatch(makefile, /CONNECTOR|:3001\b|3001/, 'no connector port anywhere in the Makefile');

  // Help text advertises the unified server, not a connector :3001.
  const help = makefile.split(/\r?\n/).filter((line) => line.includes('@echo'));
  for (const line of help) {
    assert.doesNotMatch(line, /connector|:3001/, `help line still mentions the connector: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// AC1 — live `make smoke` end to end
// ---------------------------------------------------------------------------

test('#92 `make smoke` boots, probes one origin and leaves nothing behind', async (t) => {
  const probe = spawnSync('make', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    t.skip('make is not installed');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa92-make-'));
  const port = await freePort();
  const db = join(dir, 'smoke.db');
  const log = join(dir, 'smoke.log');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const result = spawnSync('make', ['smoke'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      SMOKE_PORT: String(port),
      SMOKE_DB: db,
      SMOKE_LOG: log,
    },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  assert.equal(result.status, 0, `make smoke exited ${result.status}\n${output}`);
  assert.match(output, /one unified origin: http:\/\/127\.0\.0\.1:/, 'probes the one origin');
  assert.match(output, /SMOKE: OK/, 'the smoke probe passed');

  // Teardown reached the temp DB and released the listener.
  assert.equal(existsSync(db), false, 'the throwaway DB was removed');
  assert.equal(existsSync(`${db}-wal`), false, 'the WAL file was removed');
  assert.ok(await portReleased(port), `port ${port} released after make smoke`);
});

// ---------------------------------------------------------------------------
// AC1 — the unified origin serves the public redirect too
// ---------------------------------------------------------------------------

test('#92 /r/:terminal_id answers on the same origin as /health and the API', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa92-origin-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: join(dir, 'dozo.db'),
      SEED_DEMO: 'true',
      API_TOKEN: 'dev-placeholder-token',
      DASHBOARD_DIST_PATH: join(dir, 'no-dist'),
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      killTree(child, 'SIGKILL');
      await new Promise((r) => setTimeout(r, 200));
    }
    rmSync(dir, { recursive: true, force: true });
  });

  assert.ok(await waitForHealth(`${base}/health`), `server healthy on :${port}\n${output}`);

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200, 'GET /health is on the origin');

  const setup = await fetch(
    `${base}/api/merchants/demo-merchant/registers/qa-92-till/setup-code`,
    { method: 'POST', headers: { 'x-api-token': 'dev-placeholder-token' } },
  );
  const setupBody = await setup.text();
  assert.equal(setup.status, 201, `setup-code on the same origin\n${setupBody}`);
  const { code } = JSON.parse(setupBody);

  const redeem = await fetch(`${base}/api/terminals/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-token': 'dev-placeholder-token' },
    body: JSON.stringify({ code, device_serial: 'QA92-SN-0001' }),
  });
  const redeemBody = await redeem.text();
  assert.equal(redeem.status, 200, `redeem on the same origin\n${redeemBody}`);

  const redirect = await fetch(`${base}/r/DEMOTERM01`, { redirect: 'manual' });
  assert.equal(redirect.status, 302, 'the public redirect is served on the same origin');
  assert.match(
    redirect.headers.get('location') ?? '',
    /^https:\/\/search\.google\.com\/local\/writereview\?placeid=/,
    'the redirect targets the Google review form',
  );

  // SIGTERM shuts down cleanly and leaves exactly one SQLite file.
  killTree(child, 'SIGTERM');
  const exit = await waitForExit(child);
  assert.equal(exit.code, 0, `clean SIGTERM exit (${JSON.stringify(exit)})\n${output}`);
  assert.ok(existsSync(join(dir, 'dozo.db')), 'the configured DB file exists');
});

// ---------------------------------------------------------------------------
// AC2 — runbooks stop describing two containers / the connector port
// ---------------------------------------------------------------------------

test('#92 the changed runbooks no longer describe two containers or :3001', () => {
  const docs = [
    join(REPO_ROOT, 'README.md'),
    join(REPO_ROOT, 'MANUAL.md'),
    join(PROJECT_DIR, 'README.md'),
  ];

  for (const doc of docs) {
    const text = read(doc);
    assert.doesNotMatch(text, /CONNECTOR_PORT/, `${doc} still names CONNECTOR_PORT`);
    assert.doesNotMatch(text, /\b3001\b/, `${doc} still names the connector port 3001`);
    assert.doesNotMatch(text, /\/data\/dashboard\.db/, `${doc} still names the dashboard DB`);
    assert.doesNotMatch(
      text,
      /\b(two|2) containers?\b/i,
      `${doc} still describes two containers`,
    );
    assert.doesNotMatch(
      text,
      /docker compose (exec|cp|ps -q) dashboard\b/,
      `${doc} still targets a "dashboard" compose service`,
    );
  }

  // The backup/restore runbook targets the one unified service + datastore.
  const manual = read(join(REPO_ROOT, 'MANUAL.md'));
  assert.match(manual, /docker compose exec server node scripts\/backup-snapshot\.js/);
  assert.match(manual, /--db \/data\/dozo\.db/);
});

// ---------------------------------------------------------------------------
// AC2 — package scripts + legacy split are left intact
// ---------------------------------------------------------------------------

test('#92 keeps the legacy split scripts and unified default untouched', () => {
  const pkg = JSON.parse(read(join(PROJECT_DIR, 'package.json')));
  assert.equal(pkg.scripts.start, 'node src/server.js', 'npm start stays unified');
  assert.equal(pkg.scripts.dev, 'node --watch src/server.js', 'npm run dev stays unified');
  assert.equal(pkg.scripts['start:all'], 'node scripts/start-all.js', 'legacy launcher kept');
  assert.equal(pkg.scripts['start:connector'], 'node src/connector.js', 'legacy connector kept');
  assert.equal(pkg.scripts['start:dashboard'], 'node src/dashboard.js', 'legacy dashboard kept');

  // The split launcher itself is untouched.
  const launcher = read(join(PROJECT_DIR, 'scripts', 'start-all.js'));
  assert.match(launcher, /CONNECTOR_PORT/, 'the legacy launcher still owns the connector port');
  assert.match(launcher, /src\/connector\.js/);
  assert.match(launcher, /src\/dashboard\.js/);
});
