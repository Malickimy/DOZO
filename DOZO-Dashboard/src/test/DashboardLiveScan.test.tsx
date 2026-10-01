import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../Dashboard'
import { createApiClient } from '../lib/api'
import type { Merchant, Terminal } from '../lib/api'
import type { Settings } from '../lib/settings'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const merchant: Merchant = {
  merchant_id: 'm1',
  google_place_id: 'ChIJ1',
  created_at: '2026-01-01T00:00:00.000Z',
}

const terminal: Terminal = {
  terminal_id: 'TERM1',
  label: 'Front',
  active: true,
  last_seen: '2026-09-24T10:00:00.000Z',
  scan_count: 3,
  last_scan_at: '2026-09-24T10:00:00.000Z',
  static_review_url: null,
}

const settings: Settings = { baseUrl: 'http://api.test', token: 'tok' }

function makeClient() {
  return createApiClient(settings)
}

/** `getTotal` is read on every summary request so tests can simulate scans. */
function stubDashboard(getTotal: () => number) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/merchants')) {
      return Promise.resolve(jsonResponse([merchant]))
    }
    if (url.includes('/api/merchants/m1/terminals')) {
      return Promise.resolve(jsonResponse([terminal]))
    }
    if (url.includes('/api/merchants/m1/summary')) {
      return Promise.resolve(
        jsonResponse({
          merchant_id: 'm1',
          total_scans: getTotal(),
          terminal_count: 1,
          scans_by_terminal: [{ terminal_id: 'TERM1', label: 'Front', scan_count: getTotal() }],
        }),
      )
    }
    if (url.includes('/api/terminals/offline')) {
      return Promise.resolve(
        jsonResponse({ threshold_seconds: 86400, cutoff: '', terminals: [] }),
      )
    }
    return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function summaryCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/summary')).length
}

describe('Dashboard live scans', () => {
  it('does not toast on first load and toasts on the polled increase', async () => {
    vi.useFakeTimers()
    let total = 3
    stubDashboard(() => total)
    render(<Dashboard client={makeClient()} settings={settings} onOpenSettings={vi.fn()} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByText('+2 scans')).not.toBeInTheDocument()

    total = 5
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(screen.getByText('+2 scans')).toBeInTheDocument()
  })

  it('refetches the summary when Refresh is clicked and resets the baseline on a range change', async () => {
    let total = 3
    const fetchMock = stubDashboard(() => total)
    const user = userEvent.setup()
    render(<Dashboard client={makeClient()} settings={settings} onOpenSettings={vi.fn()} />)

    await waitFor(() => expect(summaryCalls(fetchMock)).toBe(1))
    expect(screen.queryByText('+2 scans')).not.toBeInTheDocument()

    total = 5
    const before = summaryCalls(fetchMock)
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(summaryCalls(fetchMock)).toBeGreaterThan(before))
    expect(await screen.findByText('+2 scans')).toBeInTheDocument()

    // Changing the range invalidates the baseline: no false toast.
    await user.click(screen.getByRole('button', { name: '7d' }))
    await waitFor(() => expect(screen.queryByText('+2 scans')).not.toBeInTheDocument())
  })
})
