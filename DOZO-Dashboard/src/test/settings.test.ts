import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSettings, loadSettings, saveSettings } from '../lib/settings'

const LEGACY_BASE_URL_KEY = 'papier.dashboard.apiBaseUrl'
const LEGACY_TOKEN_KEY = 'papier.dashboard.apiToken'
const BASE_URL_KEY = 'dozo.dashboard.apiBaseUrl'
const TOKEN_KEY = 'dozo.dashboard.apiToken'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('settings migration', () => {
  it('migrates legacy papier keys to dozo keys on load', () => {
    window.localStorage.setItem(LEGACY_BASE_URL_KEY, 'http://legacy:3000')
    window.localStorage.setItem(LEGACY_TOKEN_KEY, 'legacy-token')

    const settings = loadSettings()

    expect(settings.baseUrl).toBe('http://legacy:3000')
    expect(settings.token).toBe('legacy-token')
    expect(window.localStorage.getItem(BASE_URL_KEY)).toBe('http://legacy:3000')
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('legacy-token')
    expect(window.localStorage.getItem(LEGACY_BASE_URL_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull()
  })

  it('prefers existing dozo keys over legacy keys', () => {
    window.localStorage.setItem(LEGACY_BASE_URL_KEY, 'http://legacy:3000')
    window.localStorage.setItem(BASE_URL_KEY, 'http://dozo:3000')

    expect(loadSettings().baseUrl).toBe('http://dozo:3000')
    expect(window.localStorage.getItem(LEGACY_BASE_URL_KEY)).toBe('http://legacy:3000')
  })

  it('round-trips through save and clear', () => {
    saveSettings({ baseUrl: 'http://dozo:3000', token: 'dozo-token' })

    expect(loadSettings()).toEqual({ baseUrl: 'http://dozo:3000', token: 'dozo-token' })

    clearSettings()

    expect(window.localStorage.getItem(BASE_URL_KEY)).toBeNull()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_BASE_URL_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull()
  })
})
