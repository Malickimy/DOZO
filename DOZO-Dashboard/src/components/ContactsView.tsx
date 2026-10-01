import { useT } from '../lib/i18n'
import { AwaitingApi } from './StateMessage'

export function ContactsView() {
  const t = useT()

  return (
    <div className="stack">
      <div className="card">
        <div className="card__header card__header--top">
          <div>
            <h2 className="card__title">{t('Zapisani do newslettera', 'Newsletter subscribers')}</h2>
            <p className="muted card__sub">
              {t(
                'Osoby, które po zeskanowaniu kodu zapisały się do newslettera i odebrały kod −10%.',
                'People who joined the newsletter after scanning the code and received the −10% code.',
              )}
            </p>
          </div>
          <button className="btn btn--primary" type="button" disabled>
            {t('Eksportuj do CSV', 'Export to CSV')}
          </button>
        </div>

        <div className="toolbar">
          <input
            className="input"
            type="search"
            placeholder={t('Szukaj po e-mailu lub imieniu', 'Search by email or name')}
            aria-label={t('Szukaj kontaktu', 'Search contacts')}
            disabled
          />
          <select className="input" aria-label={t('Status zgody', 'Consent status')} disabled>
            <option>{t('Wszystkie zgody', 'All consents')}</option>
          </select>
        </div>

        <AwaitingApi>
          {t(
            'Lista kontaktów, wyszukiwanie i eksport CSV zadziałają, gdy serwer udostępni zapisy do newslettera (z datą zgody i jej wersją).',
            'The contact list, search and CSV export will work once the server exposes newsletter sign-ups (with consent date and version).',
          )}
        </AwaitingApi>

        <p className="hint">
          {t(
            'Eksport obejmie zaznaczone osoby, a gdy nic nie zaznaczysz — wszystkie widoczne na liście. Osoby z wycofaną zgodą są zawsze pomijane. Plik CSV zaimportujesz do Mailchimpa, MailerLite lub innego narzędzia do wysyłki.',
            'The export covers the selected people or, with nothing selected, everyone visible in the list. People who withdrew consent are always skipped. You can import the CSV into Mailchimp, MailerLite or another mailing tool.',
          )}
        </p>
      </div>

      <div className="card">
        <h2 className="card__title">{t('Treść zgody przy zapisie', 'Consent wording at sign-up')}</h2>
        <p className="muted">
          {t(
            'Wersja 1.0. Przy każdym kontakcie zapisujemy datę, godzinę i wersję tej treści jako dowód zgody.',
            'Version 1.0. For every contact we store the date, time and version of this wording as proof of consent.',
          )}
        </p>
        <p className="consent">
          {t(
            'Chcę otrzymywać od [nazwa lokalu] newsletter z informacjami handlowymi i ofertami na podany adres e-mail. Zgoda jest dobrowolna. Mogę ją wycofać w każdej chwili, klikając link w wiadomości. Administratorem danych jest [nazwa lokalu, adres]. Szczegóły w polityce prywatności.',
            'I want to receive the [venue name] newsletter with commercial information and offers at the email address I gave. Consent is voluntary. I can withdraw it at any time via the link in each message. The data controller is [venue name, address]. Details in the privacy policy.',
          )}
        </p>
      </div>
    </div>
  )
}
