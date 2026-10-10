import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { LangSwitch } from './LangSwitch'
import { Logo } from './Logo'

export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useT()

  return (
    <div className="auth">
      <aside className="auth__aside">
        <a className="auth__aside-brand" href="/" aria-label={t('DooZo — strona główna', 'DooZo — homepage')}>
          <Logo />
        </a>
        <div className="auth__pitch">
          <p className="auth__kicker">
            <span>
              {t('Każda płatność to szansa na nową opinię.', 'Every payment is a chance for a new review.')}
            </span>
          </p>
          <ul className="auth__points">
            <li>
              {t(
                'Po płatności klient widzi kod QR do Twojej wizytówki w Mapach Google.',
                'After paying, the customer sees a QR code to your Google Maps listing.',
              )}
            </li>
            <li>{t('Skany, terminale i ustawienia ekranu w jednym panelu.', 'Scans, terminals and screen settings in one panel.')}</li>
            <li>
              {t(
                'Działa na terminalu, który już masz. Bez naklejek i bez proszenia gości.',
                'Works on the terminal you already have. No stickers, no asking guests.',
              )}
            </li>
          </ul>
        </div>
        <small className="auth__aside-foot">© DooZo</small>
      </aside>

      <main className="auth__main">
        <div className="auth__top">
          <a className="auth__brand" href="/" aria-label={t('DooZo — strona główna', 'DooZo — homepage')}>
            <Logo />
          </a>
          <div className="auth__top-actions">
            <LangSwitch />
            <a className="btn btn--ghost btn--sm" href="/">
              {t('Wróć na stronę', 'Back to site')}
            </a>
          </div>
        </div>
        <div className="card auth__card">{children}</div>
      </main>
    </div>
  )
}
