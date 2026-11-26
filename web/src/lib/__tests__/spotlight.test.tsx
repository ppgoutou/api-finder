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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { trackSpotlight } from '../spotlight'

describe('trackSpotlight', () => {
  it('places the light of every card at the pointer, relative to that card', () => {
    render(
      <ul data-testid='group' onPointerMove={trackSpotlight}>
        <li className='spotlight-card'>First</li>
        <li className='spotlight-card'>Second</li>
        <li>Plain</li>
      </ul>
    )
    const [first, second, plain] = screen.getAllByRole('listitem')
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 100)
    )
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(220, 0, 200, 100)
    )

    fireEvent.pointerMove(screen.getByTestId('group'), {
      clientX: 250,
      clientY: 40,
    })

    expect(first.style.getPropertyValue('--spot-x')).toBe('250px')
    expect(first.style.getPropertyValue('--spot-y')).toBe('40px')
    expect(second.style.getPropertyValue('--spot-x')).toBe('30px')
    expect(second.style.getPropertyValue('--spot-y')).toBe('40px')
    expect(plain.style.getPropertyValue('--spot-x')).toBe('')
  })
})
