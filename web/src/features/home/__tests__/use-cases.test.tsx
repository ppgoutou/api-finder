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

import { UseCases } from '../components/sections/use-cases'

describe('UseCases', () => {
  it('links only the partner use cases to PX Show in a new tab, tagged with the placement', () => {
    render(<UseCases />)

    const links = screen.getAllByRole('link', {
      name: /Make it with our partner PX Show/,
    })
    expect(links).toHaveLength(2)
    for (const link of links) {
      const url = new URL(link.getAttribute('href') ?? '')
      expect(url.origin).toBe('https://www.pxshow.com')
      expect(url.searchParams.get('utm_source')).toBe('api-finder')
      expect(url.searchParams.get('utm_medium')).toBe('home-use-cases')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(
      links.map((link) => link.closest('li')?.querySelector('h3')?.textContent)
    ).toEqual(['AI short dramas', 'E-commerce product images'])
  })
})
