#!/usr/bin/env node
/**
 * backup-snapshot.js - take an online SQLite snapshot with better-sqlite3.
 *
 * Used by scripts/backup.sh. Keeping this in Node (rather than shelling out to
 * a `sqlite3` binary) means a backup works anywhere the server runs, since
 * better-sqlite3 is already a dependency and handles the WAL safely.
 *
 * Usage: node scripts/backup-snapshot.js --db <source> --out <snapshot>
 */
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    out: { type: 'string' },
  },
});

if (!values.db || !values.out) {
  console.error('usage: backup-snapshot.js --db <source> --out <snapshot>');
  process.exit(2);
}

// Open read-only so a backup never mutates the live database and cannot run
// migrations against it.
const source = new Database(values.db, { readonly: true, fileMustExist: true });
try {
  // Online Backup API: consistent even while another process writes (WAL).
  await source.backup(values.out);
} finally {
  source.close();
}

// Verify the artifact before the retention/rsync steps trust it.
const snapshot = new Database(values.out, { readonly: true });
try {
  const verdict = snapshot.pragma('integrity_check', { simple: true });
  if (verdict !== 'ok') {
    console.error(`integrity_check failed: ${verdict}`);
    process.exit(1);
  }
} finally {
  snapshot.close();
}
