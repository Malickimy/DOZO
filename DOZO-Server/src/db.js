import Database from 'better-sqlite3';

const WAL_RETRIES = 200;
const WAL_RETRY_DELAY_MS = 10;

/** Blocking sleep; better-sqlite3 calls are synchronous, so a retry loop must be too. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Switch to WAL, tolerating a sibling process converting the same fresh file
 * first. `PRAGMA journal_mode = WAL` needs an exclusive lock and does *not*
 * honour `busy_timeout`, so a concurrent conversion surfaces as SQLITE_BUSY
 * even though the wait pragma is set.
 */
function enableWal(db) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      db.pragma('journal_mode = WAL');
      return;
    } catch (error) {
      if (error.code !== 'SQLITE_BUSY' || attempt >= WAL_RETRIES) throw error;
      sleepSync(WAL_RETRY_DELAY_MS);
    }
  }
}

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE merchants (
        merchant_id     TEXT PRIMARY KEY,
        google_place_id TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );

      CREATE TABLE terminals (
        terminal_id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL REFERENCES merchants(merchant_id),
        label       TEXT,
        active      INTEGER NOT NULL DEFAULT 1,
        last_seen   TEXT,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE scans (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        terminal_id TEXT NOT NULL REFERENCES terminals(terminal_id),
        scanned_at  TEXT NOT NULL,
        user_agent  TEXT
      );

      CREATE INDEX idx_scans_terminal_scanned
        ON scans (terminal_id, scanned_at);

      CREATE TABLE pairing_codes (
        code          TEXT PRIMARY KEY,
        device_serial TEXT NOT NULL,
        merchant_id   TEXT NOT NULL REFERENCES merchants(merchant_id),
        terminal_id   TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        expires_at    TEXT NOT NULL,
        claimed_at    TEXT
      );

      CREATE INDEX idx_pairing_codes_expires
        ON pairing_codes (expires_at);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE terminals ADD COLUMN display_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE terminals ADD COLUMN display_timeout_seconds INTEGER NOT NULL DEFAULT 15;
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE setup_codes (
        code        TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL REFERENCES merchants(merchant_id),
        label       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        redeemed_at TEXT
      );

      CREATE INDEX idx_setup_codes_expires
        ON setup_codes (expires_at);
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE scans ADD COLUMN event_id TEXT;
      CREATE UNIQUE INDEX idx_scans_event_id ON scans (event_id);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE registers (
        register_id INTEGER PRIMARY KEY AUTOINCREMENT,
        merchant_id TEXT NOT NULL REFERENCES merchants(merchant_id),
        label       TEXT NOT NULL,
        terminal_id TEXT REFERENCES terminals(terminal_id),
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
      );

      CREATE UNIQUE INDEX idx_registers_merchant_label
        ON registers (merchant_id, label);

      -- Backfill: existing labeled terminals become occupied registers so the
      -- register list does not lose them when it moves off the terminals table.
      INSERT OR IGNORE INTO registers (merchant_id, label, terminal_id, active, created_at)
      SELECT merchant_id, TRIM(label), terminal_id, active, created_at
        FROM terminals
       WHERE label IS NOT NULL AND TRIM(label) <> '';
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE terminals ADD COLUMN api_token_hash TEXT;
      CREATE UNIQUE INDEX idx_terminals_api_token_hash ON terminals (api_token_hash);
    `,
  },
];

export function openDatabase(dbPath = ':memory:') {
  const db = new Database(dbPath);
  // The demo launcher boots two processes against one fresh DB. Wait for a
  // concurrent writer instead of failing immediately with SQLITE_BUSY.
  db.pragma('busy_timeout = 5000');
  enableWal(db);
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function hasColumn(db, table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((entry) => entry.name === column);
}

export function migrate(db) {
  // Serialize concurrent migrators. Two processes can open one fresh DB at the
  // same time (scripts/start-all.js spawns the dashboard and connector against a
  // shared DB_PATH). If each read `user_version` before the other wrote, both
  // would run migration 1's non-idempotent `CREATE TABLE merchants` and the
  // loser would fail. BEGIN IMMEDIATE takes the write lock *before* the version
  // is read, so the second process waits on busy_timeout and then sees the
  // version the first one committed, skipping migrations already applied.
  const apply = db.transaction(() => {
    const current = db.pragma('user_version', { simple: true });
    // Apply in ascending order. A database that ran a higher-numbered migration
    // before a lower one was added (e.g. v5 before v4) would otherwise skip it,
    // so `reconcile` repairs the scans.event_id column/index afterwards.
    const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);
    for (const migration of ordered) {
      if (migration.version <= current) continue;
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    }
    reconcile(db);
  });
  apply.immediate();
}

/** Idempotently add schema that a version gap may have skipped. */
function reconcile(db) {
  if (!hasColumn(db, 'scans', 'event_id')) {
    db.exec('ALTER TABLE scans ADD COLUMN event_id TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_event_id ON scans (event_id)');
}

/**
 * Insert a demo merchant + terminal + bound register so a fresh instance is
 * curl-able. Idempotent: safe to re-run against an already-seeded database,
 * including one where migration v5 already backfilled the register.
 */
export function seedDemo(db) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO merchants (merchant_id, google_place_id, created_at)
     VALUES (?, ?, ?)`,
  ).run('demo-merchant', 'ChIJN1t_tDeuEmsRUsoyG83frY4', now);
  db.prepare(
    `INSERT OR IGNORE INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run('DEMOTERM01', 'demo-merchant', 'Demo terminal', now);
  // `(merchant_id, label)` is unique, so OR IGNORE keeps a re-run from inserting
  // a second row. The migration-v5 backfill already binds labeled terminals, but
  // a fresh DB has no terminals when v5 runs, so the demo terminal would
  // otherwise end up with no register.
  db.prepare(
    `INSERT OR IGNORE INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  ).run('demo-merchant', 'Demo terminal', 'DEMOTERM01', now);
  // Bind a demo register that exists but is still unoccupied (e.g. created via
  // setup-code before seeding) without touching an already-bound one.
  db.prepare(
    `UPDATE registers
        SET terminal_id = ?
      WHERE merchant_id = ? AND label = ? AND terminal_id IS NULL`,
  ).run('DEMOTERM01', 'demo-merchant', 'Demo terminal');
}

export { MIGRATIONS };
