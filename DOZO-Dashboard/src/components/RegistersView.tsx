import { useState } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, Register, SetupCode } from '../lib/api'
import { formatDateTime, formatRelative, isActive, terminalName } from '../lib/format'
import { useT } from '../lib/i18n'
import { describeIssueError, isUnknownMerchant } from '../lib/setupCodeErrors'
import { useAsync } from '../lib/useAsync'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'

interface RegistersViewProps {
  client: ApiClient
  merchantId: string
}

export function RegistersView({ client, merchantId }: RegistersViewProps) {
  const t = useT()
  const registersState = useAsync(
    () => client.listRegisters(merchantId),
    [client, merchantId],
  )

  const [pending, setPending] = useState<Register | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [result, setResult] = useState<SetupCode | null>(null)
  const [issueError, setIssueError] = useState<{ message: string; unavailable: boolean } | null>(
    null,
  )
  const [copied, setCopied] = useState(false)

  const registers = registersState.data ?? []
  const listUnavailable =
    isNotAvailable(registersState.error) && !isUnknownMerchant(registersState.error)
  const listError = registersState.error && !listUnavailable ? registersState.error : null

  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  async function issue(label: string) {
    setIssuing(true)
    setIssueError(null)
    setResult(null)
    setCopied(false)
    try {
      const code = await client.issueSetupCode(merchantId, label)
      setResult(code)
      registersState.reload()
    } catch (err) {
      setIssueError(describeIssueError(err, merchantId, t))
    } finally {
      setIssuing(false)
    }
  }

  function handleIssue(register: Register) {
    setIssueError(null)
    setResult(null)
    if (register.terminal_id) {
      setPending(register)
      return
    }
    void issue(register.label)
  }

  async function copyCode() {
    if (!result || !canCopy) return
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2 className="card__title">{t('Stanowiska i kody', 'Registers & setup codes')}</h2>
        <p className="muted">
          {t(
            'Stanowisko to stałe miejsce na terminal, np. „Kasa 1”. Nowy kod jednorazowy przypisuje do stanowiska inne urządzenie — przydaje się przy wymianie terminala.',
            'A register is a merchant-defined slot. Issue a one-time code and enter it on a terminal to bind that device to the register.',
          )}
        </p>

        {registersState.loading ? (
          <Loading label={t('Ładowanie stanowisk…', 'Loading registers…')} />
        ) : null}

        {listUnavailable ? (
          <NotAvailable label={t('Lista stanowisk', 'The registers list')} />
        ) : null}

        {listError ? <ErrorState error={listError} onRetry={registersState.reload} /> : null}

        {!registersState.loading && !registersState.error && registers.length === 0 ? (
          <Empty>
            {t(
              'Nie ma jeszcze stanowisk. Połącz pierwszy terminal powyżej.',
              'No registers defined yet. Pair your first terminal above.',
            )}
          </Empty>
        ) : null}

        {!registersState.error && registers.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Nazwa', 'Label')}</th>
                  <th>{t('Terminal', 'Terminal')}</th>
                  <th>{t('Status', 'Status')}</th>
                  <th>{t('Ostatnia aktywność', 'Last seen')}</th>
                  <th>{t('Akcja', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {registers.map((register) => (
                  <tr key={register.label}>
                    <td>{terminalName(register.label, register.terminal_id ?? '—')}</td>
                    <td>
                      {register.terminal_id ? (
                        <code>{register.terminal_id}</code>
                      ) : (
                        <span className="muted">{t('Wolne', 'Unclaimed')}</span>
                      )}
                    </td>
                    <td>
                      {register.terminal_id ? (
                        <span className={isActive(register.active) ? 'badge badge--ok' : 'badge badge--off'}>
                          {isActive(register.active) ? t('Aktywne', 'Active') : t('Nieaktywne', 'Inactive')}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{formatRelative(register.last_seen)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={issuing}
                        onClick={() => handleIssue(register)}
                      >
                        {t('Nowy kod', 'Issue')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {pending ? (
        <div
          className="card"
          role="alertdialog"
          aria-label={t('Potwierdź wymianę urządzenia', 'Confirm device swap')}
        >
          <h2 className="card__title">{t('Wymienić urządzenie?', 'Swap device?')}</h2>
          <p className="muted">
            {t(
              'To stanowisko jest zajęte — nowy kod przypisze do niego inne urządzenie, a obecne zostanie odłączone.',
              'This register is occupied — issuing a new code will swap the device.',
            )}
          </p>
          <p className="muted">
            {t('Obecne urządzenie:', 'Current device:')} <code>{pending.terminal_id}</code>
          </p>
          <div className="form__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={issuing}
              onClick={() => {
                const label = pending.label
                setPending(null)
                void issue(label)
              }}
            >
              {t('Potwierdź', 'Confirm')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={issuing}
              onClick={() => setPending(null)}
            >
              {t('Anuluj', 'Cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {issueError?.unavailable ? (
        <NotAvailable label={t('Wydawanie kodów', 'Issuing setup codes')} />
      ) : null}

      {issueError && !issueError.unavailable ? (
        <p className="state state--error" role="alert">
          {issueError.message}
        </p>
      ) : null}

      {result ? (
        <div className="claim" role="status">
          <p className="claim__title">
            {t('Kod konfiguracyjny dla', 'Setup code for')} <code>{result.label}</code>
          </p>
          <p className="claim__code">
            <code>{result.code}</code>
          </p>
          <dl className="claim__list">
            <dt>{t('Wygasa', 'Expires')}</dt>
            <dd>
              {formatDateTime(result.expires_at)}
              {typeof result.expires_in_seconds === 'number' ? (
                <> ({result.expires_in_seconds}s)</>
              ) : null}
            </dd>
          </dl>
          {canCopy ? (
            <button type="button" className="btn btn--ghost" onClick={copyCode}>
              {copied ? t('Skopiowano', 'Copied') : t('Kopiuj kod', 'Copy code')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
