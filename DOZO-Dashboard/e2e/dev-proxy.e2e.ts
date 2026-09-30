import { spawn } from 'node:child_process'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { API_BASE_URL, API_TOKEN } from './env'
import { TOKEN_KEY } from './qa-helpers'

/**
 * Verifies the Sprint 6 Vite dev proxy and the same-origin SPA default.
 *
 * The main Playwright config pins `VITE_API_BASE_URL` to the API origin on its
 * `webServer` Vite instance, so the primary suite never traverses the proxy. To
 * honour the acceptance criterion ("with `VITE_API_BASE_URL` unset, the dev
 * server's `/api` proxy reaches the server") this spec boots a *second* Vite
 * dev server with `VITE_API_BASE_URL` removed and
 * `VITE_API_PROXY_TARGET=http://127.0.0.1:3100`, then round-trips through it.
 */

const PROXY_PORT = 5274
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`

test('dev server proxies /api and /health under the same-origin default', async ({
  page,
  request,
}) => {
  const configDir = path.dirname(test.info().config.configFile!)
  const env = { ...process.env, VITE_API_PROXY_TARGET: API_BASE_URL }
  delete env.VITE_API_BASE_URL

  const viteBin = path.join(configDir, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(
    process.execPath,
    [viteBin, '--port', String(PROXY_PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: configDir, env, stdio: 'ignore' },
  )

  try {
    // Readiness + round-trip: `/health` is public, so a JSON `{status:'ok'}`
    // body proves the request reached the Fastify server, not Vite's SPA
    // fallback (which would return index.html).
    await expect
      .poll(
        async () => {
          try {
            const response = await request.get(`${PROXY_URL}/health`)
            if (response.status() !== 200) return null
            const body = (await response.json()) as { status?: string }
            return body.status ?? null
          } catch {
            return null
          }
        },
        { timeout: 20_000, intervals: [250, 500, 1000] },
      )
      .toBe('ok')

    const api = await request.get(`${PROXY_URL}/api/merchants`, {
      headers: { 'X-Api-Token': API_TOKEN },
    })
    expect(api.status()).toBe(200)
    expect(Array.isArray(await api.json())).toBe(true)

    // Browser proof of the same-origin default: only the token is persisted, so
    // `settings.ts` derives the base URL from `window.location.origin` (= the
    // Vite dev port) and `/api/merchants` must round-trip through the proxy.
    await page.addInitScript(
      ({ key, token }: { key: string; token: string }) => {
        window.localStorage.setItem(key, token)
      },
      { key: TOKEN_KEY, token: API_TOKEN },
    )

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'GET' && r.url().startsWith(`${PROXY_URL}/api/merchants`),
      ),
      page.goto(PROXY_URL),
    ])
    expect(response.status()).toBe(200)
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  } finally {
    child.kill('SIGTERM')
  }
})
