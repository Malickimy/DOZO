/**
 * Hardening I: `scripts/backup.sh`. Snapshots are consistent SQLite copies
 * (verified with `PRAGMA integrity_check`), 7-day rotation prunes old
 * snapshots, the documented restore drill opens a snapshot against a temp DB,
 * and the optional rsync hook ships the artifact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db.js';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_SH = join(PROJECT_DIR, 'scripts', 'backup.sh');
const START = '2026-01-01T00:00:00.000Z';

function seedSource(dbPath) {
  const db = openDatabase(dbPath);
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', 'ChIJ_BACKUP', START);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run('TERM0001', 'M1', 'Front counter', START);
  db.prepare(
    'INSERT INTO scans (terminal_id, scanned_at, user_agent, event_id) VALUES (?, ?, ?, ?)',
  ).run('TERM0001', START, 'Backup Test', 'backup-evt-1');
  db.close();
}

function runBackup(env, { expectFailure = false } = {}) {
  try {
    return execFileSync('bash', [BACKUP_SH], { env: { ...process.env, ...env }, encoding: 'utf8' });
  } catch (error) {
    if (expectFailure) return error;
    throw error;
  }
}

function snapshotName(backupDir) {
  return readdirSync(backupDir).find((name) => /^dozo-\d{8}-\d{6}\.db$/.test(name));
}

test('backup.sh snapshots a valid SQLite file and the restore drill opens it', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-backup-'));
  const dbPath = join(dir, 'source.db');
  const backupDir = join(dir, 'backups');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  seedSource(dbPath);
  const output = runBackup({ DB_PATH: dbPath, BACKUP_DIR: backupDir });
  assert.match(output, /backup: OK/);
  assert.match(output, /integrity_check ok/);

  const name = snapshotName(backupDir);
  assert.ok(name, 'a dozo-<stamp>.db snapshot was written');
  const snapshot = join(backupDir, name);

  const opened = new Database(snapshot, { readonly: true });
  assert.equal(opened.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(opened.prepare('SELECT COUNT(*) AS c FROM scans').get().c, 1);
  opened.close();

  // Documented restore drill: copy the snapshot to a temp DB and open it.
  const restorePath = join(dir, 'restore.db');
  copyFileSync(snapshot, restorePath);
  const restored = new Database(restorePath, { readonly: true });
  assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  assert.ok(restored.prepare('SELECT 1 FROM terminals WHERE terminal_id = ?').get('TERM0001'));
  assert.ok(restored.prepare('SELECT 1 FROM scans WHERE event_id = ?').get('backup-evt-1'));
  restored.close();
});

test('backup.sh rotation prunes snapshots older than 7 days and keeps recent ones', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-rotate-'));
  const dbPath = join(dir, 'source.db');
  const backupDir = join(dir, 'backups');
  mkdirSync(backupDir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  seedSource(dbPath);

  const old = join(backupDir, 'dozo-20000101-000000.db');
  const recent = join(backupDir, 'dozo-20990101-000000.db');
  writeFileSync(old, 'stale');
  writeFileSync(recent, 'kept');
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  utimesSync(old, tenDaysAgo, tenDaysAgo);

  runBackup({ DB_PATH: dbPath, BACKUP_DIR: backupDir, BACKUP_RETENTION_DAYS: '7' });

  assert.equal(existsSync(old), false, 'the >7d snapshot is pruned');
  assert.equal(existsSync(recent), true, 'a recent snapshot is kept');
  assert.ok(snapshotName(backupDir), 'the new snapshot is present');
});

test('backup.sh rsync hook ships the snapshot to BACKUP_RSYNC_TARGET', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dozo-rsync-'));
  const dbPath = join(dir, 'source.db');
  const backupDir = join(dir, 'backups');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  seedSource(dbPath);

  const logFile = join(dir, 'rsync.log');
  const stub = join(dir, 'fake-rsync.sh');
  writeFileSync(stub, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${logFile}"\n`);
  chmodSync(stub, 0o755);

  const target = join(dir, 'offsite');
  runBackup({
    DB_PATH: dbPath,
    BACKUP_DIR: backupDir,
    BACKUP_RSYNC_TARGET: target,
    RSYNC: stub,
  });

  const log = readFileSync(logFile, 'utf8');
  assert.match(log, /-az/);
  assert.ok(log.includes(target), 'the configured target is passed to rsync');
  assert.ok(log.includes('.db'), 'the snapshot is the shipped argument');
});
