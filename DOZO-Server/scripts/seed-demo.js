#!/usr/bin/env node
/**
 * Rich demo seed for the dashboard "Live scan & demo data" sprint.
 *
 * Produces several labeled terminals with ~30 days of plausible, non-uniform
 * scan volume plus exactly one deliberately offline terminal. It is additive
 * and idempotent: `scans.event_id` is unique, so re-running never duplicates a
 * row and never removes or renames the `demo-merchant` / `DEMOTERM01` that the
 * dashboard e2e suite depends on.
 *
 * Run with:
 *   npm run seed:demo            # seeds DB_PATH (default ./data/dozo.db)
 *   DB_PATH=/tmp/demo.db npm run seed:demo
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEMO_MERCHANT_ID = 'demo-merchant';
export const DEMO_PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
/** Full days of history, ending yesterday. */
export const DAYS = 30;

/** Terminals that generate scans. `base` is an average scans-per-day. */
export const SCAN_TERMINALS = [
  { terminalId: 'DEMOTERM01', label: 'Demo terminal', base: 5 },
  { terminalId: 'DEMOTERM02', label: 'Front counter', base: 8 },
  { terminalId: 'DEMOTERM03', label: 'Bar', base: 3 },
  { terminalId: 'DEMOTERM04', label: 'Terrace', base: 4 },
];

/** The one terminal that is deliberately silent, so it shows up as offline. */
export const OFFLINE_TERMINAL = { terminalId: 'DEMOTERM05', label: 'Back office' };
export const OFFLINE_AFTER_DAYS = 3;

const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/121 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Version/16.6 Mobile Safari/604.1',
];

/** Deterministic hash in [0, 1) so re-runs generate the same shape. */
function noise(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/** Non-uniform daily volume: busier weekends, plus per-day variation. */
function scansForDay(terminal, dayIndex, dayDate) {
  const weekday = dayDate.getUTCDay();
  const weekend = weekday === 5 || weekday === 6 ? 1.6 : weekday === 0 ? 1.2 : 1;
  const variation = 0.6 + noise(`${terminal.terminalId}:${dayIndex}:count`) * 0.9;
  return Math.max(1, Math.round(terminal.base * weekend * variation));
}

function scanAt(terminalId, dayIndex, scanIndex, dayDate) {
  const hour = 8 + Math.floor(noise(`${terminalId}:${dayIndex}:${scanIndex}:h`) * 13);
  const minute = Math.floor(noise(`${terminalId}:${dayIndex}:${scanIndex}:m`) * 60);
  return new Date(
    Date.UTC(
      dayDate.getUTCFullYear(),
      dayDate.getUTCMonth(),
      dayDate.getUTCDate(),
      hour,
      minute,
      0,
      0,
    ),
  ).toISOString();
}

/**
 * The exact scan rows `seedDemoData` will insert, as pure data. Exposed so
 * tests can assert row counts without duplicating the generator.
 */
export function buildScanPlan(now = new Date()) {
  const rows = [];
  for (const terminal of SCAN_TERMINALS) {
    for (let dayIndex = DAYS; dayIndex >= 1; dayIndex -= 1) {
      const dayDate = new Date(now.getTime() - dayIndex * DAY_MS);
      const count = scansForDay(terminal, dayIndex, dayDate);
      for (let scanIndex = 0; scanIndex < count; scanIndex += 1) {
        const agentSeed = `${terminal.terminalId}:${dayIndex}:${scanIndex}:ua`;
        const agent =
          USER_AGENTS[
            Math.min(
              USER_AGENTS.length - 1,
              Math.floor(noise(agentSeed) * USER_AGENTS.length),
            )
          ];
        rows.push({
          terminalId: terminal.terminalId,
          scannedAt: scanAt(terminal.terminalId, dayIndex, scanIndex, dayDate),
          userAgent: agent,
          eventId: `seed-demo:${terminal.terminalId}:${dayIndex}:${scanIndex}`,
        });
      }
    }
  }
  return rows;
}

/**
 * Seed the richer demo dataset. Additive and idempotent; safe to call against a
 * database that already ran `seedDemo` (scripts/seed.js).
 */
export function seedDemoData(db, { now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const insertMerchant = db.prepare(
    `INSERT OR IGNORE INTO merchants (merchant_id, google_place_id, created_at)
     VALUES (?, ?, ?)`,
  );
  const insertTerminal = db.prepare(
    `INSERT OR IGNORE INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  );
  // Only move the clock forward: a live heartbeat is never regressed.
  const touchLastSeen = db.prepare(
    `UPDATE terminals
        SET last_seen = ?
      WHERE terminal_id = ? AND (last_seen IS NULL OR last_seen < ?)`,
  );
  const insertRegister = db.prepare(
    `INSERT OR IGNORE INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  );
  const insertScan = db.prepare(
    `INSERT OR IGNORE INTO scans (terminal_id, scanned_at, user_agent, event_id)
     VALUES (?, ?, ?, ?)`,
  );

  const plan = buildScanPlan(now);

  const apply = db.transaction(() => {
    insertMerchant.run(DEMO_MERCHANT_ID, DEMO_PLACE_ID, nowIso);

    for (const terminal of SCAN_TERMINALS) {
      insertTerminal.run(terminal.terminalId, DEMO_MERCHANT_ID, terminal.label, nowIso);
      insertRegister.run(DEMO_MERCHANT_ID, terminal.label, terminal.terminalId, nowIso);
    }
    insertTerminal.run(
      OFFLINE_TERMINAL.terminalId,
      DEMO_MERCHANT_ID,
      OFFLINE_TERMINAL.label,
      nowIso,
    );
    insertRegister.run(
      DEMO_MERCHANT_ID,
      OFFLINE_TERMINAL.label,
      OFFLINE_TERMINAL.terminalId,
      nowIso,
    );

    for (const row of plan) {
      insertScan.run(row.terminalId, row.scannedAt, row.userAgent, row.eventId);
    }

    // Scan terminals are online; the offline one is set below.
    for (const terminal of SCAN_TERMINALS) {
      touchLastSeen.run(nowIso, terminal.terminalId, nowIso);
    }

    const offlineSeen = new Date(now.getTime() - OFFLINE_AFTER_DAYS * DAY_MS).toISOString();
    touchLastSeen.run(offlineSeen, OFFLINE_TERMINAL.terminalId, offlineSeen);
  });
  apply();

  return {
    terminals: db
      .prepare(
        `SELECT terminal_id, label, active, last_seen
           FROM terminals
          WHERE merchant_id = ?
          ORDER BY terminal_id`,
      )
      .all(DEMO_MERCHANT_ID),
  };
}

function main() {
  const config = loadConfig();
  if (config.dbPath !== ':memory:') {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }
  const db = openDatabase(config.dbPath);
  const result = seedDemoData(db);
  console.log(`Seeded rich demo data into ${config.dbPath}`);
  console.table(result.terminals);
  db.close();
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
