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
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SHOWCASE_VIDEOS } from '@/features/home/lib/video-home'
import { api } from '@/lib/api'

import { GalleryList } from '../components/gallery-list'

function mockHomeShowcase(value: string) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: value },
  })
}

function renderGallery(onReuse = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <GalleryList onReuse={onReuse} />
    </QueryClientProvider>
  )
  return onReuse
}

beforeEach(() => {
  mockHomeShowcase('')
})

describe('GalleryList', () => {
  it('lists built-in showcase clips when the site showcase is empty', async () => {
    renderGallery()

    expect(
      await screen.findByRole('button', {
        name: `Use this work: ${SHOWCASE_VIDEOS[0].title}`,
      })
    ).toBeVisible()
    expect(screen.getByText(SHOWCASE_VIDEOS[0].prompt)).toBeVisible()
  })

  it('hands prompt and parsed parameters to onReuse when Use this work is clicked', async () => {
    const onReuse = renderGallery()
    const user = userEvent.setup()
    const clip = SHOWCASE_VIDEOS[1]

    await user.click(
      await screen.findByRole('button', {
        name: `Use this work: ${clip.title}`,
      })
    )

    expect(onReuse).toHaveBeenCalledOnce()
    expect(onReuse.mock.calls[0][0]).toMatchObject({
      mode: 'reference',
      prompt: clip.prompt,
      model: 'seedance-2.0',
      resolution: '720p',
      seconds: 5,
    })
  })

  it('prefers admin showcase clips that carry a video or prompt', async () => {
    mockHomeShowcase(
      JSON.stringify({
        hero: {},
        image_to_video: {},
        showcase: [
          {
            title: 'Admin clip',
            category: 'Product',
            prompt: 'admin prompt for reuse',
            spec: 'custom-model · 1080p · 8s',
            video: 'https://cdn.example/admin.mp4',
            poster: 'https://cdn.example/admin.jpg',
          },
        ],
      })
    )
    const onReuse = renderGallery()
    const user = userEvent.setup()

    expect(
      await screen.findByRole('img', { name: 'Admin clip' })
    ).toHaveAttribute('src', 'https://cdn.example/admin.jpg')
    await user.click(
      await screen.findByRole('button', { name: 'Use this work: Admin clip' })
    )

    expect(onReuse).toHaveBeenCalledOnce()
    expect(onReuse.mock.calls[0][0]).toMatchObject({
      prompt: 'admin prompt for reuse',
      model: 'custom-model',
      resolution: '1080p',
      seconds: 8,
    })
    expect(screen.queryByText(SHOWCASE_VIDEOS[0].title)).not.toBeInTheDocument()
  })

  it('filters gallery cards by category', async () => {
    mockHomeShowcase(
      JSON.stringify({
        hero: {},
        image_to_video: {},
        showcase: [
          {
            title: 'Rain car',
            category: 'Product ads',
            prompt: 'a silver car in the rain',
            spec: 'seedance-2.0 · 720p · 5s',
            poster: 'https://cdn.example/car.jpg',
          },
          {
            title: 'Crystal cave',
            category: 'Fantasy',
            prompt: 'a glowing crystal cave',
            spec: 'seedance-2.0 · 720p · 5s',
            poster: 'https://cdn.example/cave.jpg',
          },
        ],
      })
    )
    const user = userEvent.setup()
    renderGallery()

    expect(await screen.findByText('Rain car')).toBeVisible()
    expect(screen.getByText('Crystal cave')).toBeVisible()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await user.click(screen.getByRole('button', { name: 'Fantasy' }))

    expect(screen.getByText('Crystal cave')).toBeVisible()
    expect(screen.queryByText('Rain car')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fantasy' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
