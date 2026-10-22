/**
 * Integrated QA for issue #96 — restart persistence on the unified runtime.
 *
 * The unified entrypoint (`src/server.js`) writes scans through the single
 * SQLite connection and closes it cleanly on SIGTERM. This spec proves the
 * acceptance criterion that previously had no explicit automated coverage:
 * a scan recorded before shutdown is still visible through the API after the
 * process is restarted against the same `DB_PATH`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_TOKEN } from './helpers.js';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = join(PROJECT_DIR, 'src', 'server.js');
const USER_AGENT = 'dozo-qa96-restart/1.0';

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
  // Attach the exit listener before the caller signals the child (and resolve
  // immediately if it already exited) so a fast exit can never be missed.
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit) => {
    let timer;
    const onExit = (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    };
    child.once('exit', onExit);
    timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolveExit({ timeout: true });
    }, timeoutMs);
    // Never keep the event loop alive for a timer that no longer matters.
    timer.unref?.();
  });
}

function startServer(port, dbPath, seedDemo) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      SEED_DEMO: seedDemo ? 'true' : 'false',
      DASHBOARD_DIST_PATH: join(PROJECT_DIR, '..', 'DOZO-Dashboard', 'dist-does-not-exist'),
      API_TOKEN: TEST_TOKEN,
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  return { child, readOutput: () => output };
}

async function scansFor(base) {
  const res = await fetch(`${base}/api/merchants/demo-merchant/scans?terminal_id=DEMOTERM01`, {
    headers: { 'x-api-token': TEST_TOKEN },
  });
  assert.equal(res.status, 200, 'scans API answers with the operator token');
  return res.json();
}

test('#96 a scan survives a SIGTERM restart on the same DB_PATH', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-qa96-restart-'));
  const dbPath = join(dir, 'dozo.db');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const children = [];

  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        killTree(child, 'SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  // First boot: seed the demo merchant/terminal and record one debounced scan.
  const first = startServer(port, dbPath, true);
  children.push(first.child);
  assert.ok(
    await waitForHealth(`${base}/health`),
    `first boot healthy on :${port}\n${first.readOutput()}`,
  );

  for (let hit = 1; hit <= 2; hit += 1) {
    const redirect = await fetch(`${base}/r/DEMOTERM01`, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT },
    });
    assert.equal(redirect.status, 302, `redirect hit ${hit} answers 302`);
  }

  const before = await scansFor(base);
  assert.equal(before.length, 1, 'two identical redirects record one scan');
  const eventId = before[0].event_id;
  assert.ok(eventId, 'the persisted scan carries an event_id');
  assert.ok(existsSync(dbPath), 'the unified database file exists');

  // Clean shutdown: the process must exit 0 so SQLite/WAL is flushed.
  // Attach the exit listener before signaling so a fast exit is not missed.
  const exitPromise = waitForExit(first.child);
  killTree(first.child, 'SIGTERM');
  const exit = await exitPromise;
  assert.equal(exit.timeout, undefined, `first boot did not exit on SIGTERM\n${first.readOutput()}`);
  assert.equal(exit.code, 0, `first boot exited 0 (${JSON.stringify(exit)})`);

  // Second boot: same DB_PATH, no reseed. The row must already be there.
  const second = startServer(port, dbPath, false);
  children.push(second.child);
  assert.ok(
    await waitForHealth(`${base}/health`),
    `restart healthy on :${port}\n${second.readOutput()}`,
  );

  const after = await scansFor(base);
  assert.equal(after.length, 1, 'the scan row is still present after restart');
  assert.equal(after[0].event_id, eventId, 'the same persisted event_id survives restart');
  assert.equal(after[0].terminal_id, 'DEMOTERM01', 'the persisted terminal_id survives restart');
});
