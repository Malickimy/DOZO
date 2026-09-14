import { useState } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, Terminal } from '../lib/api'
import { formatDateTime, terminalName } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'

interface ScansViewProps {
  client: ApiClient
  merchantId: string
  terminals: Terminal[]
}

export function ScansView({ client, merchantId, terminals }: ScansViewProps) {
  const [terminalFilter, setTerminalFilter] = useState('')

  const scansState = useAsync(
    () =>
      client.listScans(merchantId, {
        terminal_id: terminalFilter || undefined,
        limit: 100,
      }),
    [client, merchantId, terminalFilter],
  )

  const maxScans = Math.max(1, ...terminals.map((terminal) => terminal.scan_count))
  const scans = scansState.data ?? []

  return (
    <div className="stack">
      <div className="card">
        <h2 className="card__title">Scans per terminal</h2>
        <p className="muted">
          Scan volume is the metric — a scan is logged once per device per debounce
          window. Reviews themselves can’t be attributed.
        </p>
        {terminals.length === 0 ? (
          <Empty>No terminals paired yet.</Empty>
        ) : (
          <ul className="bars">
            {terminals.map((terminal) => (
              <li className="bar" key={terminal.terminal_id}>
                <span className="bar__label" title={terminal.terminal_id}>
                  {terminalName(terminal.label, terminal.terminal_id)}
                </span>
                <span className="bar__track">
                  <span
                    className="bar__fill"
                    style={{ width: `${(terminal.scan_count / maxScans) * 100}%` }}
                  />
                </span>
                <span className="bar__value">{terminal.scan_count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Scan log</h2>
          <label className="field field--inline">
            <span className="field__label">Terminal</span>
            <select
              className="input"
              value={terminalFilter}
              onChange={(event) => setTerminalFilter(event.target.value)}
            >
              <option value="">All terminals</option>
              {terminals.map((terminal) => (
                <option key={terminal.terminal_id} value={terminal.terminal_id}>
                  {terminalName(terminal.label, terminal.terminal_id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {scansState.loading ? <Loading label="Loading scans…" /> : null}

        {scansState.error && isNotAvailable(scansState.error) ? (
          <NotAvailable label="The scan log" />
        ) : null}

        {scansState.error && !isNotAvailable(scansState.error) ? (
          <ErrorState error={scansState.error} onRetry={scansState.reload} />
        ) : null}

        {!scansState.loading && !scansState.error && scans.length === 0 ? (
          <Empty>
            No scans recorded yet. Once a customer scans a terminal’s QR, it will show
            up here.
          </Empty>
        ) : null}

        {!scansState.error && scans.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Terminal</th>
                  <th>Scanned at</th>
                  <th>User agent</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id}>
                    <td>{scan.id}</td>
                    <td>
                      <code>{scan.terminal_id}</code>
                    </td>
                    <td>{formatDateTime(scan.scanned_at)}</td>
                    <td className="ua">{scan.user_agent || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
