/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import viteConfigSource from '../../vite.config.ts?raw'

// Read the stylesheet from disk: Vitest's `css: false` stubs out CSS imports
// (including `?raw`), so the raw source is the reliable way to assert on it.
// `vitest run` is invoked from the DOZO-Dashboard package root.
const appCss = readFileSync('src/App.css', 'utf8')

describe('responsive layout', () => {
  it('defines breakpoints for laptop and demo widths', () => {
    expect(appCss).toMatch(/@media\s*\(max-width:\s*1024px\)/)
    expect(appCss).toMatch(/@media\s*\(max-width:\s*720px\)/)
    expect(appCss).toMatch(/@media\s*\(max-width:\s*420px\)/)
  })

  it('keeps wide tables scrollable inside their card, not the page', () => {
    expect(appCss).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/s)
  })

  it('wraps the tab bar instead of overflowing on narrow screens', () => {
    expect(appCss).toMatch(/\.tabs\s*\{[^}]*flex-wrap:\s*wrap/s)
  })
})

describe('dev proxy', () => {
  it('proxies /api and /health to the local server', () => {
    expect(viteConfigSource).toMatch(/['"]\/api['"]\s*:/)
    expect(viteConfigSource).toMatch(/['"]\/health['"]\s*:/)
  })
})
