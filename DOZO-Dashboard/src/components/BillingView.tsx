import { useT } from '../lib/i18n'
import { AwaitingApi } from './StateMessage'

export function BillingView() {
  const t = useT()

  return (
    <div className="two">
      <div className="card">
        <h2 className="card__title">{t('Subskrypcja', 'Subscription')}</h2>
        <p className="muted">
          {t('Plan, status i termin kolejnej płatności.', 'Plan, status and next payment date.')}
        </p>
        <AwaitingApi>
          {t(
            'Status subskrypcji pojawi się tu, gdy serwer zacznie udostępniać dane rozliczeniowe.',
            'The subscription status will appear here once the server exposes billing data.',
          )}
        </AwaitingApi>
        <div className="form__actions">
          <a className="btn btn--primary" href="/#/zamowienie?plan=newsletter&n=1">
            {t('Opłać kolejny okres', 'Pay for the next period')}
          </a>
          <a className="btn btn--ghost" href="/#/zamowienie">
            {t('Zmień plan', 'Change plan')}
          </a>
        </div>
      </div>
      <div className="card">
        <h2 className="card__title">{t('Faktury', 'Invoices')}</h2>
        <p className="muted">
          {t('Faktury pojawią się tu po pierwszej płatności.', 'Invoices will appear here after the first payment.')}
        </p>
        <AwaitingApi>
          {t(
            'Lista faktur wymaga endpointu historii płatności na serwerze.',
            'The invoice list needs a payment-history endpoint on the server.',
          )}
        </AwaitingApi>
      </div>
    </div>
  )
}
