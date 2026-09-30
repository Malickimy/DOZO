import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import {
  DAYS,
  OFFLINE_TERMINAL,
  SCAN_TERMINALS,
  buildScanPlan,
  seedDemoData,
} from '../scripts/seed-demo.js';

const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function runScript(script, dbPath) {
  execFileSync(process.execPath, [join(projectDir, script)], {
    cwd: projectDir,
    env: { ...process.env, DB_PATH: dbPath },
    stdio: 'pipe',
  });
}

test('seedDemoData inserts the planned scans and one offline terminal', (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());

  const now = new Date('2026-06-15T12:00:00.000Z');
  const plan = buildScanPlan(now);
  seedDemoData(db, { now });

  const terminals = db
    .prepare(
      `SELECT terminal_id, label, active, last_seen
         FROM terminals
        WHERE merchant_id = ?
        ORDER BY terminal_id`,
    )
    .all('demo-merchant');
  assert.equal(
    terminals.length,
    SCAN_TERMINALS.length + 1,
    'one terminal per scan terminal plus the offline one',
  );

  for (const terminal of SCAN_TERMINALS) {
    const expected = plan.filter((row) => row.terminalId === terminal.terminalId).length;
    const actual = db
      .prepare('SELECT COUNT(*) AS total FROM scans WHERE terminal_id = ?')
      .get(terminal.terminalId).total;
    assert.equal(actual, expected, `${terminal.terminalId} scan count matches the plan`);
    assert.ok(expected >= DAYS, `${terminal.terminalId} has at least one scan per day`);
  }

  const offlineScans = db
    .prepare('SELECT COUNT(*) AS total FROM scans WHERE terminal_id = ?')
    .get(OFFLINE_TERMINAL.terminalId).total;
  assert.equal(offlineScans, 0, 'the offline terminal never scans');

  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const stale = db
    .prepare(
      `SELECT terminal_id FROM terminals
        WHERE merchant_id = ? AND (last_seen IS NULL OR last_seen <= ?)`,
    )
    .all('demo-merchant', cutoff);
  assert.deepEqual(
    stale.map((row) => row.terminal_id),
    [OFFLINE_TERMINAL.terminalId],
    'exactly one terminal is deliberately offline',
  );

  // Re-running is idempotent: unique event_id means no duplicate rows.
  seedDemoData(db, { now });
  const scans = db.prepare('SELECT COUNT(*) AS total FROM scans').get().total;
  assert.equal(scans, plan.length, 're-seeding adds no duplicate scans');
});

test('scripts/seed-demo.js coexists with seed.js and DEMOTERM01', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-seed-demo-'));
  const dbPath = join(dir, 'dozo.db');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  runScript('scripts/seed.js', dbPath);
  runScript('scripts/seed-demo.js', dbPath);

  let db = openDatabase(dbPath);
  const demo = db
    .prepare('SELECT terminal_id, label, created_at FROM terminals WHERE terminal_id = ?')
    .get('DEMOTERM01');
  assert.ok(demo, 'DEMOTERM01 survives seed-demo');
  assert.equal(demo.label, 'Demo terminal');

  const terminals = db
    .prepare('SELECT COUNT(*) AS total FROM terminals WHERE merchant_id = ?')
    .get('demo-merchant').total;
  assert.equal(terminals, SCAN_TERMINALS.length + 1);
  const firstScans = db.prepare('SELECT COUNT(*) AS total FROM scans').get().total;
  assert.ok(firstScans >= DAYS, 'the demo DB carries roughly a month of scans');
  db.close();

  runScript('scripts/seed-demo.js', dbPath);

  db = openDatabase(dbPath);
  t.after(() => db.close());
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM scans').get().total,
    firstScans,
    'a second run does not duplicate scans',
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM terminals WHERE merchant_id = ?').get('demo-merchant')
      .total,
    SCAN_TERMINALS.length + 1,
    'a second run does not duplicate terminals',
  );
});
