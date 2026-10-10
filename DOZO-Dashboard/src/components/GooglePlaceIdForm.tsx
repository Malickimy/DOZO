import { useState } from 'react'
import type { FormEvent } from 'react'
import { isNotAvailable } from '../lib/api'
import type { ApiClient } from '../lib/api'
import { useT } from '../lib/i18n'

interface GooglePlaceIdFormProps {
  client: ApiClient
  merchantId: string
  currentPlaceId: string | null
  onSaved?: () => void
}

type Outcome = 'saved' | 'empty' | 'unavailable' | { error: string }

export function GooglePlaceIdForm({
  client,
  merchantId,
  currentPlaceId,
  onSaved,
}: GooglePlaceIdFormProps) {
  const t = useT()
  const [value, setValue] = useState(currentPlaceId ?? '')
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const placeId = value.trim()
    if (!placeId) {
      setOutcome('empty')
      return
    }
    setSaving(true)
    setOutcome(null)
    try {
      await client.setGooglePlaceId(merchantId, placeId)
      setOutcome('saved')
      onSaved?.()
    } catch (err) {
      setOutcome(isNotAvailable(err) ? 'unavailable' : { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2 className="card__title">{t('Wizytówka Google', 'Google Place ID')}</h2>
      <p className="muted">
        {t(
          'Kod QR prowadzi klientów do formularza opinii tej wizytówki. Opinii nie da się przypisać do terminala, dlatego panel liczy skany.',
          'The QR redirects customers to this merchant’s Google review form. Reviews can’t be attributed to a terminal, so the dashboard tracks scan volume instead.',
        )}
      </p>

      <form className="form form--row" onSubmit={handleSubmit}>
        <label className="field field--grow">
          <span className="field__label">
            {t('Place ID dla', 'Place ID for')} {merchantId}
          </span>
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
          {saving ? t('Zapisuję…', 'Saving…') : t('Zapisz', 'Save')}
        </button>
      </form>

      {outcome === 'saved' ? (
        <p className="auth__result auth__result--ok" role="status">
          {t(
            'Place ID zapisany. Skany będą przekierowywać do tego formularza opinii.',
            'Google Place ID saved. Scans will redirect to this review form.',
          )}
        </p>
      ) : null}
      {outcome === 'empty' ? (
        <p className="state state--error" role="alert">
          {t('Wpisz Place ID z Google (np. ChIJ…).', 'Enter a Google Place ID (e.g. ChIJ…).')}
        </p>
      ) : null}
      {outcome !== null && typeof outcome === 'object' ? (
        <p className="state state--error" role="alert">
          {outcome.error}
        </p>
      ) : null}
      {outcome === 'unavailable' ? (
        <p className="state state--muted" role="status">
          {t('Zapis Place ID jest jeszcze niedostępny —', 'Place ID assignment is not available yet —')}{' '}
          <code>/api/merchants/:id/google-place-id</code> {t('zwraca 404.', 'returned 404.')}
        </p>
      ) : null}
    </div>
  )
}
