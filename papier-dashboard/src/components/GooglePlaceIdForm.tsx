import { useState } from 'react'
import type { FormEvent } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient } from '../lib/api'

interface GooglePlaceIdFormProps {
  client: ApiClient
  merchantId: string
  currentPlaceId: string | null
  onSaved?: () => void
}

export function GooglePlaceIdForm({
  client,
  merchantId,
  currentPlaceId,
  onSaved,
}: GooglePlaceIdFormProps) {
  const [value, setValue] = useState(currentPlaceId ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const placeId = value.trim()
    if (!placeId) {
      setError('Enter a Google Place ID (e.g. ChIJ…).')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    setUnavailable(false)
    try {
      await client.setGooglePlaceId(merchantId, placeId)
      setMessage('Google Place ID saved. Scans will redirect to this review form.')
      onSaved?.()
    } catch (err) {
      if (isNotAvailable(err)) {
        setUnavailable(true)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card__title">Google Place ID</h2>
      <p className="muted">
        The QR redirects customers to this merchant’s Google review form. Reviews
        can’t be attributed to a terminal, so the dashboard tracks scan volume instead.
      </p>

      <form className="form form--row" onSubmit={handleSubmit}>
        <label className="field field--grow">
          <span className="field__label">Place ID for {merchantId}</span>
          <input
            className="input"
            type="text"
            value={value}
            placeholder="ChIJ…"
            onChange={(event) => setValue(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      {message ? (
        <p className="auth__result auth__result--ok" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="state state--error" role="alert">
          {error}
        </p>
      ) : null}
      {unavailable ? (
        <p className="state state--muted" role="status">
          Place ID assignment is not available yet —{' '}
          <code>/api/merchants/:id/google-place-id</code> returned 404.
        </p>
      ) : null}
    </div>
  )
}
