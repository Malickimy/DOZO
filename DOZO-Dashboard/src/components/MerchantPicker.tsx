import type { Merchant } from '../lib/api'
import { useT } from '../lib/i18n'

interface MerchantPickerProps {
  merchants: Merchant[]
  value: string
  onChange: (merchantId: string) => void
  unavailable?: boolean
  loading?: boolean
}

export function MerchantPicker({
  merchants,
  value,
  onChange,
  unavailable = false,
  loading = false,
}: MerchantPickerProps) {
  const t = useT()

  if (loading) {
    return <span className="muted">{t('Ładowanie sprzedawców…', 'Loading merchants…')}</span>
  }

  if (merchants.length > 0) {
    return (
      <label className="field field--inline">
        <span className="field__label">{t('Sprzedawca', 'Merchant')}</span>
        <select
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {merchants.map((merchant) => (
            <option key={merchant.merchant_id} value={merchant.merchant_id}>
              {merchant.merchant_id}
              {merchant.google_place_id ? '' : t(' (bez Place ID)', ' (no Place ID)')}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="field field--inline">
      <span className="field__label">
        {t('ID sprzedawcy', 'Merchant ID')}
        {unavailable ? t(' (lista niedostępna)', ' (merchant list unavailable)') : ''}
      </span>
      <input
        className="input"
        type="text"
        value={value}
        placeholder="demo-merchant"
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </label>
  )
}
