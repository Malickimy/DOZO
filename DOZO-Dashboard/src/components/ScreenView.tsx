import { useState } from 'react'
import type { ApiClient, Merchant, Terminal, TerminalConfig } from '../lib/api'
import { isActive } from '../lib/format'
import { useT } from '../lib/i18n'
import { useAsync } from '../lib/useAsync'
import { GooglePlaceIdForm } from './GooglePlaceIdForm'
import { QrGlyph } from './QrGlyph'
import { AwaitingApi, Empty, ErrorState, Loading } from './StateMessage'

interface ScreenViewProps {
  client: ApiClient
  merchantId: string
  merchant: Merchant | null
  terminals: Terminal[]
  onMerchantSaved: () => void
}

export function ScreenView({ client, merchantId, merchant, terminals, onMerchantSaved }: ScreenViewProps) {
  const t = useT()
  const activeIds = terminals.filter((terminal) => isActive(terminal.active)).map((terminal) => terminal.terminal_id)
  const idsKey = activeIds.join(',')

  const configsState = useAsync(
    () => Promise.all(activeIds.map((id) => client.getTerminalConfig(id))),
    [client, idsKey],
  )

  return (
    <div className="stack">
      <div className="card">
        {configsState.loading ? <Loading label={t('Ładowanie ustawień…', 'Loading settings…')} /> : null}
        {configsState.error ? (
          <ErrorState error={configsState.error} onRetry={configsState.reload} />
        ) : null}
        {configsState.data && configsState.data.length === 0 ? (
          <>
            <h2 className="card__title">{t('Ekran po płatności', 'After-payment screen')}</h2>
            <Empty>
              {t(
                'Połącz najpierw aktywny terminal — ustawienia ekranu zapisują się na terminalach.',
                'Pair an active terminal first — screen settings are stored on terminals.',
              )}
            </Empty>
          </>
        ) : null}
        {configsState.data && configsState.data.length > 0 ? (
          <ScreenSettingsForm
            key={idsKey}
            client={client}
            merchantId={merchantId}
            configs={configsState.data}
          />
        ) : null}
      </div>

      <GooglePlaceIdForm
        key={merchantId}
        client={client}
        merchantId={merchantId}
        currentPlaceId={merchant?.google_place_id ?? null}
        onSaved={onMerchantSaved}
      />
    </div>
  )
}

interface ScreenSettingsFormProps {
  client: ApiClient
  merchantId: string
  configs: TerminalConfig[]
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; failed: number }

function ScreenSettingsForm({ client, merchantId, configs }: ScreenSettingsFormProps) {
  const t = useT()
  const [seconds, setSeconds] = useState(configs[0].display_timeout_seconds)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })

  const mixed = configs.some(
    (config) => config.display_timeout_seconds !== configs[0].display_timeout_seconds,
  )

  async function handleSave() {
    setSave({ kind: 'saving' })
    const results = await Promise.allSettled(
      configs.map((config) =>
        client.putTerminalConfig(config.terminal_id, { display_timeout_seconds: seconds }),
      ),
    )
    const failed = results.filter((result) => result.status === 'rejected').length
    setSave(failed ? { kind: 'failed', failed } : { kind: 'saved' })
  }

  function markDirty() {
    if (save.kind !== 'saving') setSave({ kind: 'idle' })
  }

  const count = configs.length

  return (
    <div className="setgrid">
      <div>
        <h2 className="card__title">{t('Ekran po płatności', 'After-payment screen')}</h2>
        <p className="muted">
          {t(
            `Zmiany zapiszą się na aktywnych terminalach (${count}). Terminale pobiorą je przy kolejnej synchronizacji albo po „Synchronizuj teraz” w ustawieniach terminala.`,
            `Changes are saved to the active terminals (${count}). They pick them up at the next sync, or right away via “Sync now” in the terminal settings.`,
          )}
        </p>

        <label className="field">
          <span className="field__label">
            {t('Czas wyświetlania:', 'Display time:')} {seconds} s
          </span>
          <input
            className="range"
            type="range"
            min={5}
            max={30}
            value={seconds}
            onChange={(event) => {
              setSeconds(Number(event.target.value))
              markDirty()
            }}
          />
        </label>

        {mixed ? (
          <p className="hint">
            {t(
              'Terminale mają teraz różne czasy wyświetlania. Zapis ujednolici je na wszystkich aktywnych terminalach.',
              'Terminals currently have different display times. Saving applies the same value to every active terminal.',
            )}
          </p>
        ) : null}

        <div className="save-row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={save.kind === 'saving'}
            onClick={handleSave}
          >
            {save.kind === 'saving' ? t('Zapisuję…', 'Saving…') : t('Zapisz ustawienia', 'Save settings')}
          </button>
          {save.kind === 'saved' ? (
            <span className="auth__result auth__result--ok" role="status">
              {t('Ustawienia zapisane', 'Settings saved')}
            </span>
          ) : null}
        </div>
        {save.kind === 'failed' ? (
          <p className="state state--error" role="alert">
            {t(
              `Nie udało się zapisać na ${save.failed} z ${count} terminali. Spróbuj ponownie.`,
              `Saving failed on ${save.failed} of ${count} terminals. Please try again.`,
            )}
          </p>
        ) : null}

        <div className="subsection">
          <h3 className="subsection__title">{t('Treść ekranu', 'Screen content')}</h3>
          <div className="field">
            <span className="field__label">{t('Nazwa lokalu', 'Venue name')}</span>
            <input className="input" type="text" placeholder={merchantId} disabled />
          </div>
          <div className="field">
            <span className="field__label">{t('Prośba o opinię', 'Review request')}</span>
            <input
              className="input"
              type="text"
              placeholder={t('Zeskanuj kod i oceń nas w Google', 'Scan the code and rate us on Google')}
              disabled
            />
          </div>
          <label className="field field--switch is-disabled">
            <span>{t('Kod −10% za zapis do newslettera', '−10% code for a newsletter sign-up')}</span>
            <input type="checkbox" disabled />
          </label>
          <AwaitingApi>
            {t(
              'Na razie te teksty ustawia się lokalnie na terminalu (Ustawienia → Ekran). Edycja z panelu i kod −10% wymagają endpointu ustawień ekranu na serwerze.',
              'For now these texts are set locally on the terminal (Settings → Screen). Editing them here and the −10% code need a screen-settings endpoint on the server.',
            )}
          </AwaitingApi>
        </div>
      </div>

      <div className="mini" aria-label={t('Podgląd ekranu terminala', 'Terminal screen preview')}>
        <div className="mini__screen">
          <div className="mini__venue">{merchantId.toUpperCase()}</div>
          <div className="mini__title">{t('Płatność zatwierdzona', 'Payment approved')}</div>
          <div className="mini__prompt">
            {t('Zeskanuj kod i oceń nas w Google', 'Scan the code and rate us on Google')}
          </div>
          <div className="qrbox">
            <QrGlyph seed={merchantId} />
          </div>
          <div className="mini__closing">
            {t(`Zamknięcie za ${seconds} s`, `Closing in ${seconds} s`)}
          </div>
          <span className="pill">{t('Gotowe', 'Done')}</span>
        </div>
      </div>
    </div>
  )
}
