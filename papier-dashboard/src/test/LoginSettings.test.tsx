import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginSettings } from '../components/LoginSettings'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginSettings', () => {
  it('reports a successful connection via /health', async () => {
    const fetchMock = vi.fn((..._args: unknown[]) =>
      Promise.resolve(jsonResponse({ status: 'ok' })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(
      <LoginSettings
        initial={{ baseUrl: 'http://api.test', token: 'tok' }}
        onSave={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /test connection/i }))

    expect(await screen.findByText(/connection ok/i)).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/health')
    expect((init.headers as Headers).get('X-Api-Token')).toBeNull()
  })

  it('requires a token before continuing and then saves trimmed settings', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()

    render(
      <LoginSettings
        initial={{ baseUrl: 'http://api.test/', token: '' }}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/enter an api token/i)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/api token/i), '  abc123  ')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: 'http://api.test',
      token: 'abc123',
    })
  })
})
