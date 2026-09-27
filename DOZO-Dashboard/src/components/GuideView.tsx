import { GUIDE_ITEMS, GUIDE_POLICY_URL } from '../content/guide'
import { useLang, useT } from '../lib/i18n'

export function GuideView() {
  const t = useT()
  const lang = useLang()

  return (
    <div className="card">
      <h2 className="card__title">
        {t('Jak zbierać opinie zgodnie z zasadami Google', 'How to collect reviews under Google’s rules')}
      </h2>
      <p className="muted guide__intro">
        {t(
          'Google usuwa opinie, które łamią jego zasady, a przy powtarzających się naruszeniach może ograniczyć widoczność wizytówki. Tu znajdziesz najważniejsze reguły i dobre praktyki. Pełne zasady:',
          'Google removes reviews that break its rules and may limit a profile’s visibility after repeated violations. Here are the key rules and good practices. Full policy:',
        )}{' '}
        <a href={GUIDE_POLICY_URL} target="_blank" rel="noopener noreferrer">
          {t(
            'Treści zabronione i objęte ograniczeniami w Mapach Google',
            'Prohibited and restricted content on Google Maps',
          )}
        </a>
        .
      </p>
      <div className="faq">
        {GUIDE_ITEMS.map((item) => (
          <details key={item.q.en}>
            <summary>
              {item.q[lang]}
              <span className="faq__mark" aria-hidden="true" />
            </summary>
            <p className="faq__answer">{item.a[lang]}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
