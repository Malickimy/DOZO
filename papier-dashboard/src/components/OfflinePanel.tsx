import { isNotAvailable } from '../lib/api'
import type { ApiClient } from '../lib/api'
import { formatRelative, terminalName } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'

export function OfflinePanel({ client }: { client: ApiClient }) {
  const state = useAsync(() => client.listOfflineTerminals(), [client])

  if (state.loading) return <Loading label="Checking terminals…" />
  if (state.error && isNotAvailable(state.error)) {
    return <NotAvailable label="Offline terminals" />
  }
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />
  if (!state.data) return null

  const { terminals, threshold_seconds } = state.data
  const thresholdHours = Math.round(threshold_seconds / 3600)

  return (
    <div className="card">
      <h2 className="card__title">Offline terminals</h2>
      <p className="muted">
        No heartbeat in the last {thresholdHours}h (threshold {threshold_seconds}s).
      </p>
      {terminals.length === 0 ? (
        <Empty>All terminals are reporting in.</Empty>
      ) : (
        <ul className="list">
          {terminals.map((terminal) => (
            <li key={terminal.terminal_id}>
              <span>{terminalName(terminal.label, terminal.terminal_id)}</span>
              <span className="muted">last seen {formatRelative(terminal.last_seen)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
