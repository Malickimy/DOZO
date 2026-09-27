import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'

export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label ?? t('Ładowanie…', 'Loading…')}
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
  const t = useT()
  return (
    <div className="state state--error" role="alert">
      <strong>{t('Coś poszło nie tak.', 'Something went wrong.')}</strong>
      <span className="state__detail">{error.message}</span>
      {children}
      {onRetry ? (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          {t('Spróbuj ponownie', 'Retry')}
        </button>
      ) : null}
    </div>
  )
}

export function NotAvailable({ label }: { label: string }) {
  const t = useT()
  return (
    <div className="state state--muted" role="status">
      <strong>
        {label}
        {t(': funkcja jeszcze niedostępna.', ' is not available yet.')}
      </strong>
      <span className="state__detail">
        {t(
          'Serwer zwrócił 404 — ten endpoint jest jeszcze w przygotowaniu.',
          'The endpoint returned 404 — it is still being implemented on the server.',
        )}
      </span>
    </div>
  )
}

/** A feature designed in the GUI whose server endpoint does not exist yet. */
export function AwaitingApi({ children }: { children?: ReactNode }) {
  const t = useT()
  return (
    <div className="state state--awaiting" role="status">
      <strong>{t('Czeka na API', 'Awaiting API')}</strong>
      <span>
        {children ??
          t(
            'Ta funkcja jest zaprojektowana, ale serwer nie udostępnia jeszcze potrzebnego endpointu.',
            'This feature is designed, but the server does not expose the endpoint it needs yet.',
          )}
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
