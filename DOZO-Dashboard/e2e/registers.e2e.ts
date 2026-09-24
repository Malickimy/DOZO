import { expect, test, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the "Registers & setup codes" tab (Release Board R1).
 *
 * Golden path and the occupied-swap guard run against the real (seeded) server.
 * The unoccupied-register branch and the error states stub the HTTP responses
 * with `page.route` because the server can never return an unoccupied register
 * (`terminal_id` is the terminals PK, always non-null — see QA Round 1 Bug B).
 */
const API_BASE_URL = 'http://127.0.0.1:3100'
const API_TOKEN = 'dev-placeholder-token'

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

  const table = page.getByRole('table')
  await expect(table.getByRole('cell', { name: 'Demo terminal' })).toBeVisible()
  await expect(table.getByRole('cell', { name: 'DEMOTERM01' })).toBeVisible()
  await expect(table.getByRole('cell', { name: 'Active', exact: true })).toBeVisible()
  await expect(table.getByRole('cell', { name: 'never' })).toBeVisible()

  await page.getByRole('button', { name: 'Issue' }).click()
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
}) => {
  // Server gap: `terminal_id` can never be null, so stub the list to expose the
  // unoccupied branch. The POST still goes to the real server.
  await stubRegistersList(page, [OCCUPIED_REGISTER, { ...OCCUPIED_REGISTER, label: 'Till 2', terminal_id: null }])

  await openRegisters(page)

  const till2 = page.getByRole('row', { name: /Till 2/ })
  await expect(till2).toContainText('Unclaimed')

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/setup-code'),
    ),
    till2.getByRole('button', { name: 'Issue' }).click(),
  ])
  expect(response.status()).toBe(201)

  const body = await response.json()
  expect(body).toMatchObject({ merchant_id: 'demo-merchant', label: 'Till 2', expires_in_seconds: 300 })
  expect(body.code).toMatch(/^[A-Z0-9]{8}$/)

  // No swap confirmation for an unclaimed register.
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const card = setupCodeCard(page)
  await expect(card).toBeVisible()
  await expect(card.getByText(body.code)).toBeVisible()
  await expect(card).toContainText('(300s)')
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
