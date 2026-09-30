import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { API_BASE_URL, API_TOKEN, CONNECTOR_SECRET, MERCHANT_ID } from './env'

/**
 * E2E coverage for Dashboard Sprint 5's live-scan behaviour:
 *
 *   - the Overview summary is polled every 10s while the tab is visible, so a
 *     scan ingested after load appears on its own and shows a `+N scans` toast;
 *   - the first summary load is only a baseline, so an initial load never toasts;
 *   - the manual Refresh button refetches immediately instead of waiting a tick;
 *   - polling stops on `visibilitychange` while the tab is hidden and resumes
 *     when it becomes visible again.
 *
 * The server is the real one from `../DOZO-Server` (see playwright.config.ts);
 * scans are ingested through the connector route with a fresh UUID `event_id`.
 * Every scan is backdated slightly: the dashboard freezes its range `until` at
 * mount, so a row stamped "now" would fall outside the polled window and never
 * move `total_scans`.
 */
const SCANS_URL = `${API_BASE_URL}/scans`
const KNOWN_TERMINAL_ID = 'DEMOTERM01'
/** Backdated enough to sit inside the range window captured at mount. */
const BACKDATE_MS = 60_000

const BASE_URL_KEY = 'dozo.dashboard.apiBaseUrl'
const TOKEN_KEY = 'dozo.dashboard.apiToken'

/** Seed the persisted dashboard settings so the SPA talks to the e2e server. */
async function configure(page: Page) {
  await page.addInitScript(
    ({
      baseUrlKey,
      tokenKey,
      baseUrl,
      token,
    }: {
      baseUrlKey: string
      tokenKey: string
      baseUrl: string
      token: string
    }) => {
      window.localStorage.setItem(baseUrlKey, baseUrl)
      window.localStorage.setItem(tokenKey, token)
    },
    { baseUrlKey: BASE_URL_KEY, tokenKey: TOKEN_KEY, baseUrl: API_BASE_URL, token: API_TOKEN },
  )
}

async function gotoDashboard(page: Page) {
  await configure(page)
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  // The summary card only renders once `listMerchants` + `/summary` resolved.
  await expect(totalScans(page)).toBeVisible()
}

/** The `Total scans` stat value on the Overview tab. */
function totalScans(page: Page): Locator {
  return page.locator('.card--stat').filter({ hasText: 'Total scans' }).locator('.stat__value')
}

async function totalScansValue(page: Page): Promise<number> {
  const text = await totalScans(page).textContent()
  return Number(text)
}

async function seedBackdatedScan(
  request: APIRequestContext,
  terminalId: string,
): Promise<string> {
  const eventId = randomUUID()
  const response = await request.post(SCANS_URL, {
    headers: { 'X-Connector-Secret': CONNECTOR_SECRET },
    data: {
      event_id: eventId,
      terminal_id: terminalId,
      merchant_id: MERCHANT_ID,
      scanned_at: new Date(Date.now() - BACKDATE_MS).toISOString(),
      user_agent: `dozo-e2e-live/${randomUUID()}`,
    },
  })
  expect(response.status()).toBe(202)
  expect(await response.json()).toEqual({ status: 'accepted' })
  return eventId
}

test('a new scan appears on the next poll and toasts, with no toast on first load', async ({
  page,
  request,
}) => {
  test.setTimeout(45_000)
  await gotoDashboard(page)

  // The polite live region is always mounted, but the initial load is only a
  // baseline: no message may be shown.
  await expect(page.locator('.toast-region .toast')).toHaveCount(0)

  const before = await totalScansValue(page)
  await seedBackdatedScan(request, KNOWN_TERMINAL_ID)

  // The 10s poll picks the row up; allow a full interval plus slack.
  await expect(page.locator('.toast-region .toast__text')).toHaveText('+1 scan', {
    timeout: 15_000,
  })
  await expect(totalScans(page)).toHaveText(String(before + 1), { timeout: 15_000 })
})

test('the manual Refresh button refetches the summary and updates the data', async ({
  page,
  request,
}) => {
  await gotoDashboard(page)

  const before = await totalScansValue(page)
  await seedBackdatedScan(request, KNOWN_TERMINAL_ID)

  const [summaryRequest] = await Promise.all([
    page.waitForRequest((request) => request.url().includes('/summary')),
    page.getByRole('button', { name: 'Refresh' }).click(),
  ])
  expect(summaryRequest.url()).toContain('/summary')

  // User-initiated reload: the card updates without waiting for the 10s tick.
  await expect(totalScans(page)).toHaveText(String(before + 1), { timeout: 5_000 })
})

test('polling pauses while the tab is hidden and resumes when it is visible', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await gotoDashboard(page)

  // Prove the 10s poll is actually running before hiding the tab.
  await page.waitForRequest((request) => request.url().includes('/summary'), {
    timeout: 15_000,
  })

  const hiddenRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/summary')) hiddenRequests.push(request.url())
  })

  // Simulate the browser hiding the tab. `document.hidden`/`visibilityState`
  // are read-only accessors, so shadow them with own properties before firing
  // the event React listens for.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // More than one full poll interval must pass with no `/summary` traffic.
  await page.waitForTimeout(13_000)
  expect(hiddenRequests, 'no /summary poll while the tab is hidden').toEqual([])

  // Showing the tab again restarts the timer.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForRequest((request) => request.url().includes('/summary'), {
    timeout: 15_000,
  })
})
