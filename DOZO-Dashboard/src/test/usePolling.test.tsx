import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from '../lib/usePolling'

let hidden = false

beforeEach(() => {
  hidden = false
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (document as unknown as { hidden?: unknown }).hidden
})

describe('usePolling', () => {
  it('ticks every 10s while visible and pauses while hidden', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    renderHook(() => usePolling(tick, { intervalMs: 10_000 }))

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(tick).toHaveBeenCalledTimes(3)

    hidden = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(tick).toHaveBeenCalledTimes(3)

    hidden = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(tick).toHaveBeenCalledTimes(4)
  })

  it('does not poll when disabled', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    renderHook(() => usePolling(tick, { intervalMs: 10_000, enabled: false }))

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(tick).not.toHaveBeenCalled()
  })

  it('does not poll when the document is already hidden', () => {
    vi.useFakeTimers()
    hidden = true
    const tick = vi.fn()
    renderHook(() => usePolling(tick, { intervalMs: 10_000 }))

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(tick).not.toHaveBeenCalled()
  })
})
