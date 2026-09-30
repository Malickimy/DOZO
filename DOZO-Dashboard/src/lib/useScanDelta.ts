import { useCallback, useEffect, useState } from 'react'

export interface ScanDelta {
  message: string | null
  dismiss: () => void
}

const DEFAULT_DISMISS_MS = 6000

interface DeltaState {
  key: string
  total: number
  message: string | null
}

/**
 * Watches `totalScans` for increases and produces a `+N scans` toast message.
 *
 * The first value (after mount, or after `key` changes) is only a baseline, so
 * the initial load never toasts. `key` should combine the merchant and range so
 * a filter change resets the baseline instead of looking like a jump.
 */
export function useScanDelta(
  totalScans: number | null | undefined,
  key: string,
  { dismissMs = DEFAULT_DISMISS_MS }: { dismissMs?: number } = {},
): ScanDelta {
  const [state, setState] = useState<DeltaState | null>(null)

  // Adjust the baseline during render (React's "derive state from props"
  // pattern) so a key change is handled in the same commit as the new total.
  if (totalScans != null) {
    if (state == null || state.key !== key) {
      setState({ key, total: totalScans, message: null })
    } else if (state.total !== totalScans) {
      const delta = totalScans - state.total
      setState({
        key,
        total: totalScans,
        message: delta > 0 ? `+${delta} scan${delta === 1 ? '' : 's'}` : state.message,
      })
    }
  } else if (state !== null && state.key !== key) {
    setState(null)
  }

  useEffect(() => {
    if (!state?.message) return
    const timer = setTimeout(() => {
      setState((prev) => (prev ? { ...prev, message: null } : prev))
    }, dismissMs)
    return () => clearTimeout(timer)
  }, [state?.message, dismissMs])

  const dismiss = useCallback(() => {
    setState((prev) => (prev ? { ...prev, message: null } : prev))
  }, [])

  return { message: state?.message ?? null, dismiss }
}
