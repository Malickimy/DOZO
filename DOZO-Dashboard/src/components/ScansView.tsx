import { useState } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, MerchantSummary, Terminal } from '../lib/api'
import { formatDateTime, terminalName } from '../lib/format'
import type { RangeSelection } from '../lib/range'
import { useAsync } from '../lib/useAsync'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'
import { RangePicker } from './RangePicker'

interface ScansViewProps {
  client: ApiClient
  merchantId: string
  terminals: Terminal[]
  range: RangeSelection
  onRangeChange: (next: RangeSelection) => void
  summary: MerchantSummary | null
}

export function ScansView({
  client,
  merchantId,
  terminals,
  range,
  onRangeChange,
  summary,
}: ScansViewProps) {
  const [terminalFilter, setTerminalFilter] = useState('')

  const scansState = useAsync(
    () =>
      client.listScans(merchantId, {
        terminal_id: terminalFilter || undefined,
        since: range.since || undefined,
        until: range.until || undefined,
        limit: 100,
      }),
    [client, merchantId, terminalFilter, range.since, range.until],
  )

  const seriesState = useAsync(
    () =>
      client.getScanSeries(merchantId, {
        since: range.since || undefined,
        until: range.until || undefined,
        bucket: 'day',
      }),
    [client, merchantId, range.since, range.until],
  )

  const bars = summary?.scans_by_terminal ?? []
  const maxScans = Math.max(1, ...bars.map((bar) => bar.scan_count))
  const scans = scansState.data ?? []
  const series = seriesState.data ?? []

  return (
    <div className="stack">
      <div className="card">
        <RangePicker value={range} onChange={onRangeChange} />
      </div>

      <div className="card">
        <h2 className="card__title">Scans per terminal</h2>
        <p className="muted">
          Scan volume for the selected range — a scan is logged once per device per
          debounce window. Reviews themselves can’t be attributed.
        </p>
        {bars.length === 0 ? (
          <Empty>No terminals paired yet.</Empty>
        ) : (
          <ul className="bars">
            {bars.map((bar) => (
              <li className="bar" key={bar.terminal_id}>
                <span className="bar__label" title={bar.terminal_id}>
                  {terminalName(bar.label, bar.terminal_id)}
                </span>
                <span className="bar__track">
                  <span
                    className="bar__fill"
                    style={{ width: `${(bar.scan_count / maxScans) * 100}%` }}
                  />
                </span>
                <span className="bar__value">{bar.scan_count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="card__title">Daily trend</h2>
        <p className="muted">
          Days are bucketed in the merchant’s local timezone (Europe/Warsaw).
        </p>

        {seriesState.loading ? <Loading label="Loading trend…" /> : null}

        {seriesState.error && isNotAvailable(seriesState.error) ? (
          <NotAvailable label="The daily trend" />
        ) : null}

        {seriesState.error && !isNotAvailable(seriesState.error) ? (
          <ErrorState error={seriesState.error} onRetry={seriesState.reload} />
        ) : null}

        {!seriesState.loading && !seriesState.error && series.length === 0 ? (
          <Empty>No scans in this range yet.</Empty>
        ) : null}

        {!seriesState.error && series.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Scans</th>
                </tr>
              </thead>
              <tbody>
                {series.map((point) => (
                  <tr key={point.day}>
                    <td>{point.day}</td>
                    <td className="num">{point.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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
