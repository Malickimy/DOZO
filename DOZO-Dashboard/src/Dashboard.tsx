import { useState } from 'react'
import { GooglePlaceIdForm } from './components/GooglePlaceIdForm'
import { MerchantPicker } from './components/MerchantPicker'
import { OfflinePanel } from './components/OfflinePanel'
import { PairingForm } from './components/PairingForm'
import { RangePicker } from './components/RangePicker'
import { RegistersView } from './components/RegistersView'
import { ScansView } from './components/ScansView'
import { ErrorState, Empty, Loading, NotAvailable } from './components/StateMessage'
import { SummaryCards } from './components/SummaryCards'
import { TerminalDrawer } from './components/TerminalDrawer'
import { TerminalsTable } from './components/TerminalsTable'
import { isNotAvailable } from './lib/api'
import type { ApiClient, MerchantSummary, Terminal } from './lib/api'
import { initialRange } from './lib/range'
import type { Settings } from './lib/settings'
import { useAsync } from './lib/useAsync'

interface DashboardProps {
  client: ApiClient
  settings: Settings
  onOpenSettings: () => void
}

type Tab = 'overview' | 'scans' | 'pair' | 'registers'

export function Dashboard({ client, settings, onOpenSettings }: DashboardProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const [merchantId, setMerchantId] = useState('')
  const [managingId, setManagingId] = useState<string | null>(null)
  const [range, setRange] = useState(initialRange)

  const merchantsState = useAsync(() => client.listMerchants(), [client])
  const merchants = merchantsState.data ?? []
  const merchantsUnavailable = isNotAvailable(merchantsState.error)

  // Fall back to the first merchant until the user picks or types one.
  const activeMerchantId = merchantId || merchants[0]?.merchant_id || ''

  const terminalsState = useAsync<Terminal[]>(
    () => (activeMerchantId ? client.listTerminals(activeMerchantId) : Promise.resolve([])),
    [client, activeMerchantId],
  )
  const summaryState = useAsync<MerchantSummary | null>(
    () =>
      activeMerchantId
        ? client.getSummary(activeMerchantId, {
            since: range.since || undefined,
            until: range.until || undefined,
          })
        : Promise.resolve(null),
    [client, activeMerchantId, range.since, range.until],
  )

  const terminals = terminalsState.data ?? []
  const selectedMerchant =
    merchants.find((merchant) => merchant.merchant_id === activeMerchantId) ?? null
  const managingTerminal =
    terminals.find((terminal) => terminal.terminal_id === managingId) ?? null

  function refreshAfterWrite() {
    terminalsState.reload()
    summaryState.reload()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="logo" aria-hidden="true">
            P
          </span>
          <div>
            <h1 className="topbar__title">DOZO Dashboard</h1>
            <p className="topbar__subtitle">Scan volume per terminal</p>
          </div>
        </div>
        <div className="topbar__actions">
          <MerchantPicker
            merchants={merchants}
            value={activeMerchantId}
            onChange={setMerchantId}
            unavailable={merchantsUnavailable}
            loading={merchantsState.loading}
          />
          <button type="button" className="btn btn--ghost" onClick={onOpenSettings}>
            Settings
          </button>
        </div>
      </header>

      {merchantsState.error && !merchantsUnavailable ? (
        <div className="container">
          <ErrorState error={merchantsState.error} onRetry={merchantsState.reload} />
        </div>
      ) : null}

      {merchantsUnavailable ? (
        <div className="container">
          <NotAvailable label="The merchant list" />
        </div>
      ) : null}

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ['overview', 'Overview'],
            ['scans', 'Scans'],
            ['pair', 'Pair terminal'],
            ['registers', 'Registers & setup codes'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'tab tab--active' : 'tab'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="container">
        {!activeMerchantId ? (
          <Empty>Select or enter a merchant ID to load its terminals and scans.</Empty>
        ) : null}

        {activeMerchantId && tab === 'overview' ? (
          <div className="stack">
            <RangePicker value={range} onChange={setRange} />
            {summaryState.loading ? <Loading label="Loading summary…" /> : null}
            {summaryState.error && isNotAvailable(summaryState.error) ? (
              <NotAvailable label="The merchant summary" />
            ) : null}
            {summaryState.error && !isNotAvailable(summaryState.error) ? (
              <ErrorState error={summaryState.error} onRetry={summaryState.reload} />
            ) : null}
            {summaryState.data ? <SummaryCards summary={summaryState.data} /> : null}

            <div className="card">
              <h2 className="card__title">Terminals</h2>
              {terminalsState.loading ? <Loading label="Loading terminals…" /> : null}
              {terminalsState.error && isNotAvailable(terminalsState.error) ? (
                <NotAvailable label="The terminals list" />
              ) : null}
              {terminalsState.error && !isNotAvailable(terminalsState.error) ? (
                <ErrorState error={terminalsState.error} onRetry={terminalsState.reload} />
              ) : null}
              {!terminalsState.loading && !terminalsState.error ? (
                <TerminalsTable
                  terminals={terminals}
                  onManage={(terminal) => setManagingId(terminal.terminal_id)}
                />
              ) : null}
            </div>

            <GooglePlaceIdForm
              key={activeMerchantId}
              client={client}
              merchantId={activeMerchantId}
              currentPlaceId={selectedMerchant?.google_place_id ?? null}
              onSaved={merchantsState.reload}
            />

            <OfflinePanel client={client} />
          </div>
        ) : null}

        {activeMerchantId && tab === 'scans' ? (
          <ScansView
            client={client}
            merchantId={activeMerchantId}
            terminals={terminals}
            range={range}
            onRangeChange={setRange}
            summary={summaryState.data}
          />
        ) : null}

        {tab === 'pair' ? (
          <PairingForm client={client} onClaimed={refreshAfterWrite} />
        ) : null}

        {activeMerchantId && tab === 'registers' ? (
          <RegistersView client={client} merchantId={activeMerchantId} />
        ) : null}
      </main>

      {managingTerminal ? (
        <TerminalDrawer
          client={client}
          terminal={managingTerminal}
          terminals={terminals}
          onClose={() => setManagingId(null)}
          onSaved={refreshAfterWrite}
        />
      ) : null}

      <footer className="footer">
        <span>
          API: <code>{settings.baseUrl}</code>
        </span>
        <span>Reviews can’t be attributed — scan volume is the metric.</span>
      </footer>
    </div>
  )
}
