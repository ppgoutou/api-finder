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
import { describe, expect, it } from 'vitest'

import { DesignSystem } from '..'
import { BUTTON_SIZES, BUTTON_VARIANTS, CONSOLE_TYPE } from '../tokens'

describe('design system page', () => {
  it('lists every console type token by name', () => {
    render(<DesignSystem />)

    for (const token of CONSOLE_TYPE) {
      expect(screen.getByText(token.name)).toBeInTheDocument()
    }
  })

  it('renders each button variant in every size, plus the night row', () => {
    render(<DesignSystem />)

    const buttons = within(
      screen.getByRole('region', { name: 'Buttons' })
    ).getAllByRole('button')
    expect(buttons).toHaveLength(
      (BUTTON_VARIANTS.length + 1) * BUTTON_SIZES.length
    )
  })

  it('shows the VIP and night accent colour tokens', () => {
    render(<DesignSystem />)

    const colors = screen.getByRole('region', { name: 'Colors' })
    expect(within(colors).getByText('vip')).toBeInTheDocument()
    expect(within(colors).getByText('accent-night')).toBeInTheDocument()
  })
})
