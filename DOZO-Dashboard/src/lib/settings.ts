/** Persisted dashboard settings (API base URL + token). */

export interface Settings {
  baseUrl: string
  token: string
}

const BASE_URL_KEY = 'papier.dashboard.apiBaseUrl'
const TOKEN_KEY = 'papier.dashboard.apiToken'

function envBaseUrl(): string {
  const fromEnv = import.meta.env?.VITE_API_BASE_URL
  return typeof fromEnv === 'string' ? fromEnv.trim() : ''
}

export const DEFAULT_API_BASE_URL = envBaseUrl() || 'http://130.162.185.144:3000'

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode / SSR) — settings stay in memory */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  return {
    baseUrl: safeGet(BASE_URL_KEY) ?? DEFAULT_API_BASE_URL,
    token: safeGet(TOKEN_KEY) ?? '',
  }
}

export function saveSettings(settings: Settings): void {
  safeSet(BASE_URL_KEY, settings.baseUrl)
  safeSet(TOKEN_KEY, settings.token)
}

export function clearSettings(): void {
  safeRemove(BASE_URL_KEY)
  safeRemove(TOKEN_KEY)
}
