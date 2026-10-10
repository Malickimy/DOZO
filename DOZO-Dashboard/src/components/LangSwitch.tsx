import { setLang, useLang } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

const OPTIONS: ReadonlyArray<[Lang, string]> = [
  ['pl', 'PL'],
  ['en', 'EN'],
]

export function LangSwitch() {
  const lang = useLang()
  return (
    <div className="lang" role="group" aria-label="Język / Language">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={lang === value}
          onClick={() => setLang(value)}
        >
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
