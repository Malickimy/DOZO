import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegistersView } from '../components/RegistersView'
import { createApiClient } from '../lib/api'
import type { Register, SetupCode } from '../lib/api'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

interface StubOptions {
  registers?: Register[]
  registersStatus?: number
  registersBody?: unknown
  setup?: SetupCode
  setupStatus?: number
}

function stubApi({
  registers = [],
  registersStatus = 200,
  registersBody,
  setup,
  setupStatus = 200,
}: StubOptions = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'POST' && url.includes('/setup-code')) {
      return Promise.resolve(jsonResponse(setup, setupStatus))
    }
    if (method === 'GET' && url.includes('/registers')) {
      return Promise.resolve(
        jsonResponse(registersBody ?? registers, registersStatus),
      )
    }
    return Promise.resolve(jsonResponse({ message: 'unexpected request' }, 500))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeClient() {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

const claimed: Register = {
  label: 'Till 1',
  terminal_id: null,
  active: true,
  last_seen: null,
}

const setupCode: SetupCode = {
  code: 'AB12CD34',
  merchant_id: 'm1',
  label: 'Till 1',
  expires_at: '2026-01-01T00:05:00.000Z',
  expires_in_seconds: 300,
}

describe('RegistersView', () => {
  it('renders the issued one-time code and expiry', async () => {
    stubApi({ registers: [claimed], setup: setupCode })
    const user = userEvent.setup()

    render(<RegistersView client={makeClient()} merchantId="m1" />)

    await user.click(await screen.findByRole('button', { name: /issue/i }))

    expect(await screen.findByText('AB12CD34')).toBeInTheDocument()
    const expires = new Date(setupCode.expires_at).toLocaleString()
    expect(screen.getByText(expires, { exact: false })).toBeInTheDocument()
    expect(screen.getByText('(300s)', { exact: false })).toBeInTheDocument()
  })

  it('shows NotAvailable when the registers route is missing', async () => {
    stubApi({ registersStatus: 404, registersBody: { message: 'Not found' } })

    render(<RegistersView client={makeClient()} merchantId="m1" />)

    expect(
      await screen.findByText(/registers list is not available yet/i),
    ).toBeInTheDocument()
  })

  it('shows an unauthorized error for 401 responses', async () => {
    stubApi({ registersStatus: 401, registersBody: { message: 'nope' } })

    render(<RegistersView client={makeClient()} merchantId="m1" />)

    expect(await screen.findByText(/unauthorized/i)).toBeInTheDocument()
  })

  it('requires confirmation before issuing for an occupied register', async () => {
    const fetchMock = stubApi({
      registers: [{ ...claimed, terminal_id: 'T-1' }],
      setup: setupCode,
    })
    const user = userEvent.setup()

    render(<RegistersView client={makeClient()} merchantId="m1" />)

    await user.click(await screen.findByRole('button', { name: /issue/i }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByText(/issuing a new code will swap the device/i),
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(await screen.findByText('AB12CD34')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1)
  })
})
