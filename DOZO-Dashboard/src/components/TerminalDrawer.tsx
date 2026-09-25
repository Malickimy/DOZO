import { useState } from 'react'
import { errorCode, isApiError, isNotAvailable } from '../lib/api'
import type { ApiClient, Terminal, TerminalConfig } from '../lib/api'
import { isActive } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { ErrorState, Loading, NotAvailable } from './StateMessage'

interface TerminalDrawerProps {
  client: ApiClient
  terminal: Terminal
  /** All terminals for the merchant, used to detect the last active one. */
  terminals: Terminal[]
  onClose: () => void
  /** Called after a successful write so the parent can refresh its lists. */
  onSaved: () => void
}

function friendlyConfigError(error: unknown): string {
  const code = errorCode(error)
  if (code === 'label_in_use') return 'Label already in use.'
  if (code === 'inactive_terminal') {
    return 'This terminal is inactive — reactivate it before editing its configuration.'
  }
  if (code === 'unknown_terminal') {
    return 'This terminal is unknown to the server. Refresh the terminal list.'
  }
  if (isApiError(error) && error.isUnauthorized) return 'Unauthorized — check the API token.'
  if (isApiError(error) && error.status === 400) return 'The server rejected those values.'
  return error instanceof Error ? error.message : String(error)
}

interface TerminalConfigFormProps {
  client: ApiClient
  terminal: Terminal
  terminals: Terminal[]
  config: TerminalConfig
  onSaved: () => void
}

function TerminalConfigForm({
  client,
  terminal,
  terminals,
  config,
  onSaved,
}: TerminalConfigFormProps) {
  const [label, setLabel] = useState(config.label ?? '')
  const [active, setActive] = useState(config.active)
  const [displayEnabled, setDisplayEnabled] = useState(config.display_enabled)
  const [timeoutSeconds, setTimeoutSeconds] = useState(config.display_timeout_seconds)

  const [savingLifecycle, setSavingLifecycle] = useState(false)
  const [savingDisplay, setSavingDisplay] = useState(false)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)
  const [displayError, setDisplayError] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const activeCount = terminals.filter((item) => isActive(item.active)).length
  const isLastActive = isActive(terminal.active) && activeCount <= 1
  const reviewUrl = config.static_review_url ?? terminal.static_review_url ?? null

  async function saveLifecycle(fields: { active?: boolean; label?: string }) {
    setSavingLifecycle(true)
    setLifecycleError(null)
    try {
      await client.patchTerminal(terminal.terminal_id, fields)
      onSaved()
    } catch (error) {
      setLifecycleError(friendlyConfigError(error))
    } finally {
      setSavingLifecycle(false)
    }
  }

  function handleActiveChange(next: boolean) {
    setLifecycleError(null)
    if (!next && isLastActive) {
      setConfirmDeactivate(true)
      return
    }
    setActive(next)
    void saveLifecycle({ active: next })
  }

  function handleSaveLabel() {
    const trimmed = label.trim()
    if (!trimmed) {
      setLifecycleError('Label cannot be empty.')
      return
    }
    void saveLifecycle({ label: trimmed })
  }

  async function handleSaveDisplay() {
    if (!Number.isFinite(timeoutSeconds)) {
      setDisplayError('Enter a timeout in seconds.')
      return
    }
    setSavingDisplay(true)
    setDisplayError(null)
    try {
      await client.putTerminalConfig(terminal.terminal_id, {
        display_enabled: displayEnabled,
        display_timeout_seconds: timeoutSeconds,
      })
      onSaved()
    } catch (error) {
      setDisplayError(friendlyConfigError(error))
    } finally {
      setSavingDisplay(false)
    }
  }

  function confirmDeactivateNow() {
    setConfirmDeactivate(false)
    setActive(false)
    void saveLifecycle({ active: false })
  }

  return (
    <div className="stack">
      <div className="form">
        <label className="field field--inline">
          <span className="field__label">Active</span>
          <input
            type="checkbox"
            checked={active}
            disabled={savingLifecycle}
            onChange={(event) => handleActiveChange(event.target.checked)}
          />
        </label>

        <label className="field">
          <span className="field__label">Label</span>
          <input
            className="input"
            type="text"
            value={label}
            disabled={savingLifecycle}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={savingLifecycle}
          onClick={handleSaveLabel}
        >
          Save label
        </button>
      </div>

      {lifecycleError ? (
        <p className="state state--error" role="alert">
          {lifecycleError}
        </p>
      ) : null}

      <div className="form">
        <label className="field field--inline">
          <span className="field__label">Show QR</span>
          <input
            type="checkbox"
            checked={displayEnabled}
            disabled={savingDisplay}
            onChange={(event) => setDisplayEnabled(event.target.checked)}
          />
        </label>

        <label className="field">
          <span className="field__label">Display timeout (seconds)</span>
          <input
            className="input"
            type="number"
            min={5}
            max={30}
            value={timeoutSeconds}
            disabled={savingDisplay}
            onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={savingDisplay}
          onClick={handleSaveDisplay}
        >
          Save display
        </button>
      </div>

      {displayError ? (
        <p className="state state--error" role="alert">
          {displayError}
        </p>
      ) : null}

      {reviewUrl ? (
        <p className="muted">
          Review link:{' '}
          <a href={reviewUrl} target="_blank" rel="noreferrer">
            {reviewUrl}
          </a>
        </p>
      ) : (
        <p className="muted">Review link appears once the merchant has a Google Place ID.</p>
      )}

      {confirmDeactivate ? (
        <div className="card" role="alertdialog" aria-label="Confirm deactivation">
          <h3 className="card__title">Deactivate last active terminal?</h3>
          <p className="muted">
            This is the last active terminal for this merchant. Deactivating it stops scans
            from being accepted.
          </p>
          <div className="form__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={savingLifecycle}
              onClick={confirmDeactivateNow}
            >
              Deactivate
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={savingLifecycle}
              onClick={() => setConfirmDeactivate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Per-terminal management drawer. The config is fetched only when the drawer
 * mounts (on open), never during table render.
 */
export function TerminalDrawer({
  client,
  terminal,
  terminals,
  onClose,
  onSaved,
}: TerminalDrawerProps) {
  const configState = useAsync(
    () => client.getTerminalConfig(terminal.terminal_id),
    [client, terminal.terminal_id],
  )

  const config = configState.data

  return (
    <div className="drawer" role="dialog" aria-label={`Manage ${terminal.terminal_id}`}>
      <div className="card drawer__panel">
        <div className="card__header">
          <h2 className="card__title">Manage terminal</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">
          <code>{terminal.terminal_id}</code>
        </p>

        {configState.loading ? <Loading label="Loading terminal config…" /> : null}

        {configState.error ? (
          errorCode(configState.error) === 'unknown_terminal' ||
          errorCode(configState.error) === 'inactive_terminal' ? (
            <p className="state state--error" role="alert">
              {friendlyConfigError(configState.error)}
            </p>
          ) : isNotAvailable(configState.error) ? (
            <NotAvailable label="Terminal configuration" />
          ) : (
            <ErrorState error={configState.error} onRetry={configState.reload} />
          )
        ) : null}

        {config ? (
          <TerminalConfigForm
            client={client}
            terminal={terminal}
            terminals={terminals}
            config={config}
            onSaved={onSaved}
          />
        ) : null}
      </div>
    </div>
  )
}
