import { useState } from 'react'
import type { FormEvent } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient, ClaimResult } from '../lib/api'

interface PairingFormProps {
  client: ApiClient
  onClaimed?: (store: ClaimResult['store']) => void
}

export function PairingForm({ client, onClaimed }: PairingFormProps) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleanCode = code.trim().toUpperCase()
    if (cleanCode.length !== 8) {
      setError('Enter the 8-character pairing code shown on the terminal.')
      return
    }
    setSubmitting(true)
    setError(null)
    setUnavailable(false)
    setResult(null)
    try {
      const claim = await client.claimTerminal(cleanCode, label.trim() || undefined)
      setResult(claim)
      setCode('')
      onClaimed?.(claim.store)
    } catch (err) {
      if (isNotAvailable(err)) {
        setUnavailable(true)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card__title">Pair a terminal</h2>
      <p className="muted">
        Enter the 8-character code shown on the DX8000 terminal. The code is created
        when the terminal registers; claiming it links the terminal to a merchant.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Pairing code</span>
          <input
            className="input input--code"
            type="text"
            value={code}
            maxLength={8}
            placeholder="AB12CD34"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field__label">Label (optional)</span>
          <input
            className="input"
            type="text"
            value={label}
            placeholder="Till 1"
            onChange={(event) => setLabel(event.target.value)}
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Claiming…' : 'Claim terminal'}
        </button>
      </form>

      {error ? (
        <p className="state state--error" role="alert">
          {error}
        </p>
      ) : null}

      {unavailable ? (
        <p className="state state--muted" role="status">
          Pairing is not available yet — <code>/api/terminals/claim</code> returned 404.
        </p>
      ) : null}

      {result ? (
        <div className="claim" role="status">
          <p className="claim__title">
            Claimed <code>{result.store.terminal_id}</code>
          </p>
          <dl className="claim__list">
            <dt>Merchant</dt>
            <dd>{result.store.merchant_id}</dd>
            <dt>Label</dt>
            <dd>{result.store.label || '—'}</dd>
            <dt>Google Place ID</dt>
            <dd>{result.store.google_place_id || 'not set yet'}</dd>
            <dt>Redirect URL</dt>
            <dd>
              <a href={result.store.redirect_url} target="_blank" rel="noreferrer">
                {result.store.redirect_url}
              </a>
            </dd>
            <dt>API token</dt>
            <dd>
              <code>{result.api_token}</code>
            </dd>
          </dl>
        </div>
      ) : null}
    </div>
  )
}
