import { isNotAvailable } from '../lib/api'
import type { ApiClient } from '../lib/api'
import { formatRelative, terminalName } from '../lib/format'
import { useT } from '../lib/i18n'
import { useAsync } from '../lib/useAsync'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'

interface OfflinePanelProps {
  client: ApiClient
  /** When set, only this merchant's terminals are listed. */
  merchantId?: string
}

export function OfflinePanel({ client, merchantId = '' }: OfflinePanelProps) {
  const t = useT()
  const state = useAsync(() => client.listOfflineTerminals(), [client])

  if (state.loading) return <Loading label={t('Sprawdzam terminale…', 'Checking terminals…')} />
  if (state.error && isNotAvailable(state.error)) {
    return <NotAvailable label={t('Terminale offline', 'Offline terminals')} />
  }
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />
  if (!state.data) return null

  const { terminals, threshold_seconds } = state.data
  const thresholdHours = Math.round(threshold_seconds / 3600)
  // The endpoint is fleet-wide and operator-only, so scope it to the merchant
  // selected in the dashboard on the client instead of adding a server query.
  const scoped = merchantId
    ? terminals.filter((terminal) => terminal.merchant_id === merchantId)
    : terminals

  return (
    <div className="card">
      <h2 className="card__title">{t('Terminale offline', 'Offline terminals')}</h2>
      <p className="muted">
        {t(
          `Brak sygnału w ciągu ostatnich ${thresholdHours} godz. (próg ${threshold_seconds} s).`,
          `No heartbeat in the last ${thresholdHours}h (threshold ${threshold_seconds}s).`,
        )}
      </p>
      {scoped.length === 0 ? (
        <Empty>{t('Wszystkie terminale są w kontakcie.', 'All terminals are reporting in.')}</Empty>
      ) : (
        <ul className="list">
          {scoped.map((terminal) => (
            <li key={terminal.terminal_id}>
              <span>{terminalName(terminal.label, terminal.terminal_id)}</span>
              <span className="muted">
                {t('ostatnio', 'last seen')} {formatRelative(terminal.last_seen)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
