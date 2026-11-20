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

import { MembershipPriceCard } from '../components/membership-price-card'
import type { MembershipInfo } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children?: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

// The compare button reads membership through React Query; the card is
// tested on its own.
vi.mock('../hooks/use-membership', () => ({
  useMembership: () => ({ data: undefined }),
}))

const visitor: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 400_000_000,
  single_threshold_quota: 0,
  vip_price_rate: 0.92,
  standard_concurrency: 10,
  vip_concurrency: 100,
  signed_in: false,
}

function card() {
  return screen.getByRole('region', { name: 'VIP membership' })
}

describe('membership price card', () => {
  it('shows a visitor the saving, the concurrency gain and the dedicated lines', () => {
    render(<MembershipPriceCard info={visitor} />)

    const rows = within(card()).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('-8%')).toBeInTheDocument()
    expect(within(rows[1]).getByText('10×')).toBeInTheDocument()
    expect(
      within(rows[1]).getByText('100 tasks at once, standard is 10')
    ).toBeInTheDocument()
    expect(within(rows[2]).getByText('Dedicated lines')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Served first')).toBeInTheDocument()
  })

  it('tells a visitor how to qualify and links to the VIP page', () => {
    render(<MembershipPriceCard info={visitor} />)

    expect(
      within(card()).getByText('Unlocked by top-ups · no monthly fee')
    ).toBeInTheDocument()
    expect(
      within(card()).getByText(/to upgrade automatically/)
    ).toBeInTheDocument()
    expect(
      within(card()).getByRole('link', { name: /Learn about VIP/ })
    ).toHaveAttribute('href', '/vip')
  })

  it('tells a VIP member the prices below are already theirs', () => {
    render(<MembershipPriceCard info={{ ...visitor, is_vip: true }} />)

    expect(within(card()).getByText('You are VIP')).toBeInTheDocument()
    expect(
      within(card()).getByText(
        'The prices below already include your 8% saving.'
      )
    ).toBeInTheDocument()
    expect(
      within(card()).getByRole('link', { name: /View my benefits/ })
    ).toHaveAttribute('href', '/vip')
    expect(
      within(card()).queryByText('Unlocked by top-ups · no monthly fee')
    ).not.toBeInTheDocument()
  })

  it('drops the concurrency row when either concurrency figure is missing', () => {
    render(
      <MembershipPriceCard info={{ ...visitor, standard_concurrency: 0 }} />
    )

    expect(within(card()).getAllByRole('listitem')).toHaveLength(2)
    expect(within(card()).queryByText('10×')).not.toBeInTheDocument()
  })

  it('renders nothing while the VIP program is off', () => {
    const { container } = render(
      <MembershipPriceCard info={{ ...visitor, enabled: false }} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
