import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScansView } from '../components/ScansView'
import { createApiClient } from '../lib/api'
import type { ApiClient, MerchantSummary, Terminal } from '../lib/api'
import { initialRange } from '../lib/range'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const terminals: Terminal[] = [
  {
    terminal_id: 'TERM1',
    label: 'Front',
    active: true,
    last_seen: null,
    scan_count: 2,
    last_scan_at: null,
    static_review_url: null,
  },
]

const summary: MerchantSummary = {
  merchant_id: 'm1',
  total_scans: 2,
  terminal_count: 1,
  scans_by_terminal: [{ terminal_id: 'TERM1', label: 'Front', scan_count: 2 }],
}

function stubApi() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/scans/series')) {
      return Promise.resolve(
        jsonResponse([
          { day: '2026-09-24', count: 2 },
          { day: '2026-09-25', count: 1 },
        ]),
      )
    }
    if (url.includes('/scans')) {
      return Promise.resolve(jsonResponse([]))
    }
    return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeClient(): ApiClient {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

function Harness({ client }: { client: ApiClient }) {
  const [range, setRange] = useState(initialRange)
  return (
    <ScansView
      client={client}
      merchantId="m1"
      terminals={terminals}
      range={range}
      onRangeChange={setRange}
      summary={summary}
    />
  )
}

function seriesUrls(fetchMock: ReturnType<typeof vi.fn>): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/scans/series'))
}

describe('ScansView', () => {
  it('renders the series day verbatim and the range-scoped bars', async () => {
    stubApi()
    render(<Harness client={makeClient()} />)

    expect(await screen.findByText('2026-09-24')).toBeInTheDocument()
    expect(screen.getByText('2026-09-25')).toBeInTheDocument()
    expect(screen.getAllByText('Front').length).toBeGreaterThan(0)
  })

  it('refetches with a narrower since when a preset is chosen', async () => {
    const fetchMock = stubApi()
    const user = userEvent.setup()
    render(<Harness client={makeClient()} />)

    await waitFor(() => expect(seriesUrls(fetchMock)).toHaveLength(1))
    const first = seriesUrls(fetchMock)[0].searchParams
    expect(first.get('bucket')).toBe('day')

    await user.click(screen.getByRole('button', { name: '7d' }))

    await waitFor(() => expect(seriesUrls(fetchMock).length).toBeGreaterThan(1))
    const calls = seriesUrls(fetchMock)
    const next = calls[calls.length - 1].searchParams
    expect(next.get('bucket')).toBe('day')
    expect(next.get('since')! > first.get('since')!).toBe(true)
    expect(next.get('until')).toBeTruthy()
  })
})
