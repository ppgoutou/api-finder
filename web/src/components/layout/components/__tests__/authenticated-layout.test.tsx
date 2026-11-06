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

import { AuthenticatedLayout } from '../authenticated-layout'

vi.mock('../app-header', () => ({ AppHeader: () => null }))
vi.mock('../app-sidebar', () => ({ AppSidebar: () => null }))
vi.mock('@/components/command-menu', () => ({ CommandMenu: () => null }))

describe('AuthenticatedLayout', () => {
  it('clips page overflow so focusing an offscreen input cannot scroll the page header away', () => {
    render(
      <AuthenticatedLayout>
        <p>page</p>
      </AuthenticatedLayout>
    )

    const inset = screen.getByRole('main')
    expect(inset).toHaveClass('overflow-clip')
    expect(inset).not.toHaveClass('overflow-hidden')
  })
})
