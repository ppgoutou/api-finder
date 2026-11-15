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
import { describe, expect, it } from 'vitest'

import { CategoryComparison } from '../components/category-comparison'

const COMPARISON = '- **Doubao**: most stable\n- **Dreamina**: overseas route'

describe('category comparison', () => {
  it('shows the comparison when the link is clicked', async () => {
    const user = userEvent.setup()
    render(
      <CategoryComparison categoryName='Seedance 2.0' comparison={COMPARISON} />
    )

    const trigger = screen.getByRole('button', { name: 'Model comparison' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Doubao')).not.toBeInTheDocument()
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      await screen.findByText('Seedance 2.0 model comparison')
    ).toBeInTheDocument()
    expect(screen.getByText('Doubao').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows the comparison when the pointer rests on the link', async () => {
    const user = userEvent.setup()
    render(
      <CategoryComparison categoryName='Seedance 2.0' comparison={COMPARISON} />
    )

    await user.hover(screen.getByRole('button', { name: 'Model comparison' }))

    expect(
      await screen.findByText('Seedance 2.0 model comparison')
    ).toBeInTheDocument()
  })
})
