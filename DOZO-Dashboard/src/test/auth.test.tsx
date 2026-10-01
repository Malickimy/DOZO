import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../Dashboard'
import { AuthScreen } from '../components/AuthScreen'
import { createApiClient } from '../lib/api'
import { isValidNip } from '../lib/validation'
import { jsonResponse } from './helpers'

const settings = { baseUrl: 'http://api.test', token: '' }

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAuth() {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const onOperatorSave = vi.fn()
  render(<AuthScreen initial={settings} onOperatorSave={onOperatorSave} />)
  return { fetchMock, onOperatorSave }
}

describe('AuthScreen', () => {
  it('validates sign-in and explains that account login awaits the API', async () => {
    const { fetchMock } = renderAuth()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('Email'), 'owner@bistro.pl')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByText(/POST \/api\/auth\/login/)).toBeInTheDocument()
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks the NIP checksum and matching passwords on sign-up', async () => {
    window.history.replaceState(null, '', '#rejestracja')
    const { fetchMock } = renderAuth()
    const user = userEvent.setup()

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Company name'), 'Bistro na Rogu')
    await user.type(screen.getByLabelText('NIP'), '123-456-78-90')
    await user.type(screen.getByLabelText('Email for invoices and sign-in'), 'owner@bistro.pl')
    await user.type(screen.getByLabelText('Password'), 'long-enough')
    await user.type(screen.getByLabelText('Repeat password'), 'different1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText(/valid Polish tax ID/)).toBeInTheDocument()
    expect(screen.getByText('The passwords don’t match.')).toBeInTheDocument()
    expect(screen.getByText('Accept the terms to create an account.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('NIP'))
    await user.type(screen.getByLabelText('NIP'), '526-104-08-28')
    await user.clear(screen.getByLabelText('Repeat password'))
    await user.type(screen.getByLabelText('Repeat password'), 'long-enough')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText(/POST \/api\/auth\/register/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('switches to the operator token form and updates the URL hash', async () => {
    renderAuth()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Use an operator token' }))

    expect(screen.getByRole('heading', { name: 'Operator sign-in' })).toBeInTheDocument()
    expect(screen.getByLabelText(/api token/i)).toBeInTheDocument()
    expect(window.location.hash).toBe('#operator')
  })

  it('opens the password reset form from sign-in', async () => {
    renderAuth()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    await user.type(screen.getByLabelText('Email'), 'owner@bistro.pl')
    await user.click(screen.getByRole('button', { name: 'Send link' }))

    expect(screen.getByText(/password-reset/)).toBeInTheDocument()
    expect(window.location.hash).toBe('#reset-hasla')
  })
})

describe('isValidNip', () => {
  it('accepts valid checksums with separators and rejects the rest', () => {
    expect(isValidNip('526-104-08-28')).toBe(true)
    expect(isValidNip('PL 1234563218')).toBe(true)
    expect(isValidNip('1234567890')).toBe(false)
    expect(isValidNip('12345')).toBe(false)
  })
})

describe('Dashboard sign-out', () => {
  it('calls onLogout from the sidebar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([]))),
    )
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(
      <Dashboard
        client={createApiClient({ baseUrl: 'http://api.test', token: 'tok' })}
        settings={{ baseUrl: 'http://api.test', token: 'tok' }}
        onOpenSettings={vi.fn()}
        onLogout={onLogout}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
