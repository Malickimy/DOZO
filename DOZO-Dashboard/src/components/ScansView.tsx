import { useEffect, useRef, useState } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, MerchantSummary, Terminal } from '../lib/api'
import { formatDateTime, terminalName } from '../lib/format'
import { useT } from '../lib/i18n'
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
  /** Bumped by the 10s poll and the manual Refresh to silently refetch. */
  refreshToken?: number
}

export function ScansView({
  client,
  merchantId,
  terminals,
  range,
  onRangeChange,
  summary,
  refreshToken = 0,
}: ScansViewProps) {
  const t = useT()
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

  // Silent refetch on a poll/refresh tick: the scans log and trend stay current
  // without dropping back to their loading placeholder.
  const scansRefresh = scansState.refresh
  const seriesRefresh = seriesState.refresh
  const lastToken = useRef(refreshToken)
  useEffect(() => {
    if (refreshToken === lastToken.current) return
    lastToken.current = refreshToken
    void scansRefresh()
    void seriesRefresh()
  }, [refreshToken, scansRefresh, seriesRefresh])

  const bars = summary?.scans_by_terminal ?? []
  const maxScans = Math.max(1, ...bars.map((bar) => bar.scan_count))
  const scans = scansState.data ?? []
  const series = seriesState.data ?? []
  const nameById = new Map(
    terminals.map((terminal) => [terminal.terminal_id, terminalName(terminal.label, terminal.terminal_id)]),
  )

  return (
    <div className="stack">
      <div className="card">
        <RangePicker value={range} onChange={onRangeChange} />
      </div>

      <div className="card">
        <h2 className="card__title">{t('Skany według terminala', 'Scans per terminal')}</h2>
        <p className="muted">
          {t(
            'Liczba skanów w wybranym okresie. Powtórny skan z tego samego telefonu w krótkim czasie liczymy raz, a samych opinii nie da się przypisać.',
            'Scan volume for the selected range — a scan is logged once per device per debounce window. Reviews themselves can’t be attributed.',
          )}
        </p>
        {bars.length === 0 ? (
          <Empty>{t('Nie połączono jeszcze żadnego terminala.', 'No terminals paired yet.')}</Empty>
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
        <h2 className="card__title">{t('Trend dzienny', 'Daily trend')}</h2>
        <p className="muted">
          {t(
            'Dni liczymy w strefie czasowej sprzedawcy (Europe/Warsaw).',
            'Days are bucketed in the merchant’s local timezone (Europe/Warsaw).',
          )}
        </p>

        {seriesState.loading ? <Loading label={t('Ładowanie trendu…', 'Loading trend…')} /> : null}

        {seriesState.error && isNotAvailable(seriesState.error) ? (
          <NotAvailable label={t('Trend dzienny', 'The daily trend')} />
        ) : null}

        {seriesState.error && !isNotAvailable(seriesState.error) ? (
          <ErrorState error={seriesState.error} onRetry={seriesState.reload} />
        ) : null}

        {!seriesState.loading && !seriesState.error && series.length === 0 ? (
          <Empty>{t('Brak skanów w tym okresie.', 'No scans in this range yet.')}</Empty>
        ) : null}

        {!seriesState.error && series.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Dzień', 'Day')}</th>
                  <th className="num">{t('Skany', 'Scans')}</th>
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
          <h2 className="card__title">{t('Dziennik skanów', 'Scan log')}</h2>
          <label className="field field--inline">
            <span className="field__label">{t('Terminal', 'Terminal')}</span>
            <select
              className="input"
              value={terminalFilter}
              onChange={(event) => setTerminalFilter(event.target.value)}
            >
              <option value="">{t('Wszystkie terminale', 'All terminals')}</option>
              {terminals.map((terminal) => (
                <option key={terminal.terminal_id} value={terminal.terminal_id}>
                  {terminalName(terminal.label, terminal.terminal_id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {scansState.loading ? <Loading label={t('Ładowanie skanów…', 'Loading scans…')} /> : null}

        {scansState.error && isNotAvailable(scansState.error) ? (
          <NotAvailable label={t('Dziennik skanów', 'The scan log')} />
        ) : null}

        {scansState.error && !isNotAvailable(scansState.error) ? (
          <ErrorState error={scansState.error} onRetry={scansState.reload} />
        ) : null}

        {!scansState.loading && !scansState.error && scans.length === 0 ? (
          <Empty>
            {t(
              'Brak skanów. Gdy klient zeskanuje kod z terminala, zobaczysz go tutaj.',
              'No scans recorded yet. Once a customer scans a terminal’s QR, it will show up here.',
            )}
          </Empty>
        ) : null}

        {!scansState.error && scans.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('Zdarzenie', 'Event')}</th>
                  <th>{t('Terminal', 'Terminal')}</th>
                  <th>{t('Czas skanu', 'Scanned at')}</th>
                  <th>{t('Przeglądarka', 'User agent')}</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id}>
                    <td>{scan.id}</td>
                    <td>
                      <code>{scan.event_id || '—'}</code>
                    </td>
                    <td>
                      {nameById.get(scan.terminal_id) ?? <code>{scan.terminal_id}</code>}
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
