import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BillingView } from './components/BillingView'
import { ContactsView } from './components/ContactsView'
import { GuideView } from './components/GuideView'
import { LangSwitch } from './components/LangSwitch'
import { Logo } from './components/Logo'
import { MerchantPicker } from './components/MerchantPicker'
import { OverviewView } from './components/OverviewView'
import { ScreenView } from './components/ScreenView'
import { ErrorState, Empty, NotAvailable } from './components/StateMessage'
import { TerminalDrawer } from './components/TerminalDrawer'
import { TerminalsView } from './components/TerminalsView'
import { isNotAvailable } from './lib/api'
import type { ApiClient, Terminal } from './lib/api'
import { useT } from './lib/i18n'
import type { Settings } from './lib/settings'
import { useAsync } from './lib/useAsync'

interface DashboardProps {
  client: ApiClient
  settings: Settings
  onOpenSettings: () => void
  onLogout: () => void
}

type Tab = 'overview' | 'terminals' | 'screen' | 'contacts' | 'guide' | 'billing'

export function Dashboard({ client, settings, onOpenSettings, onLogout }: DashboardProps) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('overview')
  const [merchantId, setMerchantId] = useState('')
  const [managingId, setManagingId] = useState<string | null>(null)

  const merchantsState = useAsync(() => client.listMerchants(), [client])
  const merchants = merchantsState.data ?? []
  const merchantsUnavailable = isNotAvailable(merchantsState.error)

  // Fall back to the first merchant until the user picks or types one.
  const activeMerchantId = merchantId || merchants[0]?.merchant_id || ''

  const terminalsState = useAsync<Terminal[]>(
    () => (activeMerchantId ? client.listTerminals(activeMerchantId) : Promise.resolve([])),
    [client, activeMerchantId],
  )

  const terminals = terminalsState.data ?? []
  const selectedMerchant =
    merchants.find((merchant) => merchant.merchant_id === activeMerchantId) ?? null
  const managingTerminal =
    terminals.find((terminal) => terminal.terminal_id === managingId) ?? null

  const reloadTerminals = terminalsState.reload
  const refreshAfterWrite = useCallback(() => reloadTerminals(), [reloadTerminals])

  const tabs: ReadonlyArray<{ key: Tab; label: ReactNode; title: string; icon: ReactNode }> = [
    { key: 'overview', label: t('Przegląd', 'Overview'), title: t('Przegląd', 'Overview'), icon: ICONS.overview },
    { key: 'terminals', label: t('Terminale', 'Terminals'), title: t('Terminale', 'Terminals'), icon: ICONS.terminals },
    {
      key: 'screen',
      label: (
        <span>
          {t('Ekran', 'Screen')}
          <span className="lbl-long">{t(' po płatności', ' after payment')}</span>
        </span>
      ),
      title: t('Ekran po płatności', 'After-payment screen'),
      icon: ICONS.screen,
    },
    { key: 'contacts', label: t('Baza kontaktów', 'Contacts'), title: t('Baza kontaktów', 'Contacts'), icon: ICONS.contacts },
    { key: 'guide', label: t('Poradnik', 'Guide'), title: t('Poradnik', 'Guide'), icon: ICONS.guide },
    { key: 'billing', label: t('Subskrypcja', 'Subscription'), title: t('Subskrypcja', 'Subscription'), icon: ICONS.billing },
  ]
  const activeTab = tabs.find((item) => item.key === tab) ?? tabs[0]

  useEffect(() => {
    document.title = `${activeTab.title} — DooZo`
  }, [activeTab.title])

  const needsMerchant = tab === 'overview' || tab === 'terminals' || tab === 'screen'

  return (
    <div className="app">
      <aside className="side">
        <a className="side__brand" href="/" aria-label={t('DooZo — strona główna', 'DooZo — homepage')}>
          <Logo />
        </a>
        <nav className="side__nav" aria-label={t('Sekcje', 'Sections')}>
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => setTab(item.key)}
            >
              {item.icon}
              {typeof item.label === 'string' ? <span>{item.label}</span> : item.label}
            </button>
          ))}
        </nav>
        <div className="side__bottom">
          <LangSwitch />
          <a href="/">
            {ICONS.home}
            <span>{t('Strona główna', 'Homepage')}</span>
          </a>
          <button type="button" onClick={onOpenSettings}>
            {ICONS.settings}
            <span>{t('Ustawienia API', 'Settings')}</span>
          </button>
          <button type="button" onClick={onLogout}>
            {ICONS.logout}
            <span>{t('Wyloguj się', 'Sign out')}</span>
          </button>
          {activeMerchantId ? (
            <div className="who">
              <span className="avatar" aria-hidden="true">
                {activeMerchantId.charAt(0).toUpperCase()}
              </span>
              <span className="who__name">{activeMerchantId}</span>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="dash">
        <div className="dash-top">
          <h1>{activeTab.title}</h1>
          <MerchantPicker
            merchants={merchants}
            value={activeMerchantId}
            onChange={setMerchantId}
            unavailable={merchantsUnavailable}
            loading={merchantsState.loading}
          />
        </div>

        {merchantsState.error && !merchantsUnavailable ? (
          <ErrorState error={merchantsState.error} onRetry={merchantsState.reload} />
        ) : null}

        {merchantsUnavailable ? (
          <NotAvailable label={t('Lista sprzedawców', 'The merchant list')} />
        ) : null}

        {needsMerchant && !activeMerchantId ? (
          <Empty>
            {t(
              'Wybierz albo wpisz ID sprzedawcy, żeby wczytać jego terminale i skany.',
              'Select or enter a merchant ID to load its terminals and scans.',
            )}
          </Empty>
        ) : null}

        {activeMerchantId && tab === 'overview' ? (
          <OverviewView client={client} merchantId={activeMerchantId} terminals={terminals} />
        ) : null}

        {activeMerchantId && tab === 'terminals' ? (
          <TerminalsView
            client={client}
            merchantId={activeMerchantId}
            terminalsState={terminalsState}
            onManage={(terminal) => setManagingId(terminal.terminal_id)}
            onChanged={refreshAfterWrite}
          />
        ) : null}

        {activeMerchantId && tab === 'screen' ? (
          <ScreenView
            client={client}
            merchantId={activeMerchantId}
            merchant={selectedMerchant}
            terminals={terminals}
            onMerchantSaved={merchantsState.reload}
          />
        ) : null}

        {tab === 'contacts' ? <ContactsView /> : null}
        {tab === 'guide' ? <GuideView /> : null}
        {tab === 'billing' ? <BillingView /> : null}

        <footer className="footer">
          <span>
            API: <code>{settings.baseUrl}</code>
          </span>
          <span>
            {t(
              'Opinii nie da się przypisać do skanu — mierzymy skany.',
              'Reviews can’t be attributed — scan volume is the metric.',
            )}
          </span>
        </footer>
      </main>

      {managingTerminal ? (
        <TerminalDrawer
          client={client}
          terminal={managingTerminal}
          terminals={terminals}
          onClose={() => setManagingId(null)}
          onSaved={refreshAfterWrite}
        />
      ) : null}
    </div>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

const ICONS = {
  overview: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </Icon>
  ),
  terminals: (
    <Icon>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10 18h4" />
    </Icon>
  ),
  screen: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M14 21h7M21 17v4" />
    </Icon>
  ),
  contacts: (
    <Icon>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Icon>
  ),
  guide: (
    <Icon>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5M9 7h6" />
    </Icon>
  ),
  billing: (
    <Icon>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </Icon>
  ),
  logout: (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Icon>
  ),
  home: (
    <Icon>
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  ),
}
