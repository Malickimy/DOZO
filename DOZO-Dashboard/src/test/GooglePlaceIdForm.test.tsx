import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GooglePlaceIdForm } from '../components/GooglePlaceIdForm'
import { createApiClient } from '../lib/api'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeClient() {
  return createApiClient({ baseUrl: 'http://api.test', token: 'tok' })
}

function renderForm() {
  return render(
    <GooglePlaceIdForm client={makeClient()} merchantId="m1" currentPlaceId={null} />,
  )
}

describe('GooglePlaceIdForm', () => {
  it('requires a Place ID before submitting', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/enter a google place id/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a missing route as not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'Route not found' }, 404))),
    )
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/place id for m1/i), 'ChIJ2')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(
      await screen.findByText(/place id assignment is not available yet/i),
    ).toBeInTheDocument()
  })

  it('confirms a successful save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ merchant_id: 'm1', google_place_id: 'ChIJ2' })),
      ),
    )
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/place id for m1/i), 'ChIJ2')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/google place id saved/i)).toBeInTheDocument()
  })
})
