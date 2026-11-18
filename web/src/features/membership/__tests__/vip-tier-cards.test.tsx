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
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { VipTierCards } from '../components/vip-tier-cards'
import type { MembershipInfo } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children?: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

const visitor: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 400_000_000,
  single_threshold_quota: 0,
  vip_price_rate: 0.85,
  standard_concurrency: 10,
  vip_concurrency: 100,
  signed_in: false,
}

function tierCards() {
  return screen.getAllByRole('article')
}

describe('VIP tier cards', () => {
  it('lists the same benefits in both cards so their rows line up', () => {
    render(<VipTierCards info={visitor} />)

    const [standard, vip] = tierCards()
    const standardRows = within(standard).getAllByRole('listitem')
    const vipRows = within(vip).getAllByRole('listitem')
    expect(standardRows).toHaveLength(vipRows.length)
    expect(within(standard).getByText('Shared lines')).toBeInTheDocument()
    expect(
      within(vip).getByText('Dedicated lines, served first')
    ).toBeInTheDocument()
  })

  it('offers a visitor a free account on the standard card', () => {
    render(<VipTierCards info={visitor} />)

    const [standard] = tierCards()
    expect(
      within(standard).getByRole('link', { name: 'Create a free account' })
    ).toHaveAttribute('href', '/sign-up')
  })

  it('marks the standard card as the current tier of a signed-in standard member', () => {
    render(
      <VipTierCards info={{ ...visitor, signed_in: true, is_vip: false }} />
    )

    const [standard, vip] = tierCards()
    expect(within(standard).getByText('Your current tier')).toBeInTheDocument()
    expect(
      within(vip).getByRole('link', { name: /Top up to become VIP/ })
    ).toHaveAttribute('href', '/wallet')
  })

  it('shows the saving on the VIP card', () => {
    render(<VipTierCards info={visitor} />)

    const [, vip] = tierCards()
    expect(within(vip).getByText('-15%')).toBeInTheDocument()
  })
})
