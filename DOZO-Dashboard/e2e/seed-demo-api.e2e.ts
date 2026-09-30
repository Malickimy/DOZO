import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { API_TOKEN } from './env'

/**
 * API-level coverage for `DOZO-Server/scripts/seed-demo.js` (Sprint 5's rich
 * demo seed). Runs the real script against a throwaway `DB_PATH`, boots a real
 * server on that database, and checks the fleet through the dashboard API:
 *
 *   - four online terminals with ~30 days of scans each;
 *   - exactly one deliberately offline terminal (`last_seen` three days ago);
 *   - `GET /api/terminals/offline` reports only that terminal.
 *
 * A temp DB (not the shared `/tmp/dozo-e2e.db`) is required: the e2e server's
 * database accumulates QA terminals from the other specs, so terminal counts
 * there are not stable.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serverDir = resolve(here, '../../DOZO-Server')

const AUTH = { 'X-Api-Token': API_TOKEN }
const MERCHANT_ID = 'demo-merchant'

/** Mirror of `scripts/seed-demo.js`'s exported constants. */
const SCAN_TERMINALS = ['DEMOTERM01', 'DEMOTERM02', 'DEMOTERM03', 'DEMOTERM04']
const OFFLINE_TERMINAL = 'DEMOTERM05'
const DAYS = 30
const OFFLINE_THRESHOLD_SECONDS = 24 * 60 * 60

interface TerminalRow {
  terminal_id: string
  scan_count: number
  last_seen: string | null
}

interface OfflineResult {
  threshold_seconds: number
  cutoff: string
  terminals: { terminal_id: string }[]
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolvePort(port))
    })
  })
}

async function waitForHealth(baseUrl: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // Not listening yet; retry.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`server did not become healthy at ${baseUrl}`)
}

function runSeedScript(dbPath: string): void {
  execFileSync(process.execPath, ['scripts/seed-demo.js'], {
    cwd: serverDir,
    env: { ...process.env, DB_PATH: dbPath },
    stdio: 'pipe',
  })
}

async function startServer(dbPath: string, port: number): Promise<ChildProcess> {
  const proc = spawn(process.execPath, ['src/dashboard.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      API_TOKEN,
      SEED_DEMO: 'false',
      DASHBOARD_CONNECTOR_SECRET: '',
    },
    stdio: 'ignore',
  })
  await waitForHealth(`http://127.0.0.1:${port}`)
  return proc
}

async function stopServer(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null) return
  await new Promise<void>((resolveStop) => {
    const done = () => resolveStop()
    proc.once('exit', done)
    proc.kill('SIGTERM')
    setTimeout(() => {
      proc.kill('SIGKILL')
      done()
    }, 2_000)
  })
}

test('seed:demo seeds four online terminals and exactly one offline terminal (API)', async ({
  request,
}) => {
  test.setTimeout(60_000)
  const dir = mkdtempSync(join(tmpdir(), 'dozo-seed-api-'))
  const dbPath = join(dir, 'dozo.db')
  const port = await freePort()
  let proc: ChildProcess | null = null

  try {
    runSeedScript(dbPath)
    proc = await startServer(dbPath, port)
    const base = `http://127.0.0.1:${port}`

    const terminalsResponse = await request.get(
      `${base}/api/merchants/${MERCHANT_ID}/terminals`,
      { headers: AUTH },
    )
    expect(terminalsResponse.status()).toBe(200)
    const terminals = (await terminalsResponse.json()) as TerminalRow[]
    const byId = new Map(terminals.map((terminal) => [terminal.terminal_id, terminal]))

    expect([...byId.keys()].sort()).toEqual(
      [...SCAN_TERMINALS, OFFLINE_TERMINAL].sort(),
    )
    for (const terminalId of SCAN_TERMINALS) {
      const row = byId.get(terminalId)
      expect(row, `${terminalId} is seeded`).toBeTruthy()
      // At least one scan per day for the 30-day window.
      expect(row!.scan_count, `${terminalId} carries ~${DAYS} days of scans`).toBeGreaterThanOrEqual(
        DAYS,
      )
    }
    expect(byId.get(OFFLINE_TERMINAL)!.scan_count, 'the offline terminal never scans').toBe(0)

    const offlineResponse = await request.get(`${base}/api/terminals/offline`, {
      headers: AUTH,
    })
    expect(offlineResponse.status()).toBe(200)
    const offline = (await offlineResponse.json()) as OfflineResult
    expect(offline.threshold_seconds).toBe(OFFLINE_THRESHOLD_SECONDS)
    expect(offline.terminals.map((terminal) => terminal.terminal_id)).toEqual([
      OFFLINE_TERMINAL,
    ])
  } finally {
    await stopServer(proc)
    rmSync(dir, { recursive: true, force: true })
  }
})
