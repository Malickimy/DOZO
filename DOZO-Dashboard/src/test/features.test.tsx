import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../Dashboard'
import { OverviewView } from '../components/OverviewView'
import { PairTerminal } from '../components/PairTerminal'
import { ScreenView } from '../components/ScreenView'
import { createApiClient } from '../lib/api'
import type { Terminal, TerminalConfig } from '../lib/api'
import { plural, recentDays } from '../lib/format'
import { setLang } from '../lib/i18n'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function makeClient() {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

function makeTerminal(overrides: Partial<Terminal> = {}): Terminal {
  return {
    terminal_id: 'TERM1',
    label: 'Front',
    active: true,
    last_seen: null,
    scan_count: 0,
    last_scan_at: null,
    static_review_url: null,
    ...overrides,
  }
}

function makeConfig(terminalId: string): TerminalConfig {
  return {
    terminal_id: terminalId,
    merchant_id: 'm1',
    google_place_id: 'ChIJ1',
    label: terminalId,
    active: true,
    display_enabled: true,
    display_timeout_seconds: 15,
    redirect_base_url: 'http://redirect.test',
    static_review_url: null,
  }
}

type Handler = (url: string, init: RequestInit | undefined) => Response | undefined

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init) ?? jsonResponse({ message: 'unexpected' }, 500)),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('PairTerminal', () => {
  it('issues a code and reports success once the register is bound', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let bound = false
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === 'POST' && url.endsWith('/registers/Till%202/setup-code')) {
        return jsonResponse({
          code: 'AB12CD34',
          merchant_id: 'm1',
          label: 'Till 2',
          expires_at: new Date(Date.now() + 300_000).toISOString(),
          expires_in_seconds: 300,
        })
      }
      if (url.endsWith('/api/merchants/m1/registers')) {
        return jsonResponse(
          bound ? [{ label: 'Till 2', terminal_id: 'NEWDEV', active: true, last_seen: null }] : [],
        )
      }
      return undefined
    })
    const onPaired = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PairTerminal client={makeClient()} merchantId="m1" suggestedName="Till 2" onPaired={onPaired} />,
    )
    await user.click(screen.getByRole('button', { name: /generate code/i }))

    expect(await screen.findByText('AB12')).toBeInTheDocument()
    expect(screen.getByText('CD34')).toBeInTheDocument()
    expect(screen.getByText(/waiting for the terminal/i)).toBeInTheDocument()

    bound = true
    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(await screen.findByText(/terminal paired/i)).toBeInTheDocument()
    expect(onPaired).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('refuses a name that already belongs to a paired terminal', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('/api/merchants/m1/registers')
        ? jsonResponse([{ label: 'Till 2', terminal_id: 'OLD', active: true, last_seen: null }])
        : undefined,
    )
    const user = userEvent.setup()

    render(<PairTerminal client={makeClient()} merchantId="m1" suggestedName="till 2" onPaired={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /generate code/i }))

    expect(await screen.findByText(/already belongs to a paired terminal/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })
})

describe('OverviewView', () => {
  it('sums the daily series and compares it with the previous period', async () => {
    const [yesterday, today] = recentDays(2)
    const previousDay = recentDays(14, 14)[5]
    stubFetch((url) => {
      if (url.includes('/scans/series')) {
        return jsonResponse([
          { day: previousDay, count: 3 },
          { day: yesterday, count: 2 },
          { day: today, count: 4 },
        ])
      }
      if (url.includes('/scans?limit=6')) {
        return jsonResponse([
          { id: 1, terminal_id: 'TERM1', scanned_at: new Date().toISOString(), user_agent: null },
        ])
      }
      if (url.includes('/scans')) return jsonResponse([])
      return undefined
    })

    render(<OverviewView client={makeClient()} merchantId="m1" terminals={[makeTerminal()]} />)

    const kpi = (await screen.findByText('Code scans')).parentElement as HTMLElement
    expect(await within(kpi).findByText('6')).toBeInTheDocument()
    expect(within(kpi).getByText('+100% vs previous 14 days')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /last 14 days, 6 scans in total/i })).toBeInTheDocument()
    expect(await screen.findByText(/code scan, terminal front/i)).toBeInTheDocument()
    expect(screen.getAllByText('awaiting API')).toHaveLength(3)
  })
})

describe('ScreenView', () => {
  it('saves the display settings to every active terminal', async () => {
    const fetchMock = stubFetch((url, init) => {
      const match = url.match(/\/api\/terminals\/(\w+)\/config$/)
      if (match) return jsonResponse(makeConfig(match[1]))
      if (init?.method === 'PUT') return jsonResponse({})
      return undefined
    })
    const user = userEvent.setup()
    const terminals = [
      makeTerminal({ terminal_id: 'TERM1' }),
      makeTerminal({ terminal_id: 'TERM2' }),
      makeTerminal({ terminal_id: 'TERM3', active: false }),
    ]

    render(
      <ScreenView
        client={makeClient()}
        merchantId="m1"
        merchant={null}
        terminals={terminals}
        onMerchantSaved={vi.fn()}
      />,
    )

    const slider = await screen.findByRole('slider')
    fireEvent.change(slider, { target: { value: '20' } })
    expect(screen.getByText('Closing in 20 s')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    expect(await screen.findByText('Settings saved')).toBeInTheDocument()
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(puts.map(([url]) => String(url))).toEqual([
      'http://api.test/api/terminals/TERM1/config',
      'http://api.test/api/terminals/TERM2/config',
    ])
    expect(JSON.parse(String(puts[0][1]?.body))).toEqual({ display_timeout_seconds: 20 })
  })
})

describe('language', () => {
  it('defaults to Polish and switches to English', async () => {
    setLang('pl')
    stubFetch((url) => (url.endsWith('/api/merchants') ? jsonResponse([]) : undefined))
    const user = userEvent.setup()

    render(
      <Dashboard
        client={makeClient()}
        settings={{ baseUrl: 'http://api.test', token: 'tok' }}
        onOpenSettings={vi.fn()}
        onLogout={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Przegląd' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Przegląd — DooZo'))

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('picks the Polish plural form', () => {
    expect([1, 2, 5, 12, 22, 25].map((n) => plural(n, 'skan', 'skany', 'skanów'))).toEqual([
      'skan',
      'skany',
      'skanów',
      'skanów',
      'skany',
      'skanów',
    ])
  })
})
