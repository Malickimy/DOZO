import { useT } from '../lib/i18n'
import type { RangePreset, RangeSelection } from '../lib/range'
import { selectCustomDate, selectPreset } from '../lib/range'

interface RangePickerProps {
  value: RangeSelection
  onChange: (next: RangeSelection) => void
}

const PRESETS: { key: RangePreset; pl: string; en: string }[] = [
  { key: '7d', pl: '7 dni', en: '7d' },
  { key: '30d', pl: '30 dni', en: '30d' },
  { key: '90d', pl: '90 dni', en: '90d' },
  { key: 'custom', pl: 'Własny', en: 'Custom' },
]

export function RangePicker({ value, onChange }: RangePickerProps) {
  const t = useT()
  return (
    <div className="range-picker" role="group" aria-label={t('Zakres dat', 'Date range')}>
      {PRESETS.map(({ key, pl, en }) => (
        <button
          key={key}
          type="button"
          className={value.preset === key ? 'btn btn--primary' : 'btn btn--ghost'}
          onClick={() => onChange(selectPreset(value, key))}
        >
          {t(pl, en)}
        </button>
      ))}

      {value.preset === 'custom' ? (
        <>
          <label className="field field--inline">
            <span className="field__label">{t('Od', 'From')}</span>
            <input
              className="input"
              type="date"
              value={value.customSince}
              onChange={(event) =>
                onChange(selectCustomDate(value, 'customSince', event.target.value))
              }
            />
          </label>
          <label className="field field--inline">
            <span className="field__label">{t('Do', 'To')}</span>
            <input
              className="input"
              type="date"
              value={value.customUntil}
              onChange={(event) =>
                onChange(selectCustomDate(value, 'customUntil', event.target.value))
              }
            />
          </label>
        </>
      ) : null}
    </div>
  )
}
