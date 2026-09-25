import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { API_BASE_URL, API_TOKEN, MERCHANT_ID } from './env'

/**
 * End-to-end coverage for the "Registers & setup codes" tab (Release Board R1).
 *
 * The server now models a register as its own row (R7): `POST .../setup-code`
 * creates it with `terminal_id` null, so the unoccupied branch is exercised
 * against the real server instead of being stubbed. Only the error states
 * (401/404 on the list and on issue) route-stub the HTTP responses.
 *
 * Labels are unique per run because `/tmp/dozo-e2e.db` is shared and persists.
 */
const BASE_URL_KEY = 'dozo.dashboard.apiBaseUrl'
const TOKEN_KEY = 'dozo.dashboard.apiToken'

/** `GET /api/merchants/:id/registers` */
const REGISTERS_LIST = '**/api/merchants/*/registers'
/** `POST /api/merchants/:id/registers/:label/setup-code` */
const SETUP_CODE = '**/api/merchants/*/registers/*/setup-code'

test.beforeEach(async ({ page }) => {
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
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
})

async function openRegisters(page: Page) {
  await page.getByRole('button', { name: 'Registers & setup codes' }).click()
  await expect(
    page.getByRole('heading', { name: 'Registers & setup codes' }),
  ).toBeVisible()
}

function setupCodeCard(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Setup code for' })
}

function stubRegistersList(page: Page, body: unknown, status = 200) {
  return page.route(REGISTERS_LIST, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

/** `POST .../registers/:label/setup-code`; creates the register row as a side effect. */
function issueSetupCode(request: APIRequestContext, label: string) {
  return request.post(
    `${API_BASE_URL}/api/merchants/${MERCHANT_ID}/registers/${encodeURIComponent(label)}/setup-code`,
    { headers: { 'X-Api-Token': API_TOKEN } },
  )
}

const OCCUPIED_REGISTER = {
  label: 'Demo terminal',
  terminal_id: 'DEMOTERM01',
  active: true,
  last_seen: null,
}

test('occupied register: confirmation gates the POST, then shows code + expiry', async ({
  page,
}) => {
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/setup-code')) {
      posts.push(request.url())
    }
  })

  await openRegisters(page)

  // Scope every assertion to the demo row: the shared DB accumulates registers
  // across runs, so unscoped cell matches (`Active`, `never`) are ambiguous.
  await expect(page.getByRole('table')).toBeVisible()
  const demoRow = page.getByRole('row', { name: /Demo terminal/ })
  await expect(demoRow.getByRole('cell', { name: 'Demo terminal' })).toBeVisible()
  await expect(demoRow.getByRole('cell', { name: 'DEMOTERM01' })).toBeVisible()
  await expect(demoRow.getByRole('cell', { name: 'Active', exact: true })).toBeVisible()
  await expect(demoRow.getByRole('cell', { name: 'never' })).toBeVisible()

  await demoRow.getByRole('button', { name: 'Issue' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Confirm device swap' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Current device:')
  await expect(dialog).toContainText('DEMOTERM01')
  // The POST must not fire until the merchant confirms the device swap.
  expect(posts).toHaveLength(0)

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/setup-code'),
    ),
    page.getByRole('button', { name: 'Confirm' }).click(),
  ])
  expect(response.status()).toBe(201)

  const body = await response.json()
  expect(body).toMatchObject({
    merchant_id: 'demo-merchant',
    label: 'Demo terminal',
    expires_in_seconds: 300,
  })
  expect(body.code).toMatch(/^[A-Z0-9]{8}$/)

  const card = setupCodeCard(page)
  await expect(card).toBeVisible()
  await expect(card).toContainText('Demo terminal')
  await expect(card.getByText(body.code)).toBeVisible()
  await expect(card).toContainText('(300s)')
  expect(posts).toHaveLength(1)
})

test('unoccupied register: issues immediately (no confirmation) and shows code + expiry', async ({
  page,
  request,
}) => {
  const label = `qa-unclaimed-${Date.now()}`

  // R7: a setup-code POST finds-or-creates the register with `terminal_id` null,
  // so the server really can return an unoccupied row — no stub needed.
  const created = await issueSetupCode(request, label)
  expect(created.status()).toBe(201)

  await page.reload()
  await openRegisters(page)

  const row = page.getByRole('row', { name: new RegExp(label) })
  await expect(row).toContainText('Unclaimed')

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/setup-code'),
    ),
    row.getByRole('button', { name: 'Issue' }).click(),
  ])
  expect(response.status()).toBe(201)

  const body = await response.json()
  expect(body).toMatchObject({ merchant_id: MERCHANT_ID, label, expires_in_seconds: 300 })
  expect(body.code).toMatch(/^[A-Z0-9]{8}$/)

  // No swap confirmation for an unclaimed register.
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const card = setupCodeCard(page)
  await expect(card).toBeVisible()
  await expect(card).toContainText(label)
  await expect(card.getByText(body.code)).toBeVisible()
  await expect(card).toContainText('(300s)')
})

test('new register round-trip: setup code redeems and the row becomes occupied', async ({
  page,
  request,
}) => {
  const suffix = String(Date.now())
  const label = `qa-redeem-${suffix}`
  // `isValidTerminalId` accepts [A-Za-z0-9_-]{8,64} and redeem uppercases it.
  const terminalId = `QATERM${suffix.slice(-8)}`
  const deviceSerial = `qa-device-${suffix}`

  const issued = await issueSetupCode(request, label)
  expect(issued.status()).toBe(201)
  const { code } = await issued.json()
  expect(code).toMatch(/^[A-Z0-9]{8}$/)

  const redeemed = await request.post(`${API_BASE_URL}/api/terminals/redeem`, {
    headers: { 'X-Api-Token': API_TOKEN },
    data: { code, device_serial: deviceSerial, terminal_id: terminalId },
  })
  expect(redeemed.status()).toBe(200)
  const body = await redeemed.json()
  expect(body).toMatchObject({ status: 'redeemed' })
  expect(typeof body.api_token).toBe('string')
  expect(body.api_token.length).toBeGreaterThan(0)
  // `store` is the config shape, not the register row: shape-alias check per §3.
  expect(body.store).toMatchObject({
    terminal_id: terminalId,
    merchant_id: MERCHANT_ID,
    label,
  })

  await page.reload()
  await openRegisters(page)

  const row = page.getByRole('row', { name: new RegExp(label) })
  await expect(row).not.toContainText('Unclaimed')
  await expect(row.locator('code')).toHaveText(terminalId)
})

test('401 from the registers list shows the unauthorized error', async ({ page }) => {
  await stubRegistersList(page, { error: 'unauthorized' }, 401)

  await openRegisters(page)

  await expect(page.getByRole('alert')).toContainText('Unauthorized — check the API token.')
})

test('404 on the registers route shows the not-available state', async ({ page }) => {
  await stubRegistersList(page, { message: 'Not found' }, 404)

  await openRegisters(page)

  await expect(page.getByText('The registers list is not available yet.')).toBeVisible()
})

test('404 when issuing a code shows issuing is not available', async ({ page }) => {
  await stubRegistersList(page, [OCCUPIED_REGISTER])
  await page.route(SETUP_CODE, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Not found' }),
    })
  })

  await openRegisters(page)
  await page.getByRole('button', { name: 'Issue' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()

  await expect(page.getByText('Issuing setup codes is not available yet.')).toBeVisible()
})

test('legacy Pair terminal tab still works', async ({ page }) => {
  await page.getByRole('button', { name: 'Pair terminal' }).click()
  await expect(page.getByRole('heading', { name: 'Pair a terminal' })).toBeVisible()

  const input = page.getByLabel('Pairing code')
  await input.fill('AB12')
  await page.getByRole('button', { name: 'Claim terminal' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Enter the 8-character pairing code',
  )

  await input.fill('ZZZZZZZZ')
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/terminals/claim')),
    page.getByRole('button', { name: 'Claim terminal' }).click(),
  ])
  expect(response.status()).toBe(404)
  await expect(page.getByText(/Pairing is not available yet/)).toBeVisible()
})
