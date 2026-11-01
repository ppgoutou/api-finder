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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VideoStudio } from '..'

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}))

vi.mock('../components/composer', () => ({ Composer: () => null }))
vi.mock('../components/image-composer', () => ({ ImageComposer: () => null }))
vi.mock('../components/works-list', () => ({ WorksList: () => null }))
vi.mock('../components/image-works-list', () => ({
  ImageWorksList: () => null,
}))

describe('video studio layout', () => {
  it('scrolls the page body inside the clipped main area when works overflow', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VideoStudio />
      </QueryClientProvider>
    )

    const main = screen.getByRole('main')
    const body = main.firstElementChild
    expect(main).toHaveClass('overflow-hidden')
    expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')
    expect(body).toContainElement(
      screen.getByRole('heading', { name: 'My videos' })
    )
  })
})
