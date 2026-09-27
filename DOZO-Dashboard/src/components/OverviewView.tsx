import { useState } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, Terminal } from '../lib/api'
import { formatTime, recentDays, terminalName } from '../lib/format'
import { useT } from '../lib/i18n'
import { initialRange } from '../lib/range'
import { useAsync } from '../lib/useAsync'
import { usePolling } from '../lib/usePolling'
import { useScanDelta } from '../lib/useScanDelta'
import { ScanChart } from './ScanChart'
import { ScansView } from './ScansView'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'
import { Toast } from './Toast'

interface OverviewViewProps {
  client: ApiClient
  merchantId: string
  terminals: Terminal[]
}

type Range = 14 | 30

const DAY_MS = 86_400_000

/** New scans are polled for every 10s while the browser tab is visible. */
const SCAN_POLL_MS = 10_000

export function OverviewView({ client, merchantId, terminals }: OverviewViewProps) {
  const t = useT()
  const [range, setRange] = useState<Range>(14)
  // The scans section below has its own range (presets or custom dates).
  const [scansRange, setScansRange] = useState(initialRange)
  // Bumped by the 10s poll and the manual Refresh so ScansView refetches silently.
  const [dataToken, setDataToken] = useState(0)

  // Two windows back-to-back: the chart plus the previous period for the delta.
  const seriesState = useAsync(
    () =>
      client.getScanSeries(merchantId, {
        since: new Date(Date.now() - (2 * range + 1) * DAY_MS).toISOString(),
        bucket: 'day',
      }),
    [client, merchantId, range],
  )
  const recentState = useAsync(() => client.listScans(merchantId, { limit: 6 }), [client, merchantId])
  const summaryState = useAsync(
    () =>
      client.getSummary(merchantId, {
        since: scansRange.since || undefined,
        until: scansRange.until || undefined,
      }),
    [client, merchantId, scansRange.since, scansRange.until],
  )

  // Toast on a rising total only. The key resets the baseline whenever the
  // merchant or range changes, so a filtered reload never looks like new scans.
  const summaryKey = `${merchantId}|${scansRange.since}|${scansRange.until}`
  const scanDelta = useScanDelta(summaryState.data?.total_scans ?? null, summaryKey)

  usePolling(
    () => {
      void summaryState.refresh()
      setDataToken((value) => value + 1)
    },
    { intervalMs: SCAN_POLL_MS, enabled: Boolean(merchantId) },
  )

  function refreshNow() {
    summaryState.reload()
    seriesState.reload()
    recentState.reload()
    setDataToken((value) => value + 1)
  }

  const counts = new Map((seriesState.data ?? []).map((point) => [point.day, point.count]))
  const points = recentDays(range).map((day) => ({ day, count: counts.get(day) ?? 0 }))
  const total = points.reduce((sum, point) => sum + point.count, 0)
  const previous = recentDays(range, range).reduce((sum, day) => sum + (counts.get(day) ?? 0), 0)

  let delta: string | null = null
  if (seriesState.data) {
    if (previous === 0) {
      delta = total > 0 ? t('nowe skany', 'new scans') : t('bez zmian', 'no change')
    } else {
      const percent = Math.round(((total - previous) / previous) * 100)
      delta = `${percent > 0 ? '+' : ''}${percent}% ${t(`vs poprzednie ${range} dni`, `vs previous ${range} days`)}`
    }
  }

  const nameById = new Map(
    terminals.map((terminal) => [terminal.terminal_id, terminalName(terminal.label, terminal.terminal_id)]),
  )

  const awaiting = t('czeka na API', 'awaiting API')

  return (
    <div className="stack">
      <div className="toolbar-end">
        <div className="seg" role="group" aria-label={t('Okres', 'Period')}>
          {([14, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {t(`${value} dni`, `${value} days`)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost" onClick={refreshNow}>
          {t('Odśwież', 'Refresh')}
        </button>
      </div>

      <div className="kpis">
        <div className="kpi kpi--awaiting">
          <span className="kpi__k">{t('Wyświetlenia kodu', 'Code views')}</span>
          <span className="kpi__v">—</span>
          <span className="chip chip--muted">{awaiting}</span>
        </div>
        <div className="kpi">
          <span className="kpi__k">{t('Skany kodu', 'Code scans')}</span>
          <span className="kpi__v">{seriesState.data ? total : '—'}</span>
          {delta ? <span className="chip">{delta}</span> : null}
        </div>
        <div className="kpi kpi--awaiting">
          <span className="kpi__k">{t('Zapisy do newslettera', 'Newsletter sign-ups')}</span>
          <span className="kpi__v">—</span>
          <span className="chip chip--muted">{awaiting}</span>
        </div>
        <div className="kpi kpi--awaiting">
          <span className="kpi__k">{t('Wydane kody −10%', '−10% codes issued')}</span>
          <span className="kpi__v">—</span>
          <span className="chip chip--muted">{awaiting}</span>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2 className="card__title">{t('Skany kodu dziennie', 'Daily code scans')}</h2>
          <p className="muted">
            {t('Najedź na słupek, żeby zobaczyć liczbę skanów.', 'Hover a bar to see the scan count.')}
          </p>
          {seriesState.loading ? <Loading label={t('Ładowanie wykresu…', 'Loading chart…')} /> : null}
          {seriesState.error && isNotAvailable(seriesState.error) ? (
            <NotAvailable label={t('Wykres skanów', 'The scan chart')} />
          ) : null}
          {seriesState.error && !isNotAvailable(seriesState.error) ? (
            <ErrorState error={seriesState.error} onRetry={seriesState.reload} />
          ) : null}
          {seriesState.data ? <ScanChart key={range} points={points} /> : null}
        </div>

        <div className="card">
          <h2 className="card__title">{t('Ostatnie zdarzenia', 'Recent events')}</h2>
          {recentState.loading ? <Loading /> : null}
          {recentState.error ? (
            <ErrorState error={recentState.error} onRetry={recentState.reload} />
          ) : null}
          {recentState.data && recentState.data.length === 0 ? (
            <Empty>{t('Brak zdarzeń — czekamy na pierwszy skan.', 'No events yet — waiting for the first scan.')}</Empty>
          ) : null}
          {recentState.data && recentState.data.length > 0 ? (
            <ul className="feed">
              {recentState.data.map((scan) => (
                <li key={scan.id}>
                  <span className="feed__dot" aria-hidden="true" />
                  <span>
                    {t('Skan kodu, terminal', 'Code scan, terminal')}{' '}
                    {nameById.get(scan.terminal_id) ?? scan.terminal_id}
                  </span>
                  <time dateTime={scan.scanned_at}>{formatTime(scan.scanned_at)}</time>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="muted feed__note">
            {t(
              'Zapisy do newslettera i wydane kody pojawią się tu, gdy serwer zacznie je udostępniać.',
              'Newsletter sign-ups and issued codes will appear here once the server exposes them.',
            )}
          </p>
        </div>
      </div>

      <ScansView
        client={client}
        merchantId={merchantId}
        terminals={terminals}
        range={scansRange}
        onRangeChange={setScansRange}
        summary={summaryState.data}
        refreshToken={dataToken}
      />

      <Toast message={scanDelta.message} onDismiss={scanDelta.dismiss} />
    </div>
  )
}
