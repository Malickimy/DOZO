import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { setLang } from '../lib/i18n'

// The app defaults to Polish; component tests assert the English copy.
beforeEach(() => {
  setLang('en')
})

afterEach(() => {
  cleanup()
})
