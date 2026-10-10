import { DatabaseSync } from 'node:sqlite'
import { expect, type Locator, type Page } from '@playwright/test'
import { API_BASE_URL, API_TOKEN } from './env'

/**
 * Shared helpers for the Sprint 6 "merchant-grade polish" E2E specs.
 *
 * The dashboard is driven against the real server booted by
 * `playwright.config.ts`. Two things are seeded out-of-band:
 *
 *   - merchants/terminals: the HTTP API has no merchant-creation route, so the
 *     specs write straight to the same SQLite file the server owns
 *     (`DB_PATH=/tmp/dozo-e2e.db`). WAL is enabled by the server, so a second
 *     connection can insert safely. `node:sqlite` is used so the specs do not
 *     depend on the server's `better-sqlite3` resolution.
 *   - settings: the token + base URL go into `localStorage` before load, which
 *     is exactly how a merchant signs in.
 */

export const DB_PATH = '/tmp/dozo-e2e.db'

export const BASE_URL_KEY = 'dozo.dashboard.apiBaseUrl'
export const TOKEN_KEY = 'dozo.dashboard.apiToken'
/** i18n language key shared by the panel and the homepage (`src/lib/i18n.ts`). */
export const LANG_KEY = 'doozo-lang'

export interface SeededMerchant {
  merchantId: string
  terminalId: string
  label: string
}

let sequence = 0

/** Unique, API-safe token for a run; keeps reruns against the shared DB deterministic. */
function uniqueSuffix(): string {
  sequence += 1
  return `${Date.now()}${String(sequence).padStart(3, '0')}`
}

function openDb(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

/**
 * Create a merchant with a single terminal directly in the e2e database.
 * `offline: true` leaves `last_seen` NULL so the fleet-wide
 * `GET /api/terminals/offline` route reports the terminal.
 */
export function seedMerchantWithTerminal(
  prefix: string,
  { offline }: { offline: boolean },
): SeededMerchant {
  const suffix = uniqueSuffix()
  const merchantId = `qa-${prefix}-${suffix}`
  const terminalId = `QA${prefix.toUpperCase().replace(/[^A-Z0-9]/g, '')}${suffix}`.slice(0, 64)
  const label = `QA ${prefix} ${suffix}`
  const now = new Date().toISOString()
  const lastSeen = offline ? null : now

  const db = openDb()
  try {
    db.prepare(
      'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
    ).run(merchantId, `ChIJqa${suffix}`, now)
    db.prepare(
      `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    ).run(terminalId, merchantId, label, lastSeen, now)
  } finally {
    db.close()
  }

  return { merchantId, terminalId, label }
}

/** Remove everything the seed created, so the shared DB does not grow per run. */
export function cleanupMerchants(merchantIds: string[]): void {
  if (merchantIds.length === 0) return
  const placeholders = merchantIds.map(() => '?').join(', ')
  const db = openDb()
  try {
    db.prepare(
      `DELETE FROM scans
        WHERE terminal_id IN (SELECT terminal_id FROM terminals WHERE merchant_id IN (${placeholders}))`,
    ).run(...merchantIds)
    db.prepare(`DELETE FROM registers WHERE merchant_id IN (${placeholders})`).run(...merchantIds)
    db.prepare(`DELETE FROM terminals WHERE merchant_id IN (${placeholders})`).run(...merchantIds)
    db.prepare(`DELETE FROM setup_codes WHERE merchant_id IN (${placeholders})`).run(...merchantIds)
    db.prepare(`DELETE FROM merchants WHERE merchant_id IN (${placeholders})`).run(...merchantIds)
  } finally {
    db.close()
  }
}

/** Install the localStorage settings and land on the panel (`/panel/`). */
export async function signIn(page: Page): Promise<void> {
  await page.addInitScript(
    ({
      baseUrlKey,
      tokenKey,
      langKey,
      baseUrl,
      token,
    }: {
      baseUrlKey: string
      tokenKey: string
      langKey: string
      baseUrl: string
      token: string
    }) => {
      window.localStorage.setItem(baseUrlKey, baseUrl)
      window.localStorage.setItem(tokenKey, token)
      // The panel is Polish-first; pin English so the assertions below stay
      // language-stable without coupling every spec to the default locale.
      window.localStorage.setItem(langKey, 'en')
    },
    { baseUrlKey: BASE_URL_KEY, tokenKey: TOKEN_KEY, langKey: LANG_KEY, baseUrl: API_BASE_URL, token: API_TOKEN },
  )
  await page.goto('/panel/')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
}

/** Pick a merchant from the header picker, waiting for the option to exist. */
export async function selectMerchant(page: Page, merchantId: string): Promise<void> {
  // The picker lives in the dashboard header; `getByLabel('Merchant')` also
  // matches other labelled fields, so scope to the header select explicitly.
  const select = page.locator('.dash-top select')
  await expect(select).toBeVisible()
  await expect(select).toContainText(merchantId)
  await select.selectOption(merchantId)
}

export function openTab(page: Page, name: string): Promise<void> {
  return page.getByRole('button', { name, exact: true }).click()
}

/** The OfflinePanel card, scoped so list assertions cannot match another card. */
export function offlinePanel(page: Page): Locator {
  return page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Offline terminals' }) })
}

/** Horizontal overflow in CSS pixels: `scrollWidth - clientWidth` (<=0 means none). */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth - root.clientWidth
  })
}
