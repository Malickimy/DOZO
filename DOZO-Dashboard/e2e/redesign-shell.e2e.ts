import { expect, test, type Page } from '@playwright/test'
import { API_BASE_URL, API_TOKEN } from './env'
import { BASE_URL_KEY, LANG_KEY, TOKEN_KEY } from './qa-helpers'

/**
 * Sprint 7 redesign shell coverage:
 *
 *   - the marketing homepage renders at `/` and links into the panel;
 *   - the panel app loads at `/panel/` once the operator token is persisted;
 *   - without a token the panel shows the operator sign-in screen (auth step);
 *   - the panel's `LangSwitch` toggles PL/EN and the visible copy follows.
 *
 * Language is the one thing the other specs pin to English; here we exercise
 * the Polish-first default explicitly, so `seedSettings` leaves `doozo-lang`
 * unset unless asked.
 */

async function seedSettings(page: Page, opts: { lang?: 'pl' | 'en' } = {}): Promise<void> {
  await page.addInitScript(
    ({
      baseUrlKey,
      tokenKey,
      langKey,
      baseUrl,
      token,
      lang,
    }: {
      baseUrlKey: string
      tokenKey: string
      langKey: string
      baseUrl: string
      token: string
      lang?: string
    }) => {
      window.localStorage.setItem(baseUrlKey, baseUrl)
      window.localStorage.setItem(tokenKey, token)
      if (lang) window.localStorage.setItem(langKey, lang)
    },
    {
      baseUrlKey: BASE_URL_KEY,
      tokenKey: TOKEN_KEY,
      langKey: LANG_KEY,
      baseUrl: API_BASE_URL,
      token: API_TOKEN,
      lang: opts.lang,
    },
  )
}

test('homepage renders at / and links to the panel', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      name: 'Spraw, by Twój terminal płatniczy zaczął zbierać opinie w Google.',
    }),
  ).toBeVisible()
  await expect(page.locator('a[href="/panel/"]').first()).toBeVisible()
})

test('panel loads at /panel/ after authenticating', async ({ page }) => {
  await seedSettings(page, { lang: 'en' })
  await page.goto('/panel/')

  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
})

test('panel shows the operator sign-in screen without a token', async ({ page }) => {
  await page.goto('/panel/')

  // Polish-first auth screen; the dashboard shell must not render yet.
  await expect(page.getByRole('heading', { name: 'Zaloguj się do panelu' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Wejdź tokenem operatora' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Sekcje' })).toHaveCount(0)
})

test('LangSwitch toggles PL/EN copy in the panel', async ({ page }) => {
  await seedSettings(page) // Polish-first default
  await page.goto('/panel/')

  await expect(page.getByRole('navigation', { name: 'Sekcje' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Przegląd', level: 1 })).toBeVisible()

  const langGroup = page.getByRole('group', { name: 'Język / Language' })
  await langGroup.getByRole('button', { name: 'EN' }).click()

  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()

  await langGroup.getByRole('button', { name: 'PL' }).click()

  await expect(page.getByRole('navigation', { name: 'Sekcje' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Przegląd', level: 1 })).toBeVisible()
})
