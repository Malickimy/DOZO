import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScanDelta } from '../lib/useScanDelta'

interface Props {
  total: number | null
  key: string
}

describe('useScanDelta', () => {
  it('does not toast on the first value, then toasts each increase', () => {
    const { result, rerender } = renderHook(
      ({ total, key }: Props) => useScanDelta(total, key, { dismissMs: 100_000 }),
      { initialProps: { total: 3, key: 'm1|a|b' } as Props },
    )
    expect(result.current.message).toBeNull()

    rerender({ total: 5, key: 'm1|a|b' })
    expect(result.current.message).toBe('+2 scans')

    rerender({ total: 6, key: 'm1|a|b' })
    expect(result.current.message).toBe('+1 scan')
  })

  it('resets the baseline when the merchant/range key changes', () => {
    const { result, rerender } = renderHook(
      ({ total, key }: Props) => useScanDelta(total, key, { dismissMs: 100_000 }),
      { initialProps: { total: 3, key: 'm1|a|b' } as Props },
    )

    rerender({ total: 4, key: 'm1|a|b' })
    expect(result.current.message).toBe('+1 scan')

    // A bigger total under a new key is a new baseline, not a jump.
    rerender({ total: 100, key: 'm2|a|b' })
    expect(result.current.message).toBeNull()

    rerender({ total: 107, key: 'm2|a|b' })
    expect(result.current.message).toBe('+7 scans')
  })

  it('does not toast when the total drops, and can be dismissed', () => {
    const { result, rerender } = renderHook(
      ({ total, key }: Props) => useScanDelta(total, key, { dismissMs: 100_000 }),
      { initialProps: { total: 10, key: 'm1|a|b' } as Props },
    )

    rerender({ total: 12, key: 'm1|a|b' })
    expect(result.current.message).toBe('+2 scans')

    act(() => result.current.dismiss())
    expect(result.current.message).toBeNull()

    rerender({ total: 11, key: 'm1|a|b' })
    expect(result.current.message).toBeNull()

    rerender({ total: 20, key: 'm1|a|b' })
    expect(result.current.message).toBe('+9 scans')
  })
})
