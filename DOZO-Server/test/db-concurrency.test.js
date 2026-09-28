import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../src/db.js';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_MODULE_URL = pathToFileURL(join(PROJECT_DIR, 'src/db.js')).href;
const LATEST_VERSION = Math.max(...MIGRATIONS.map((migration) => migration.version));

const WORKER_SOURCE = `
import { existsSync, writeFileSync } from 'node:fs';
import { openDatabase } from ${JSON.stringify(DB_MODULE_URL)};

const [dbPath, readyPath, goPath] = process.argv.slice(2);

// Park at the gate so every worker calls openDatabase at the same time.
writeFileSync(readyPath, 'ready');
const deadline = Date.now() + 15000;
while (!existsSync(goPath)) {
  if (Date.now() > deadline) {
    console.error('gate timeout');
    process.exit(2);
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
}

try {
  const db = openDatabase(dbPath);
  const merchants = db
    .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'merchants'")
    .get().c;
  const version = db.pragma('user_version', { simple: true });
  const integrity = db.pragma('integrity_check', { simple: true });
  db.close();
  if (merchants !== 1 || version < ${LATEST_VERSION} || integrity !== 'ok') {
    console.error(\`bad schema: merchants=\${merchants} version=\${version} integrity=\${integrity}\`);
    process.exit(3);
  }
  process.exit(0);
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}
`;

function writeWorker(dir) {
  const workerPath = join(dir, 'migrate-worker.mjs');
  writeFileSync(workerPath, WORKER_SOURCE);
  return workerPath;
}

async function waitForFile(path, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function waitForExit(child) {
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  return new Promise((resolveExit) => {
    child.on('exit', (code, signal) => resolveExit({ code, signal, stderr }));
  });
}

/**
 * The pre-fix failure (two processes migrating one fresh DB race on migration
 * 1's non-idempotent `CREATE TABLE merchants`) is exercised by releasing a
 * barrier so every worker calls openDatabase together. No sleep-and-hope: the
 * parent only releases once all workers are parked at the gate.
 */
test('concurrent processes migrating one fresh DB all succeed with one schema', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-migrate-race-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const workerPath = writeWorker(dir);

  const WORKERS = 3;
  const ROUNDS = 3;

  for (let round = 0; round < ROUNDS; round += 1) {
    const dbPath = join(dir, `dozo-${round}.db`);
    const goPath = join(dir, `go-${round}`);
    const readyPaths = [];
    const children = [];

    for (let i = 0; i < WORKERS; i += 1) {
      const readyPath = join(dir, `ready-${round}-${i}`);
      readyPaths.push(readyPath);
      children.push(
        spawn(process.execPath, [workerPath, dbPath, readyPath, goPath], {
          stdio: ['ignore', 'ignore', 'pipe'],
        }),
      );
    }

    await Promise.all(readyPaths.map((readyPath) => waitForFile(readyPath)));
    writeFileSync(goPath, 'go');

    const exits = await Promise.all(children.map(waitForExit));
    for (const { code, signal, stderr } of exits) {
      assert.equal(code, 0, `worker exited ${code ?? signal} on round ${round}\n${stderr}`);
    }

    const db = new Database(dbPath);
    try {
      assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
      assert.equal(
        db
          .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'merchants'")
          .get().c,
        1,
        'exactly one merchants table on round ' + round,
      );
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    } finally {
      db.close();
    }
  }
});
