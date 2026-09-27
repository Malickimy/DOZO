/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `src/lib/settings.ts` defaults the API base URL to the SPA's own origin. In
// `npm run dev` that is the Vite port, so forward the API routes to the local
// server. Override the target with VITE_API_PROXY_TARGET; point a build at a
// remote API directly with VITE_API_BASE_URL (as the Playwright e2e config does).
const proxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/health': { target: proxyTarget, changeOrigin: true },
    },
  },
  build: {
    rolldownOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        panel: fileURLToPath(new URL('./panel/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    restoreMocks: true,
  },
})
