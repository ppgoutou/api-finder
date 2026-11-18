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
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StudioCost } from '../components/studio-cost'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    className?: string
    title?: string
    'aria-label'?: string
    children?: ReactNode
  }) => (
    <a
      href={props.to}
      className={props.className}
      title={props.title}
      aria-label={props['aria-label']}
    >
      {props.children}
    </a>
  ),
}))

describe('studio cost', () => {
  it('shows the VIP price as a link to top up beside the estimate for a standard member', () => {
    render(
      <StudioCost
        price={{ label: '¥1.00', costUSD: 0.15, vipLabel: '¥0.85' }}
        shortfallUSD={null}
      />
    )

    expect(screen.getByText('¥1.00')).toBeInTheDocument()
    expect(screen.getByText('Estimated fee')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'VIP price ¥0.85, Top up to upgrade' })
    ).toHaveAttribute('href', '/wallet')
  })

  it('shows only the estimate when there is no VIP price to offer', () => {
    render(
      <StudioCost
        price={{ label: '¥0.85', costUSD: 0.12, vipLabel: null }}
        shortfallUSD={null}
      />
    )

    expect(screen.queryByText(/VIP price/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
