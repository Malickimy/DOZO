import { useState } from 'react'
import type { FormEvent } from 'react'
import { createApiClient, normalizeBaseUrl } from '../lib/api'
import { useT } from '../lib/i18n'
import type { Settings } from '../lib/settings'

interface LoginSettingsProps {
  initial: Settings
  onSave: (settings: Settings) => void
  onCancel?: () => void
}

type TestResult = { kind: 'ok'; status?: string } | { kind: 'error'; message: string }
type FormError = 'baseUrl' | 'token'

export function LoginSettings({ initial, onSave, onCancel }: LoginSettingsProps) {
  const t = useT()
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [token, setToken] = useState(initial.token)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [formError, setFormError] = useState<FormError | null>(null)

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const client = createApiClient({ baseUrl, token })
      const result = await client.health()
      setTestResult({ kind: 'ok', status: result?.status })
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
      setFormError('baseUrl')
      return
    }
    if (!cleanToken) {
      setFormError('token')
      return
    }
    setFormError(null)
    onSave({ baseUrl: cleanBaseUrl, token: cleanToken })
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1 className="auth__title">
        {onCancel ? t('Ustawienia API', 'API settings') : t('Wejście tokenem operatora', 'Operator sign-in')}
      </h1>
      <p className="auth__subtitle">
        {t(
          'Dla operatorów i instalatorów: podaj adres API i token operatora. Sprzedawcy logują się e-mailem i hasłem.',
          'For operators and installers: enter the API address and the operator token. Merchants sign in with email and password.',
        )}
      </p>

      <label className="field">
        <span className="field__label">{t('Adres API', 'API base URL')}</span>
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
        <span className="field__label">{t('Token API', 'API token')}</span>
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
          {testing ? t('Sprawdzam…', 'Testing…') : t('Sprawdź połączenie', 'Test connection')}
        </button>
        <button type="submit" className="btn btn--primary">
          {onCancel ? t('Zapisz', 'Save') : t('Dalej', 'Continue')}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {t('Anuluj', 'Cancel')}
          </button>
        ) : null}
      </div>

      {formError ? (
        <p className="auth__result auth__result--error" role="alert">
          {formError === 'baseUrl'
            ? t('Wpisz adres API.', 'Enter an API base URL.')
            : t('Wpisz token API.', 'Enter an API token.')}
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
          {testResult.kind === 'ok'
            ? `${t('Połączenie działa', 'Connection OK')}${testResult.status ? ` (status: ${testResult.status})` : ''}`
            : testResult.message}
        </p>
      ) : null}

      <p className="auth__hint">
        {t(
          'Token jest zapisany w localStorage tej przeglądarki i wysyłany w nagłówku',
          'The token is stored in this browser’s localStorage and sent as the',
        )}
        <code> X-Api-Token</code>
        {t('.', ' header.')}
      </p>
    </form>
  )
}
