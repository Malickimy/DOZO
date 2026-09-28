#!/usr/bin/env node
/**
 * Local/demo launcher: runs the two DOZO entrypoints as separate processes
 * against one SQLite database.
 *
 *   dashboard  PORT           (default 3000) -> API + SPA
 *   connector  CONNECTOR_PORT (default 3001) -> /health + /r/:terminal_id
 *
 * Ctrl-C/SIGTERM tears both down; if either process exits non-zero the sibling
 * is stopped and the same code is returned. No runtime dependency is added.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboardPort = process.env.PORT || '3000';
const connectorPort = process.env.CONNECTOR_PORT || '3001';

const children = [];
let shuttingDown = false;

function spawnEntrypoint(script, env) {
  const child = spawn(process.execPath, [resolve(projectDir, script)], {
    cwd: projectDir,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  child.on('error', (error) => {
    console.error(`start-all: failed to spawn ${script}: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    shutdown(code ?? (signal ? 1 : 0));
  });
  children.push(child);
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = typeof code === 'number' ? code : 0;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(
  `start-all: dashboard on :${dashboardPort}, connector on :${connectorPort} ` +
    `(DB_PATH=${process.env.DB_PATH ?? './data/dozo.db'})`,
);

spawnEntrypoint('src/dashboard.js', { PORT: dashboardPort });
spawnEntrypoint('src/connector.js', {
  PORT: connectorPort,
  REDIRECT_DOMAIN: process.env.REDIRECT_DOMAIN || `http://localhost:${connectorPort}`,
  DASHBOARD_INGEST_URL: process.env.DASHBOARD_INGEST_URL || `http://localhost:${dashboardPort}`,
});
