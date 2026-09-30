import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TerminalsTable } from '../components/TerminalsTable'
import type { Terminal } from '../lib/api'

const terminal: Terminal = {
  terminal_id: 'TERM1',
  label: 'Front',
  active: true,
  last_seen: null,
  scan_count: 3,
  last_scan_at: null,
  static_review_url: 'https://search.google.com/local/writereview?placeid=ChIJ1',
}

describe('TerminalsTable', () => {
  it('shows an actionable empty state when no terminals are paired', () => {
    render(<TerminalsTable terminals={[]} />)
    expect(screen.getByText(/no terminals paired yet/i)).toBeInTheDocument()
  })

  it('renders a row and invokes onManage', async () => {
    const onManage = vi.fn()
    const user = userEvent.setup()
    render(<TerminalsTable terminals={[terminal]} onManage={onManage} />)

    expect(screen.getByText('Front')).toBeInTheDocument()
    expect(screen.getByText('TERM1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute(
      'href',
      'https://search.google.com/local/writereview?placeid=ChIJ1',
    )

    await user.click(screen.getByRole('button', { name: /manage/i }))
    expect(onManage).toHaveBeenCalledWith(terminal)
  })
})
