import { isApiError, isNotAvailable } from './api'
import type { Translate } from './i18n'

/** Server body for a merchant that does not exist; a real error, not a 404 route. */
export function isUnknownMerchant(error: unknown): boolean {
  if (!isApiError(error)) return false
  const body = error.body
  return (
    body !== null &&
    typeof body === 'object' &&
    'error' in body &&
    (body as { error: unknown }).error === 'unknown_merchant'
  )
}

export function describeIssueError(
  error: unknown,
  merchantId: string,
  t: Translate,
): { message: string; unavailable: boolean } {
  if (isApiError(error)) {
    if (error.isUnauthorized) {
      return {
        message: t('Brak autoryzacji — sprawdź token API.', 'Unauthorized — check the API token.'),
        unavailable: false,
      }
    }
    if (error.status === 503) {
      return {
        message: t(
          'Usługa kodów konfiguracyjnych jest chwilowo niedostępna. Spróbuj ponownie.',
          'The setup-code service is temporarily unavailable. Please try again.',
        ),
        unavailable: false,
      }
    }
    if (isUnknownMerchant(error)) {
      return {
        message: t(`Nieznany sprzedawca „${merchantId}”.`, `Unknown merchant “${merchantId}”.`),
        unavailable: false,
      }
    }
    if (isNotAvailable(error)) {
      return {
        message: t(
          'Wydawanie kodów konfiguracyjnych jest jeszcze niedostępne.',
          'Issuing setup codes is not available yet.',
        ),
        unavailable: true,
      }
    }
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    unavailable: false,
  }
}
