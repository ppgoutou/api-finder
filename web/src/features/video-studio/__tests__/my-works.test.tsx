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
import { describe, expect, it, vi } from 'vitest'

import { MyWorks } from '../my-works'

vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  useNavigate: () => vi.fn(),
}))
vi.mock('../components/works-list', () => ({ WorksList: () => null }))
vi.mock('../components/image-works-list', () => ({
  ImageWorksList: () => null,
}))
vi.mock('../hooks/use-expiring-works', () => ({
  useExpiringWorks: () => ({ videos: 0, images: 0, total: 0 }),
}))

describe('MyWorks', () => {
  it('tells how long videos and images are kept, each with its own period', () => {
    render(<MyWorks />)

    expect(
      screen.getByText(/kept for 15 days and images for 7 days/)
    ).toBeInTheDocument()
  })
})
