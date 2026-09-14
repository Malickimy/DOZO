import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../src/config.js';
import { openDatabase, seedDemo } from '../src/db.js';

const config = loadConfig();
if (config.dbPath !== ':memory:') {
  mkdirSync(dirname(config.dbPath), { recursive: true });
}

const db = openDatabase(config.dbPath);
seedDemo(db);

const rows = db
  .prepare('SELECT terminal_id, merchant_id, label FROM terminals ORDER BY terminal_id')
  .all();
console.log(`Seeded demo data into ${config.dbPath}`);
console.table(rows);
db.close();
