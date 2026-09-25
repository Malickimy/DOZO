import type { RangePreset, RangeSelection } from '../lib/range'
import { selectCustomDate, selectPreset } from '../lib/range'

interface RangePickerProps {
  value: RangeSelection
  onChange: (next: RangeSelection) => void
}

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'custom', label: 'Custom' },
]

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <div className="range" role="group" aria-label="Date range">
      {PRESETS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={value.preset === key ? 'btn btn--primary' : 'btn btn--ghost'}
          onClick={() => onChange(selectPreset(value, key))}
        >
          {label}
        </button>
      ))}

      {value.preset === 'custom' ? (
        <>
          <label className="field field--inline">
            <span className="field__label">From</span>
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
            <span className="field__label">To</span>
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
