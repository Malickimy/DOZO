import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  /** Loud refetch: shows the loading state, used for user-initiated retries. */
  reload: () => void
  /**
   * Silent refetch for polling: updates `data` without toggling `loading`, and
   * leaves the last good value (and error) in place if the request fails.
   */
  refresh: () => Promise<void>
}

/**
 * Runs an async loader whenever `deps` change and exposes loading/error/data
 * plus `reload`/`refresh`. The loader is read through a ref so callers can pass
 * an inline closure without re-triggering the effect on every render.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  // Only the newest request may write state; a stale loud load must not clear
  // the loading flag after a newer silent refresh has already completed.
  const generationRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async (silent: boolean) => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await loaderRef.current()
      if (generationRef.current === generation && mountedRef.current) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      // Polling failures are transient: keep the last good data on screen
      // instead of replacing it with an error state every 10 seconds.
      if (!silent && generationRef.current === generation && mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      if (generationRef.current === generation && mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void run(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, run])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const refresh = useCallback(() => run(true), [run])

  return { data, loading, error, reload, refresh }
}
