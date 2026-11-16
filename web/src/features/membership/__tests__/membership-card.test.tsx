/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MembershipCard } from '../components/membership-card'
import type { MembershipInfo } from '../types'

const standard: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 500_000_000,
  single_threshold_quota: 250_000_000,
  vip_price_rate: 0.85,
  signed_in: true,
  is_vip: false,
  paid_total_quota: 100_000_000,
  paid_single_quota: 100_000_000,
}

describe('membership card', () => {
  it('shows a standard user the progress toward VIP and a top-up button', async () => {
    const onTopUp = vi.fn()
    const user = userEvent.setup()
    render(<MembershipCard info={standard} onTopUp={onTopUp} />)

    expect(screen.getByText('Standard member')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Progress toward VIP' })
    ).toHaveAttribute('aria-valuenow', '20')
    expect(screen.getByText('Model prices 15% off')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Top up now' }))
    expect(onTopUp).toHaveBeenCalledOnce()
  })

  it('shows a VIP user the VIP support account instead of progress', () => {
    render(
      <MembershipCard
        info={{ ...standard, is_vip: true, vip_support_telegram: 'vip_desk' }}
      />
    )

    expect(screen.getByText('VIP member')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Telegram/ })).toHaveAttribute(
      'href',
      'https://t.me/vip_desk'
    )
  })

  it('leaves out the price saving when VIP prices are not lower', () => {
    render(<MembershipCard info={{ ...standard, vip_price_rate: 1 }} />)

    expect(screen.queryByText(/% off/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Round-the-clock dedicated support')
    ).toBeInTheDocument()
  })
})
