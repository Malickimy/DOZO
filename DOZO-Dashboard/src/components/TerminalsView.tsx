import { useCallback, useMemo, useState } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, Terminal } from '../lib/api'
import { useT } from '../lib/i18n'
import type { AsyncState } from '../lib/useAsync'
import { useAsync } from '../lib/useAsync'
import { OfflinePanel } from './OfflinePanel'
import { PairTerminal } from './PairTerminal'
import { RegistersView } from './RegistersView'
import { ErrorState, Loading, NotAvailable } from './StateMessage'
import { TerminalsTable } from './TerminalsTable'

interface TerminalsViewProps {
  client: ApiClient
  merchantId: string
  terminalsState: AsyncState<Terminal[]>
  onManage: (terminal: Terminal) => void
  onChanged: () => void
}

function startOfToday(): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export function TerminalsView({
  client,
  merchantId,
  terminalsState,
  onManage,
  onChanged,
}: TerminalsViewProps) {
  const t = useT()
  const [registersKey, setRegistersKey] = useState(0)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)

  const terminals = terminalsState.data ?? []

  const todayState = useAsync(
    () => client.listScans(merchantId, { since: startOfToday(), limit: 1000 }),
    [client, merchantId, terminalsState.data],
  )
  const scansToday = useMemo(() => {
    if (!todayState.data) return null
    const counts = new Map<string, number>()
    for (const scan of todayState.data) {
      counts.set(scan.terminal_id, (counts.get(scan.terminal_id) ?? 0) + 1)
    }
    return counts
  }, [todayState.data])

  const handlePaired = useCallback(() => {
    setRegistersKey((key) => key + 1)
    onChanged()
  }, [onChanged])

  async function handleDisconnect(terminal: Terminal) {
    setDisconnectingId(terminal.terminal_id)
    setActionError(null)
    try {
      await client.patchTerminal(terminal.terminal_id, { active: false })
      setRegistersKey((key) => key + 1)
      onChanged()
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      setDisconnectingId(null)
    }
  }

  return (
    <div className="stack">
      <PairTerminal
        client={client}
        merchantId={merchantId}
        suggestedName={`Terminal ${terminals.length + 1}`}
        onPaired={handlePaired}
      />

      <div className="card">
        <h2 className="card__title">{t('Terminale', 'Terminals')}</h2>
        <p className="muted">
          {t(
            'Terminale pobierają konfigurację po połączeniu. Nazwę i ustawienia ekranu pojedynczego terminala zmienisz w „Zarządzaj”. „Odłącz” wyłącza terminal — skany z niego przestaną być przyjmowane.',
            'Terminals download their configuration once paired. Change a single terminal’s name and screen in “Manage”. “Disconnect” deactivates the terminal so its scans are no longer accepted.',
          )}
        </p>
        {terminalsState.loading ? (
          <Loading label={t('Ładowanie terminali…', 'Loading terminals…')} />
        ) : null}
        {terminalsState.error && isNotAvailable(terminalsState.error) ? (
          <NotAvailable label={t('Lista terminali', 'The terminals list')} />
        ) : null}
        {terminalsState.error && !isNotAvailable(terminalsState.error) ? (
          <ErrorState error={terminalsState.error} onRetry={terminalsState.reload} />
        ) : null}
        {actionError ? <ErrorState error={actionError} /> : null}
        {!terminalsState.loading && !terminalsState.error ? (
          <TerminalsTable
            terminals={terminals}
            scansToday={scansToday}
            onManage={onManage}
            onDisconnect={handleDisconnect}
            disconnectingId={disconnectingId}
          />
        ) : null}
      </div>

      <RegistersView key={registersKey} client={client} merchantId={merchantId} />

      <OfflinePanel client={client} merchantId={merchantId} />
    </div>
  )
}
