import { useState } from 'react'
import { isApiError, isNotAvailable } from '../lib/api'
import type { ApiClient, Register, SetupCode } from '../lib/api'
import { formatDateTime, formatRelative, isActive, terminalName } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Empty, ErrorState, Loading, NotAvailable } from './StateMessage'

interface RegistersViewProps {
  client: ApiClient
  merchantId: string
}

/** Server body for a merchant that does not exist; a real error, not a 404 route. */
function isUnknownMerchant(error: unknown): boolean {
  if (!isApiError(error)) return false
  const body = error.body
  return (
    body !== null &&
    typeof body === 'object' &&
    'error' in body &&
    (body as { error: unknown }).error === 'unknown_merchant'
  )
}

function describeIssueError(
  error: unknown,
  merchantId: string,
): { message: string; unavailable: boolean } {
  if (isApiError(error)) {
    if (error.isUnauthorized) {
      return { message: 'Unauthorized — check the API token.', unavailable: false }
    }
    if (error.status === 503) {
      return {
        message: 'The setup-code service is temporarily unavailable. Please try again.',
        unavailable: false,
      }
    }
    if (isUnknownMerchant(error)) {
      return { message: `Unknown merchant “${merchantId}”.`, unavailable: false }
    }
    if (isNotAvailable(error)) {
      return { message: 'Issuing setup codes is not available yet.', unavailable: true }
    }
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    unavailable: false,
  }
}

export function RegistersView({ client, merchantId }: RegistersViewProps) {
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
      setIssueError(describeIssueError(err, merchantId))
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
        <h2 className="card__title">Registers &amp; setup codes</h2>
        <p className="muted">
          A register is a merchant-defined slot. Issue a one-time code and enter it on a
          terminal to bind that device to the register.
        </p>

        {registersState.loading ? <Loading label="Loading registers…" /> : null}

        {listUnavailable ? <NotAvailable label="The registers list" /> : null}

        {listError ? (
          <ErrorState error={listError} onRetry={registersState.reload} />
        ) : null}

        {!registersState.loading && !registersState.error && registers.length === 0 ? (
          <Empty>
            No registers defined yet. Create one on the server, then issue its setup code
            here.
          </Empty>
        ) : null}

        {!registersState.error && registers.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Terminal</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>Action</th>
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
                        <span className="muted">Unclaimed</span>
                      )}
                    </td>
                    <td>{isActive(register.active) ? 'Active' : 'Inactive'}</td>
                    <td>{formatRelative(register.last_seen)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={issuing}
                        onClick={() => handleIssue(register)}
                      >
                        Issue
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
        <div className="card" role="alertdialog" aria-label="Confirm device swap">
          <h2 className="card__title">Swap device?</h2>
          <p className="muted">
            This register is occupied — issuing a new code will swap the device.
          </p>
          <p className="muted">
            Current device: <code>{pending.terminal_id}</code>
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
              Confirm
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={issuing}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {issueError?.unavailable ? (
        <NotAvailable label="Issuing setup codes" />
      ) : null}

      {issueError && !issueError.unavailable ? (
        <p className="state state--error" role="alert">
          {issueError.message}
        </p>
      ) : null}

      {result ? (
        <div className="claim" role="status">
          <p className="claim__title">
            Setup code for <code>{result.label}</code>
          </p>
          <p className="claim__code">
            <code>{result.code}</code>
          </p>
          <dl className="claim__list">
            <dt>Expires</dt>
            <dd>
              {formatDateTime(result.expires_at)}
              {typeof result.expires_in_seconds === 'number' ? (
                <> ({result.expires_in_seconds}s)</>
              ) : null}
            </dd>
          </dl>
          {canCopy ? (
            <button type="button" className="btn btn--ghost" onClick={copyCode}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
