import { useEffect, useRef } from 'react'

export interface PollingOptions {
  intervalMs: number
  /** When false the timer is never started. Defaults to true. */
  enabled?: boolean
}

/** Page Visibility: a closed/minimised tab must not keep polling. */
function isDocumentHidden(): boolean {
  if (typeof document === 'undefined') return false
  return document.hidden || document.visibilityState === 'hidden'
}

/**
 * Calls `callback` every `intervalMs` while the browser tab is visible and
 * pauses on `visibilitychange` when the tab is hidden, resuming when it comes
 * back. `callback` is read through a ref so an inline closure does not restart
 * the timer on every render.
 */
export function usePolling(
  callback: () => void,
  { intervalMs, enabled = true }: PollingOptions,
): void {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const start = () => {
      if (timer !== null || isDocumentHidden()) return
      timer = setInterval(() => callbackRef.current(), intervalMs)
    }
    const onVisibilityChange = () => {
      if (isDocumentHidden()) stop()
      else start()
    }

    start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, intervalMs])
}
