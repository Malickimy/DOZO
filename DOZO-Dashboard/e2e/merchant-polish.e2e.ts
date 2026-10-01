import { expect, test } from '@playwright/test'
import {
  cleanupMerchants,
  horizontalOverflow,
  offlinePanel,
  openTab,
  seedMerchantWithTerminal,
  selectMerchant,
  signIn,
  type SeededMerchant,
} from './qa-helpers'

/**
 * Browser-level QA for Dashboard Sprint 6 (merchant-grade polish).
 *
 * Covers the acceptance criteria that need a real browser + the real server:
 *
 *   1. per-merchant client-side offline filter (`OfflinePanel` filters the
 *      fleet-wide `GET /api/terminals/offline` payload by `merchant_id`);
 *   2. polished empty / error / loading copy;
 *   3. no horizontal page overflow at laptop (~1024px) and demo widths.
 *
 * The same-origin dev proxy is verified separately in `dev-proxy.e2e.ts`,
 * because the Playwright `webServer` block pins `VITE_API_BASE_URL` to the API
 * origin (so the main suite never exercises the Vite proxy).
 */

const seeded: string[] = []

function seed(prefix: string, opts: { offline: boolean }): SeededMerchant {
  const merchant = seedMerchantWithTerminal(prefix, opts)
  seeded.push(merchant.merchantId)
  return merchant
}

test.afterEach(() => {
  cleanupMerchants(seeded.splice(0))
})

test('offline panel scopes to the active merchant and updates when switching', async ({
  page,
}) => {
  // Two merchants, each with one terminal that has never sent a heartbeat.
  const merchantA = seed('offline-a', { offline: true })
  const merchantB = seed('offline-b', { offline: true })

  await signIn(page)
  await selectMerchant(page, merchantA.merchantId)
  // The offline panel lives on the Terminals tab in the redesigned shell.
  await openTab(page, 'Terminals')

  const panel = offlinePanel(page)
  await expect(panel.getByText(merchantA.label)).toBeVisible()
  // B is offline too, so this is the discriminating assertion: a broken filter
  // would leak the fleet-wide list.
  await expect(panel.getByText(merchantB.label)).toHaveCount(0)

  await selectMerchant(page, merchantB.merchantId)

  await expect(panel.getByText(merchantB.label)).toBeVisible()
  await expect(panel.getByText(merchantA.label)).toHaveCount(0)
})

test('offline panel shows the polished loading copy while the fleet list is in flight', async ({
  page,
}) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/terminals/offline', async (route) => {
    await gate
    await route.continue()
  })

  try {
    await signIn(page)
    await openTab(page, 'Terminals')
    await expect(page.getByText('Checking terminals…')).toBeVisible()
  } finally {
    release()
  }

  await expect(page.getByRole('heading', { name: 'Offline terminals' })).toBeVisible()
})

test('empty scan log and empty trend show the polished empty copy', async ({ page }) => {
  const merchant = seed('empty-log', { offline: true })

  await signIn(page)
  await selectMerchant(page, merchant.merchantId)
  // The scan log and daily trend render on the default Overview tab.

  const scanLog = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Scan log' }) })
  await expect(
    scanLog.getByText(
      'No scans recorded yet. Once a customer scans a terminal’s QR, it will show up here.',
    ),
  ).toBeVisible()
  await expect(page.getByText('No scans in this range yet.')).toBeVisible()
})

test('merchant with no offline terminals shows the all-clear empty state', async ({ page }) => {
  const merchant = seed('all-clear', { offline: false })

  await signIn(page)
  await selectMerchant(page, merchant.merchantId)
  await openTab(page, 'Terminals')

  await expect(
    offlinePanel(page).getByText('All terminals are reporting in.'),
  ).toBeVisible()
})

test('404 on the merchant route shows the not-available copy', async ({ page }) => {
  await page.route('**/api/merchants', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Route not found' }),
    })
  })

  await signIn(page)

  await expect(page.getByText('The merchant list is not available yet.')).toBeVisible()
  await expect(page.getByText('Merchant ID (merchant list unavailable)')).toBeVisible()
  // 404 is a "not rolled out yet" state, not a hard error.
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('500 on the merchant route shows the retryable error copy', async ({ page }) => {
  await page.route('**/api/merchants', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'boom' }),
    })
  })

  await signIn(page)

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Something went wrong.')
  await expect(alert).toContainText('Request failed (500): boom')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

const VIEWPORTS = [
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'demo', width: 1280, height: 720 },
  { name: 'wide-demo', width: 1440, height: 900 },
] as const

const VIEWS = [
  { button: 'Overview', heading: 'Overview' },
  { button: 'Terminals', heading: 'Terminals' },
  { button: 'Screen after payment', heading: 'After-payment screen' },
  { button: 'Contacts', heading: 'Contacts' },
  { button: 'Guide', heading: 'Guide' },
  { button: 'Subscription', heading: 'Subscription' },
] as const

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await signIn(page)

    for (const { button, heading } of VIEWS) {
      await openTab(page, button)
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      const overflow = await horizontalOverflow(page)
      expect(overflow, `${button} overflows by ${overflow}px at ${viewport.name}`).toBeLessThanOrEqual(0)
    }
  })
}
