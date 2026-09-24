import { defineConfig, devices } from '@playwright/test'

/**
 * Browser E2E for the DOZO merchant dashboard.
 *
 * `npm run test:e2e` boots two servers via `webServer`:
 *   1. the redirect server from the sibling checkout `../DOZO-Server` on :3100,
 *      seeded with the demo merchant/terminal (`SEED_DEMO=true`, DB at
 *      `/tmp/dozo-e2e.db`);
 *   2. the Vite dev server on :5273, pointed at that API via `VITE_API_BASE_URL`.
 *
 * Requires the server checkout's dependencies to be installed once
 * (`npm install` in `../DOZO-Server`).
 *
 * Specs use the `*.e2e.ts` suffix so Vitest's default `*.{test,spec}` glob
 * never picks them up and `tsc -b` (which only includes `src`) ignores them.
 */
const API_PORT = 3100
const WEB_PORT = 5273
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`
const WEB_BASE_URL = `http://127.0.0.1:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm start',
      cwd: '../DOZO-Server',
      url: `${API_BASE_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(API_PORT),
        DB_PATH: '/tmp/dozo-e2e.db',
        SEED_DEMO: 'true',
        API_TOKEN: 'dev-placeholder-token',
        DASHBOARD_ORIGIN: '*',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: WEB_BASE_URL,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_API_BASE_URL: API_BASE_URL },
    },
  ],
})
