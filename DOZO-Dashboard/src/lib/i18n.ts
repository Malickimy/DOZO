import { useSyncExternalStore } from 'react'

export type Lang = 'pl' | 'en'

// Shared with the homepage, which is served from the same origin.
const STORAGE_KEY = 'doozo-lang'

const listeners = new Set<() => void>()

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'pl'
  } catch {
    return 'pl'
  }
}

let current: Lang = readStoredLang()
document.documentElement.lang = current

export function getLang(): Lang {
  return current
}

export function setLang(next: Lang): void {
  current = next
  document.documentElement.lang = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

export type Translate = (pl: string, en: string) => string

/** Returns `t(pl, en)`, re-rendering the caller when the language changes. */
export function useT(): Translate {
  const lang = useLang()
  return (pl, en) => (lang === 'en' ? en : pl)
}
