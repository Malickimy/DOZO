import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../Dashboard'
import { TerminalDrawer } from '../components/TerminalDrawer'
import { createApiClient } from '../lib/api'
import type { Merchant, MerchantSummary, Terminal, TerminalConfig } from '../lib/api'
import type { Settings } from '../lib/settings'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

interface StubOptions {
  config?: TerminalConfig
  configStatus?: number
  configBody?: unknown
  patchStatus?: number
  patchBody?: unknown
  putStatus?: number
}

function makeConfig(overrides: Partial<TerminalConfig> = {}): TerminalConfig {
  return {
    terminal_id: 'TERM1',
    merchant_id: 'm1',
    google_place_id: 'ChIJ1',
    label: 'Front',
    active: true,
    display_enabled: true,
    display_timeout_seconds: 15,
    redirect_base_url: 'http://redirect.test',
    static_review_url: 'https://search.google.com/local/writereview?placeid=ChIJ1',
    ...overrides,
  }
}

function makeTerminal(overrides: Partial<Terminal> = {}): Terminal {
  return {
    terminal_id: 'TERM1',
    label: 'Front',
    active: true,
    last_seen: '2026-09-24T10:00:00.000Z',
    scan_count: 3,
    last_scan_at: '2026-09-24T10:00:00.000Z',
    static_review_url: 'https://search.google.com/local/writereview?placeid=ChIJ1',
    ...overrides,
  }
}

function stubApi({ config = makeConfig(), configStatus = 200, configBody, patchStatus = 200, patchBody, putStatus = 200 }: StubOptions = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'GET' && url.includes('/config')) {
      return Promise.resolve(jsonResponse(configBody ?? config, configStatus))
    }
    if (method === 'PATCH') {
      return Promise.resolve(jsonResponse(patchBody ?? config, patchStatus))
    }
    if (method === 'PUT') {
      return Promise.resolve(jsonResponse(config, putStatus))
    }
    return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeClient() {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, method: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === method,
  )
  return JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))
}

function renderDrawer(terminals: Terminal[] = [makeTerminal()]) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <TerminalDrawer
      client={makeClient()}
      terminal={terminals[0]}
      terminals={terminals}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  return { onClose, onSaved }
}

describe('TerminalDrawer', () => {
  it('loads the config and shows the static review link', async () => {
    const fetchMock = stubApi()
    renderDrawer()

    expect(await screen.findByText(/show qr/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /writereview/i })
    expect(link).toHaveAttribute(
      'href',
      'https://search.google.com/local/writereview?placeid=ChIJ1',
    )
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/config'))).toBe(true)
  })

  it('routes label changes to PATCH and display changes to PUT', async () => {
    const fetchMock = stubApi()
    const user = userEvent.setup()
    renderDrawer()

    const labelInput = await screen.findByDisplayValue('Front')
    await user.clear(labelInput)
    await user.type(labelInput, 'Back till')
    await user.click(screen.getByRole('button', { name: /save label/i }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PATCH'),
      ).toBe(true)
    })
    expect(requestBody(fetchMock, 'PATCH')).toEqual({ label: 'Back till' })

    const timeoutInput = screen.getByRole('spinbutton')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '30')
    await user.click(screen.getByRole('button', { name: /save display/i }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PUT'),
      ).toBe(true)
    })
    expect(requestBody(fetchMock, 'PUT')).toEqual({
      display_enabled: true,
      display_timeout_seconds: 30,
    })
  })

  it('confirms before deactivating the last active terminal', async () => {
    const fetchMock = stubApi()
    const user = userEvent.setup()
    renderDrawer([makeTerminal({ active: true })])

    const activeToggle = await screen.findByRole('checkbox', { name: /active/i })
    await user.click(activeToggle)

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PATCH'),
    ).toBe(false)

    await user.click(screen.getByRole('button', { name: /^deactivate$/i }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
    })
    expect(requestBody(fetchMock, 'PATCH')).toEqual({ active: false })
  })

  it('does not confirm when another terminal stays active', async () => {
    const fetchMock = stubApi()
    const user = userEvent.setup()
    const primary = makeTerminal({ terminal_id: 'TERM1', active: true })
    const secondary = makeTerminal({ terminal_id: 'TERM2', active: true })
    render(
      <TerminalDrawer
        client={makeClient()}
        terminal={primary}
        terminals={[primary, secondary]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('checkbox', { name: /active/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PATCH'),
      ).toBe(true)
    })
  })

  it('surfaces the label_in_use error code', async () => {
    stubApi({ patchStatus: 400, patchBody: { error: 'label_in_use' } })
    const user = userEvent.setup()
    renderDrawer()

    const labelInput = await screen.findByDisplayValue('Front')
    await user.clear(labelInput)
    await user.type(labelInput, 'Front')
    await user.click(screen.getByRole('button', { name: /save label/i }))

    expect(await screen.findByText('Label already in use.')).toBeInTheDocument()
  })

  it('surfaces a friendly unknown_terminal state instead of a raw 404', async () => {
    stubApi({ configStatus: 404, configBody: { error: 'unknown_terminal' } })
    renderDrawer()

    expect(await screen.findByText(/unknown to the server/i)).toBeInTheDocument()
    expect(screen.queryByText(/not found:/i)).not.toBeInTheDocument()
  })
})

describe('Dashboard terminal management', () => {
  const merchant: Merchant = {
    merchant_id: 'm1',
    google_place_id: 'ChIJ1',
    created_at: '2026-01-01T00:00:00.000Z',
  }
  const summary: MerchantSummary = {
    merchant_id: 'm1',
    total_scans: 3,
    terminal_count: 1,
    scans_by_terminal: [{ terminal_id: 'TERM1', label: 'Front', scan_count: 3 }],
  }
  const settings: Settings = { baseUrl: 'http://api.test', token: 'tok' }

  function stubDashboard() {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/merchants/m1/terminals')) {
        return Promise.resolve(jsonResponse([makeTerminal()]))
      }
      if (url.includes('/api/merchants/m1/summary')) {
        return Promise.resolve(jsonResponse(summary))
      }
      if (url.endsWith('/api/merchants')) {
        return Promise.resolve(jsonResponse([merchant]))
      }
      if (url.includes('/api/terminals/offline')) {
        return Promise.resolve(
          jsonResponse({ threshold_seconds: 86400, cutoff: '', terminals: [] }),
        )
      }
      if (url.includes('/api/terminals/TERM1/config')) {
        return Promise.resolve(jsonResponse(makeConfig()))
      }
      return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('does not read the terminal config until the drawer is opened', async () => {
    const fetchMock = stubDashboard()
    const user = userEvent.setup()
    render(
      <Dashboard client={makeClient()} settings={settings} onOpenSettings={vi.fn()} />,
    )

    expect(await screen.findByRole('button', { name: /manage/i })).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/config')),
    ).toBe(false)

    await user.click(screen.getByRole('button', { name: /manage/i }))

    expect(await screen.findByText(/show qr/i)).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/config')),
    ).toBe(true)
  })
})
