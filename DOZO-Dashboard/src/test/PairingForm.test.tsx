import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PairingForm } from '../components/PairingForm'
import { createApiClient } from '../lib/api'
import type { ClaimResult } from '../lib/api'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeClient() {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

const claimed: ClaimResult = {
  status: 'claimed',
  api_token: 'term-token',
  store: {
    terminal_id: 'TERM1',
    merchant_id: 'm1',
    google_place_id: 'ChIJ1',
    label: 'Till 1',
    redirect_url: 'http://redirect.test/r',
  },
}

async function submitCode(code: string) {
  const user = userEvent.setup()
  render(<PairingForm client={makeClient()} />)
  await user.type(screen.getByLabelText(/pairing code/i), code)
  await user.click(screen.getByRole('button', { name: /claim terminal/i }))
  return user
}

describe('PairingForm', () => {
  it('validates the code length before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await submitCode('abc')

    expect(await screen.findByText(/8-character pairing code/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a missing claim route as not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'Route not found' }, 404))),
    )

    await submitCode('AB12CD34')

    expect(await screen.findByText(/pairing is not available yet/i)).toBeInTheDocument()
  })

  it('surfaces a server error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'code expired' }, 410))),
    )

    await submitCode('AB12CD34')

    expect(await screen.findByRole('alert')).toHaveTextContent(/code expired/i)
  })

  it('renders the claimed store on success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(claimed))))

    await submitCode('AB12CD34')

    expect(await screen.findByText(/claimed/i)).toBeInTheDocument()
    expect(screen.getByText('m1')).toBeInTheDocument()
    expect(screen.getByText('term-token')).toBeInTheDocument()
  })
})
