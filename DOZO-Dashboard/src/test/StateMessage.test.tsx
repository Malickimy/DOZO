import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  Empty,
  ErrorState,
  Loading,
  NotAvailable,
} from '../components/StateMessage'

describe('StateMessage', () => {
  it('announces the loading label', () => {
    render(<Loading label="Loading summary…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading summary…')
  })

  it('shows a friendly error plus the message and retries', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ErrorState error={new Error('Network down')} onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.')
    expect(screen.getByText('Network down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omits the retry button when no handler is given', () => {
    render(<ErrorState error={new Error('boom')} />)
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('names the unavailable resource', () => {
    render(<NotAvailable label="The scan log" />)
    expect(screen.getByText('The scan log is not available yet.')).toBeInTheDocument()
  })

  it('renders the empty-state copy verbatim', () => {
    render(<Empty>Nothing here yet.</Empty>)
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
  })
})
