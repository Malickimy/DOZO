import { useEffect, useState } from 'react'
import type { Terminal } from '../lib/api'
import { formatDateTime, formatRelative, isActive } from '../lib/format'
import { useT } from '../lib/i18n'
import { Empty } from './StateMessage'

interface TerminalsTableProps {
  terminals: Terminal[]
  /** Scans since local midnight per terminal; null while unknown. */
  scansToday?: Map<string, number> | null
  onManage?: (terminal: Terminal) => void
  onDisconnect?: (terminal: Terminal) => void
  disconnectingId?: string | null
}

export function TerminalsTable({
  terminals,
  scansToday = null,
  onManage,
  onDisconnect,
  disconnectingId = null,
}: TerminalsTableProps) {
  const t = useT()
  const [armedId, setArmedId] = useState<string | null>(null)

  useEffect(() => {
    if (!armedId) return
    const timer = window.setTimeout(() => setArmedId(null), 4000)
    return () => window.clearTimeout(timer)
  }, [armedId])

  if (terminals.length === 0) {
    return (
      <Empty>
        {t(
          'Nie połączono jeszcze żadnego terminala. Wygeneruj kod powyżej.',
          'No terminals paired yet. Generate a setup code above.',
        )}
      </Empty>
    )
  }

  function handleDisconnect(terminal: Terminal) {
    if (armedId !== terminal.terminal_id) {
      setArmedId(terminal.terminal_id)
      return
    }
    setArmedId(null)
    onDisconnect?.(terminal)
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('Nazwa i ID', 'Label and ID')}</th>
            <th>{t('Status', 'Status')}</th>
            <th>{t('Ostatnia aktywność', 'Last seen')}</th>
            <th className="num">{t('Skany dziś', 'Scans today')}</th>
            <th className="num">{t('Skany łącznie', 'Total scans')}</th>
            <th>{t('Opinie', 'Reviews')}</th>
            <th>
              <span className="sr-only">{t('Akcje', 'Actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {terminals.map((terminal) => {
            const active = isActive(terminal.active)
            const armed = armedId === terminal.terminal_id
            return (
              <tr key={terminal.terminal_id}>
                <td>
                  {terminal.label || <span className="muted">—</span>}
                  <small className="cell-sub">
                    <code>{terminal.terminal_id}</code>
                  </small>
                </td>
                <td>
                  <span className={active ? 'badge badge--ok' : 'badge badge--off'}>
                    {active ? t('Aktywny', 'Active') : t('Odłączony', 'Inactive')}
                  </span>
                </td>
                <td title={formatDateTime(terminal.last_seen)}>
                  {formatRelative(terminal.last_seen)}
                </td>
                <td className="num">{scansToday ? (scansToday.get(terminal.terminal_id) ?? 0) : '—'}</td>
                <td className="num">{terminal.scan_count}</td>
                <td>
                  {terminal.static_review_url ? (
                    <a href={terminal.static_review_url} target="_blank" rel="noreferrer">
                      {t('Formularz', 'Review')}
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    {onManage ? (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => onManage(terminal)}
                      >
                        {t('Zarządzaj', 'Manage')}
                      </button>
                    ) : null}
                    {onDisconnect && active ? (
                      <button
                        type="button"
                        className={armed ? 'btn btn--armed' : 'btn btn--ghost'}
                        disabled={disconnectingId === terminal.terminal_id}
                        onClick={() => handleDisconnect(terminal)}
                      >
                        {armed ? t('Na pewno?', 'Sure?') : t('Odłącz', 'Disconnect')}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
