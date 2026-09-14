import { useState } from 'react'
import type { FormEvent } from 'react'
import { createApiClient, normalizeBaseUrl } from '../lib/api'
import type { Settings } from '../lib/settings'

interface LoginSettingsProps {
  initial: Settings
  onSave: (settings: Settings) => void
  onCancel?: () => void
}

type TestResult = { kind: 'ok' | 'error'; message: string }

export function LoginSettings({ initial, onSave, onCancel }: LoginSettingsProps) {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [token, setToken] = useState(initial.token)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const client = createApiClient({ baseUrl, token })
      const result = await client.health()
      setTestResult({
        kind: 'ok',
        message: `Connection OK${result?.status ? ` (status: ${result.status})` : ''}`,
      })
    } catch (error) {
      setTestResult({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setTesting(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleanBaseUrl = normalizeBaseUrl(baseUrl)
    const cleanToken = token.trim()
    if (!cleanBaseUrl) {
      setFormError('Enter an API base URL.')
      return
    }
    if (!cleanToken) {
      setFormError('Enter an API token.')
      return
    }
    setFormError(null)
    onSave({ baseUrl: cleanBaseUrl, token: cleanToken })
  }

  return (
    <div className="auth">
      <form className="card auth__card" onSubmit={handleSubmit}>
        <h1 className="auth__title">DOZO Merchant Dashboard</h1>
        <p className="auth__subtitle">
          Link terminals to a Google Place ID and watch scan volume. Reviews can’t be
          attributed, so scans are the metric.
        </p>

        <label className="field">
          <span className="field__label">API base URL</span>
          <input
            className="input"
            type="url"
            value={baseUrl}
            placeholder="http://130.162.185.144:3000"
            onChange={(event) => setBaseUrl(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span className="field__label">API token</span>
          <input
            className="input"
            type="password"
            value={token}
            placeholder="dev-placeholder-token"
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="auth__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button type="submit" className="btn btn--primary">
            {onCancel ? 'Save' : 'Continue'}
          </button>
          {onCancel ? (
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>

        {formError ? (
          <p className="auth__result auth__result--error" role="alert">
            {formError}
          </p>
        ) : null}

        {testResult ? (
          <p
            className={
              testResult.kind === 'ok'
                ? 'auth__result auth__result--ok'
                : 'auth__result auth__result--error'
            }
            role="status"
          >
            {testResult.message}
          </p>
        ) : null}

        <p className="auth__hint">
          The token is stored in this browser’s localStorage and sent as the
          <code> X-Api-Token </code> header.
        </p>
      </form>
    </div>
  )
}
