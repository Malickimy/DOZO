import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { API_BASE_URL, API_TOKEN, CONNECTOR_SECRET, MERCHANT_ID } from './env'

/**
 * E2E coverage for sprint DOZO-http-api-R2-R3-48-51.
 *
 * This project boots the real server from `../DOZO-Server` (see
 * `playwright.config.ts`), so two of these specs are server-API contract tests
 * driven through the `request` fixture — the same pattern as
 * `scan-ingest.e2e.ts` (there is no separate server-side Playwright project).
 * The third is a browser spec proving the merchant SPA renders the new column.
 *
 * Contract: `contracts/http-api.md` §scans — a row is
 * `{id, event_id, terminal_id, scanned_at, user_agent}`; §terminal config — an
 * `active:false` terminal still returns `200 <config>` and never
 * `inactive_terminal`.
 */

const SCANS_URL = `${API_BASE_URL}/scans`
const KNOWN_TERMINAL_ID = 'DEMOTERM01'

const BASE_URL_KEY = 'dozo.dashboard.apiBaseUrl'
const TOKEN_KEY = 'dozo.dashboard.apiToken'
const LANG_KEY = 'doozo-lang'

const AUTH = { 'X-Api-Token': API_TOKEN }
const CONNECTOR = { 'X-Connector-Secret': CONNECTOR_SECRET }

/** A unique terminal id: `[A-Za-z0-9_-]{8,64}` (redeem uppercases it). */
function uniqueTerminalId(prefix: string): string {
  return `${prefix}${String(Date.now()).slice(-8)}`
}

/** Provision a fresh terminal through the public model-B pairing flow. */
async function provisionTerminal(
  request: APIRequestContext,
  prefix: string,
): Promise<{ terminalId: string; label: string }> {
  const suffix = Date.now()
  const label = `qa-e2e-${prefix}-${suffix}`
  const terminalId = uniqueTerminalId(`QAE2E${prefix.toUpperCase()}`)

  const issued = await request.post(
    `${API_BASE_URL}/api/merchants/${MERCHANT_ID}/registers/${encodeURIComponent(label)}/setup-code`,
    { headers: AUTH },
  )
  expect(issued.status()).toBe(201)
  const { code } = (await issued.json()) as { code: string }
  expect(code).toMatch(/^[A-Z0-9]{8}$/)

  const redeemed = await request.post(`${API_BASE_URL}/api/terminals/redeem`, {
    headers: AUTH,
    data: {
      code,
      device_serial: `qa-e2e-${prefix}-${suffix}`,
      terminal_id: terminalId,
    },
  })
  expect(redeemed.status()).toBe(200)

  return { terminalId, label }
}

async function seedScan(
  request: APIRequestContext,
  userAgent: string,
): Promise<string> {
  const eventId = randomUUID()
  const response = await request.post(SCANS_URL, {
    headers: CONNECTOR,
    data: {
      event_id: eventId,
      terminal_id: KNOWN_TERMINAL_ID,
      merchant_id: MERCHANT_ID,
      scanned_at: new Date().toISOString(),
      user_agent: userAgent,
    },
  })
  expect(response.status()).toBe(202)
  expect(await response.json()).toEqual({ status: 'accepted' })
  return eventId
}

test('scans list returns each scan with its persisted event_id', async ({ request }) => {
  const userAgent = `dozo-e2e-event-id/${randomUUID()}`
  const eventId = await seedScan(request, userAgent)

  const list = await request.get(
    `${API_BASE_URL}/api/merchants/${MERCHANT_ID}/scans` +
      `?terminal_id=${KNOWN_TERMINAL_ID}&limit=1000`,
    { headers: AUTH },
  )
  expect(list.status()).toBe(200)

  const scans = (await list.json()) as Record<string, unknown>[]
  const row = scans.find((scan) => scan.user_agent === userAgent)
  expect(row, 'the just-ingested scan is in the read model').toBeTruthy()
  expect(row!.event_id).toBe(eventId)
  expect(row!.event_id).not.toBeNull()
  expect(row!.event_id).not.toBeUndefined()
  // The row shape must match the contract exactly — no dropped/extra keys.
  expect(Object.keys(row!).sort()).toEqual([
    'event_id',
    'id',
    'scanned_at',
    'terminal_id',
    'user_agent',
  ])
})

test('inactive terminal still returns 200 config and never inactive_terminal', async ({
  request,
}) => {
  const { terminalId } = await provisionTerminal(request, 'inactive')

  // Deactivate via the R3 lifecycle route.
  const deactivate = await request.patch(`${API_BASE_URL}/api/terminals/${terminalId}`, {
    headers: AUTH,
    data: { active: false },
  })
  expect(deactivate.status()).toBe(200)
  const deactivateBody = (await deactivate.json()) as Record<string, unknown>
  expect(deactivateBody.active).toBe(false)
  expect(deactivateBody).not.toHaveProperty('inactive_terminal')

  // Read: an inactive terminal is still a known terminal, so its config is 200.
  const read = await request.get(
    `${API_BASE_URL}/api/terminals/${terminalId}/config`,
    { headers: AUTH },
  )
  expect(read.status()).toBe(200)
  const readBody = (await read.json()) as Record<string, unknown>
  expect(readBody.active).toBe(false)
  expect(readBody).not.toHaveProperty('inactive_terminal')
  expect(readBody).not.toHaveProperty('error')

  // Write: the display-config PUT works while inactive too.
  const write = await request.put(
    `${API_BASE_URL}/api/terminals/${terminalId}/config`,
    { headers: AUTH, data: { display_timeout_seconds: 20 } },
  )
  expect(write.status()).toBe(200)
  const writeBody = (await write.json()) as Record<string, unknown>
  expect(writeBody.active).toBe(false)
  expect(writeBody.display_timeout_seconds).toBe(20)
  expect(writeBody).not.toHaveProperty('inactive_terminal')

  // Lifecycle PATCH is idempotent while inactive, and can still reactivate.
  const patch = await request.patch(`${API_BASE_URL}/api/terminals/${terminalId}`, {
    headers: AUTH,
    data: {},
  })
  expect(patch.status()).toBe(200)
  expect(((await patch.json()) as Record<string, unknown>).active).toBe(false)

  const reactivate = await request.patch(
    `${API_BASE_URL}/api/terminals/${terminalId}`,
    { headers: AUTH, data: { active: true } },
  )
  expect(reactivate.status()).toBe(200)
  expect(((await reactivate.json()) as Record<string, unknown>).active).toBe(true)
})

test('scan log renders the event_id column from the read model', async ({
  page,
  request,
}) => {
  const userAgent = `dozo-e2e-view/${randomUUID()}`
  const eventId = await seedScan(request, userAgent)

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
      window.localStorage.setItem(langKey, 'en')
    },
    { baseUrlKey: BASE_URL_KEY, tokenKey: TOKEN_KEY, langKey: LANG_KEY, baseUrl: API_BASE_URL, token: API_TOKEN },
  )
  await page.goto('/panel/')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()

  const scanLog = page.locator('.card').filter({ hasText: 'Scan log' })
  await expect(scanLog.getByRole('table')).toBeVisible()
  await expect(scanLog.getByRole('columnheader', { name: 'Event' })).toBeVisible()

  const row = scanLog.getByRole('row').filter({ hasText: eventId })
  await expect(row).toBeVisible()
  // Column order is ID, Event, Terminal, Scanned at, User agent.
  await expect(row.getByRole('cell').nth(1)).toHaveText(eventId)
  // The scan must not fall back to the em-dash placeholder for a missing id.
  await expect(row.getByRole('cell').nth(1)).not.toHaveText('—')
})
