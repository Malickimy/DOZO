import type { ReactNode } from 'react'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
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
      <span className="state__detail">{error.message}</span>
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
      <span className="state__detail">
        The server answered 404 for this endpoint — it may still be rolling out.
      </span>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="state state--muted" role="status">
      {children}
    </div>
  )
}
