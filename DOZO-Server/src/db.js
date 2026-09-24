import Database from 'better-sqlite3';

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
];

export function openDatabase(dbPath = ':memory:') {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
  }
}

/** Insert a demo merchant + terminal so a fresh instance is curl-able. */
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
}

export { MIGRATIONS };
