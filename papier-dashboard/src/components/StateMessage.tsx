import type { ReactNode } from 'react'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  children,
}: {
  error: Error
  onRetry?: () => void
  children?: ReactNode
}) {
  return (
    <div className="state state--error" role="alert">
      <strong>Something went wrong.</strong>
      <span>{error.message}</span>
      {children}
      {onRetry ? (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function NotAvailable({ label }: { label: string }) {
  return (
    <div className="state state--muted" role="status">
      <strong>{label} is not available yet.</strong>
      <span>The endpoint returned 404 — it is still being implemented on the server.</span>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state state--muted">{children}</div>
}
