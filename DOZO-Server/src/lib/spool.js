import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only JSONL spool for scans the connector writes locally but has not
 * yet confirmed on the dashboard's `/scans` ingest. Entries survive restarts.
 */
export function createSpool({ filePath }) {
  if (!filePath) {
    throw new Error('createSpool requires a filePath');
  }
  mkdirSync(dirname(filePath), { recursive: true });

  return {
    filePath,
    append(entry) {
      appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
    },
    readAll() {
      if (!existsSync(filePath)) return [];
      return readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },
    replace(entries) {
      writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : ''));
    },
    clear() {
      writeFileSync(filePath, '');
    },
  };
}
