import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflinePanel } from '../components/OfflinePanel'
import { createApiClient } from '../lib/api'
import type { OfflineResult } from '../lib/api'
import { deferred, jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeClient() {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

const offline: OfflineResult = {
  threshold_seconds: 86400,
  cutoff: '2026-09-25T00:00:00.000Z',
  terminals: [
    {
      terminal_id: 'T1',
      merchant_id: 'm1',
      label: 'Front',
      active: true,
      last_seen: '2026-09-20T00:00:00.000Z',
    },
    {
      terminal_id: 'T2',
      merchant_id: 'm2',
      label: 'Other',
      active: true,
      last_seen: '2026-09-20T00:00:00.000Z',
    },
  ],
}

describe('OfflinePanel', () => {
  it('shows a loading state before the fleet list resolves', () => {
    const pending = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))

    render(<OfflinePanel client={makeClient()} merchantId="m1" />)

    expect(screen.getByText(/checking terminals/i)).toBeInTheDocument()
  })

  it('lists only the active merchant offline terminals', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(offline))))

    render(<OfflinePanel client={makeClient()} merchantId="m1" />)

    expect(await screen.findByText('Front')).toBeInTheDocument()
    expect(screen.queryByText('Other')).not.toBeInTheDocument()
  })

  it('keeps the global list when no merchant is selected', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(offline))))

    render(<OfflinePanel client={makeClient()} />)

    expect(await screen.findByText('Front')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('shows the all-clear empty state when the merchant has none offline', async () => {
    const merchantOnly = { ...offline, terminals: [offline.terminals[1]] }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(merchantOnly))))

    render(<OfflinePanel client={makeClient()} merchantId="m1" />)

    expect(await screen.findByText(/all terminals are reporting in/i)).toBeInTheDocument()
    expect(screen.queryByText('Other')).not.toBeInTheDocument()
  })

  it('maps a missing route to NotAvailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'Route not found' }, 404))),
    )

    render(<OfflinePanel client={makeClient()} merchantId="m1" />)

    expect(
      await screen.findByText(/offline terminals is not available yet/i),
    ).toBeInTheDocument()
  })

  it('maps a server error to ErrorState and retries', async () => {
    let calls = 0
    const fetchMock = vi.fn(() => {
      calls += 1
      return Promise.resolve(jsonResponse({ message: 'boom' }, 500))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<OfflinePanel client={makeClient()} merchantId="m1" />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(calls).toBeGreaterThan(1))
  })
})
