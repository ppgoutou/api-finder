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
import { describe, expect, it } from 'vitest'

import { RollingPrice } from '../components/rolling-price'

function shownDigits(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-digit]')]
}

describe('rolling price', () => {
  it('keeps the price itself as its text and hides the rolling digits', () => {
    const { container } = render(<RollingPrice value='$0.056' />)

    expect(container).toHaveTextContent(/^\$0\.056$/)
    expect(screen.getByText('$0.056')).toHaveClass('sr-only')
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('stops each digit column on its own digit after the price changes', () => {
    const { container, rerender } = render(<RollingPrice value='$0.06' />)

    rerender(<RollingPrice value='$0.056' />)

    const columns = shownDigits(container)
    expect(columns.map((column) => column.dataset.digit)).toEqual([
      '0',
      '0',
      '5',
      '6',
    ])
    const strip = columns[2].firstElementChild as HTMLElement
    expect(strip.style.getPropertyValue('--price-digit-offset')).toBe('-50%')
  })

  it('starts each digit a little after the one to its left', () => {
    const { container } = render(<RollingPrice value='¥0.383' />)

    const delays = shownDigits(container).map(
      (column) =>
        (column.firstElementChild as HTMLElement).style.transitionDelay
    )
    expect(delays).toEqual(['0ms', '35ms', '70ms', '105ms'])
  })
})
