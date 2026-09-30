import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MerchantPicker } from '../components/MerchantPicker'
import type { Merchant } from '../lib/api'

const merchants: Merchant[] = [
  { merchant_id: 'm1', google_place_id: 'ChIJ1', created_at: '2026-01-01T00:00:00.000Z' },
  { merchant_id: 'm2', google_place_id: null, created_at: '2026-01-01T00:00:00.000Z' },
]

describe('MerchantPicker', () => {
  it('shows a loading state', () => {
    render(<MerchantPicker merchants={[]} value="" onChange={vi.fn()} loading />)
    expect(screen.getByText(/loading merchants/i)).toBeInTheDocument()
  })

  it('lists merchants and flags missing Place IDs', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MerchantPicker merchants={merchants} value="m1" onChange={onChange} />)

    expect(screen.getByRole('option', { name: /m2 \(no place id\)/i })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox'), 'm2')
    expect(onChange).toHaveBeenCalledWith('m2')
  })

  it('falls back to a manual merchant ID input when the list is unavailable', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MerchantPicker merchants={[]} value="" onChange={onChange} unavailable />)

    expect(screen.getByText(/merchant list unavailable/i)).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('demo-merchant'), 'm9')
    expect(onChange).toHaveBeenCalled()
  })
})
