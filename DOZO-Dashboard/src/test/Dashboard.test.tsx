import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../Dashboard'
import { createApiClient } from '../lib/api'
import type {
  Merchant,
  MerchantSummary,
  OfflineResult,
  Terminal,
} from '../lib/api'
import type { Settings } from '../lib/settings'
import { deferred, jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const settings: Settings = { baseUrl: 'http://api.test', token: 'tok' }

function makeClient() {
  return createApiClient(settings)
}

const merchant: Merchant = {
  merchant_id: 'm1',
  google_place_id: 'ChIJ1',
  created_at: '2026-01-01T00:00:00.000Z',
}

const secondMerchant: Merchant = {
  merchant_id: 'm2',
  google_place_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

const terminal: Terminal = {
  terminal_id: 'TERM1',
  label: 'Till 1',
  active: true,
  last_seen: null,
  scan_count: 3,
  last_scan_at: null,
  static_review_url: null,
}

const summary: MerchantSummary = {
  merchant_id: 'm1',
  total_scans: 3,
  terminal_count: 1,
  scans_by_terminal: [{ terminal_id: 'TERM1', label: 'Till 1', scan_count: 3 }],
}

const offline: OfflineResult = {
  threshold_seconds: 86400,
  cutoff: '2026-09-25T00:00:00.000Z',
  terminals: [
    {
      terminal_id: 'OFF1',
      merchant_id: 'm1',
      label: 'Front',
      active: true,
      last_seen: '2026-09-20T00:00:00.000Z',
    },
    {
      terminal_id: 'OFF2',
      merchant_id: 'm2',
      label: 'Other shop',
      active: true,
      last_seen: '2026-09-20T00:00:00.000Z',
    },
  ],
}

function renderDashboard() {
  return render(
    <Dashboard client={makeClient()} settings={settings} onOpenSettings={vi.fn()} onLogout={vi.fn()} />,
  )
}

describe('Dashboard overview states', () => {
  it('shows overview loading placeholders while data resolves', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/merchants')) return Promise.resolve(jsonResponse([merchant]))
        return pending.promise
      }),
    )

    renderDashboard()

    expect(await screen.findByText(/loading chart/i)).toBeInTheDocument()
    expect(screen.getByText(/loading scans/i)).toBeInTheDocument()
  })

  it('prompts for a merchant when none exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/merchants')) return Promise.resolve(jsonResponse([]))
        return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
      }),
    )

    renderDashboard()

    expect(
      await screen.findByText(/select or enter a merchant id/i),
    ).toBeInTheDocument()
  })

  it('renders a merchant-list failure as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/merchants')) {
          return Promise.resolve(jsonResponse({ message: 'boom' }, 500))
        }
        return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
      }),
    )

    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.')
  })

  it('renders a missing merchant route as not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/merchants')) {
          return Promise.resolve(jsonResponse({ message: 'Route not found' }, 404))
        }
        return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
      }),
    )

    renderDashboard()

    expect(
      await screen.findByText(/the merchant list is not available yet/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/merchant list unavailable/i)).toBeInTheDocument()
  })

  it('scopes offline terminals to the active merchant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/merchants/m1/terminals')) {
          return Promise.resolve(jsonResponse([terminal]))
        }
        if (url.includes('/api/merchants/m1/summary')) {
          return Promise.resolve(jsonResponse(summary))
        }
        if (url.includes('/api/terminals/offline')) {
          return Promise.resolve(jsonResponse(offline))
        }
        if (url.endsWith('/api/merchants')) {
          return Promise.resolve(jsonResponse([merchant, secondMerchant]))
        }
        return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
      }),
    )

    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: /^terminals$/i }))

    expect(await screen.findByText('Front')).toBeInTheDocument()
    expect(screen.queryByText('Other shop')).not.toBeInTheDocument()
  })
})
