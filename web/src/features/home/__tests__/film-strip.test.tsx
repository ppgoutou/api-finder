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
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { FilmStrip } from '../components/sections/film-strip'

function mockStudioGallery(value: string) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: {
      success: true,
      data: url === '/api/studio_gallery' ? value : '',
    },
  }))
}

function renderFilmStrip() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <FilmStrip />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

const WIDE = '/home-media/0123456789abcdef0123456789abcdef'
const CLASSIC = '/home-media/1123456789abcdef0123456789abcdef'
const TALL = '/home-media/2123456789abcdef0123456789abcdef'

describe('home film strip', () => {
  it('renders nothing when the gallery has no landscape work', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Vertical vlog',
            spec: 'Seedance 2.5 · 9:16 · 720p · 15s',
            video: `${TALL}.mp4`,
            poster: `${TALL}.jpg`,
          },
        ],
      })
    )
    renderFilmStrip()

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('film-strip')).toBeNull()
  })

  it('shows only landscape gallery works, twice each and hidden from assistive technology', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Dragon rescue',
            spec: 'Seedance 2.5 · 16:9 · 1080p · 30s',
            video: `${WIDE}.mp4`,
            poster: `${WIDE}.jpg`,
          },
          {
            title: 'Vertical vlog',
            spec: 'Seedance 2.5 · 9:16 · 720p · 15s',
            video: `${TALL}.mp4`,
            poster: `${TALL}.jpg`,
          },
          {
            title: 'Music video',
            spec: 'Seedance 2.5 · 4:3 · 720p · 30s',
            video: `${CLASSIC}.mp4`,
          },
          { title: 'No ratio', spec: 'Seedance 2.5', poster: `${WIDE}.jpg` },
        ],
      })
    )
    renderFilmStrip()

    const strip = await screen.findByTestId('film-strip')
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(
      [...strip.querySelectorAll('li')].map((item) => item.textContent)
    ).toEqual(['Dragon rescue', 'Music video', 'Dragon rescue', 'Music video'])
    // A poster is used when set; otherwise the clip's first frame.
    expect(strip.querySelectorAll('img')[0]).toHaveAttribute(
      'src',
      `${WIDE}.jpg`
    )
    expect(strip.querySelectorAll('video')[0]).toHaveAttribute(
      'src',
      `${CLASSIC}.mp4#t=0.5`
    )
  })
})
