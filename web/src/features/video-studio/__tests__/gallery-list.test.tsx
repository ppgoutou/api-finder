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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { GalleryList } from '../components/gallery-list'

function mockStudioGallery(value: string) {
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
  mockStudioGallery('')
})

describe('GalleryList', () => {
  it('shows an empty state when the studio gallery is not configured', async () => {
    renderGallery()

    expect(await screen.findByText('No gallery works yet')).toBeVisible()
    expect(
      screen.getByText(
        'Example videos appear here once the studio gallery is configured in site settings.'
      )
    ).toBeVisible()
  })

  it('opens the details dialog with prompt and parameters when the prompt button is clicked', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Mechanical watch',
            prompt: 'a stainless steel watch on black',
            spec: 'seedance-2.0 · 16:9 · 720p · 5s',
            poster: 'https://cdn.example/watch.jpg',
            video: 'https://cdn.example/watch.mp4',
          },
        ],
      })
    )
    renderGallery()
    const user = userEvent.setup()

    expect(
      screen.queryByText('a stainless steel watch on black')
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole('button', {
        name: 'View prompt: Mechanical watch',
      })
    )

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('a stainless steel watch on black')
    ).toBeVisible()
    expect(within(dialog).getByText('720p')).toBeVisible()
    expect(within(dialog).getByText('16:9')).toBeVisible()
    expect(within(dialog).getByText('5s')).toBeVisible()
    expect(
      within(dialog).getAllByRole('button', { name: 'Use prompt' })
    ).toHaveLength(1)
  })

  it('hands prompt and parsed parameters to onReuse when Use prompt is clicked', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Mechanical watch',
            category: 'Product ads',
            prompt: 'a stainless steel watch on black',
            spec: 'seedance-2.0 · 720p · 5s',
            poster: 'https://cdn.example/watch.jpg',
            video: 'https://cdn.example/watch.mp4',
          },
        ],
      })
    )
    const onReuse = renderGallery()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', {
        name: 'View details: Mechanical watch',
      })
    )
    await user.click(await screen.findByRole('button', { name: 'Use prompt' }))

    expect(onReuse).toHaveBeenCalledOnce()
    expect(onReuse.mock.calls[0][0]).toMatchObject({
      mode: 'reference',
      prompt: 'a stainless steel watch on black',
      model: 'seedance-2.0',
      resolution: '720p',
      seconds: 5,
    })
  })

  it('lists configured studio gallery clips with cover images', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
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
    renderGallery()

    expect(
      await screen.findByRole('img', { name: 'Admin clip' })
    ).toHaveAttribute('src', 'https://cdn.example/admin.jpg')
  })

  it('shows the model on the clip and leaves the other parameters for the details dialog', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Rain car',
            prompt: 'a silver car in the rain',
            spec: 'Seedance 2.5 · 16:9 · 720p · 19s',
            poster: 'https://cdn.example/car.jpg',
          },
        ],
      })
    )
    renderGallery()

    expect(await screen.findByText('Seedance 2.5')).toBeVisible()
    expect(screen.getByText('Rain car')).toBeVisible()
    expect(screen.queryByText('720p')).not.toBeInTheDocument()
    expect(screen.queryByText('19s')).not.toBeInTheDocument()
    expect(
      screen.queryByText('a silver car in the rain')
    ).not.toBeInTheDocument()
  })

  it('labels a work without a title as untitled instead of showing its parameters twice', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            prompt: 'a campus walk',
            spec: 'Seedance 2.5 · 9:16 · 720p · 10s',
            poster: 'https://cdn.example/walk.jpg',
          },
        ],
      })
    )
    renderGallery()

    expect(await screen.findByText('Untitled work')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'View prompt: Seedance 2.5 · 9:16 · 720p · 10s',
      })
    ).toBeVisible()
  })

  it('filters gallery cards by category', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
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

  it('requests only the cover in the grid and loads the video when the tile is clicked', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Rain car',
            spec: 'Wan 3.0 · 16:9 · 720p · 5s',
            poster: 'https://cdn.example/car.jpg',
            video: 'https://cdn.example/car.mp4',
          },
        ],
      })
    )
    const user = userEvent.setup()
    renderGallery()

    const tile = await screen.findByRole('button', {
      name: 'View details: Rain car',
    })
    expect(document.querySelector('video')).toBeNull()

    await user.click(tile)

    await screen.findByRole('dialog')
    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      'https://cdn.example/car.mp4'
    )
  })

  it('shows a placeholder and no video when a work has no cover', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'No cover yet',
            spec: 'Wan 3.0 · 16:9 · 720p · 5s',
            video: 'https://cdn.example/plain.mp4',
          },
        ],
      })
    )
    renderGallery()

    expect(
      await screen.findByRole('button', { name: 'View details: No cover yet' })
    ).toBeVisible()
    expect(document.querySelector('video')).toBeNull()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows a portrait cover whole and a landscape cover filling the frame', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          {
            title: 'Tall',
            spec: 'Wan 3.0 · 9:16 · 720p · 5s',
            poster: 'https://cdn.example/tall.jpg',
          },
          {
            title: 'Wide',
            spec: 'Wan 3.0 · 16:9 · 720p · 5s',
            poster: 'https://cdn.example/wide.jpg',
          },
        ],
      })
    )
    renderGallery()

    expect(await screen.findByRole('img', { name: 'Tall' })).toHaveClass(
      'object-contain'
    )
    expect(screen.getByRole('img', { name: 'Wide' })).toHaveClass(
      'object-cover'
    )
  })

  it('sorts works into a section per model and narrows to one model when its filter is pressed', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [
          { title: 'Car', spec: 'Seedance 2.5 · 16:9', poster: '/a.jpg' },
          { title: 'Fish', spec: 'Wan 3.0 · 16:9', poster: '/b.jpg' },
          { title: 'Walk', spec: 'Seedance 2.5 · 9:16', poster: '/c.jpg' },
          { title: 'Loose', prompt: 'no spec', poster: '/d.jpg' },
        ],
      })
    )
    const user = userEvent.setup()
    renderGallery()

    expect(
      await screen.findByRole('heading', { name: /^Seedance 2\.5/ })
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: /^Wan 3\.0/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: /^Other models/ })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /^Wan 3\.0/ }))

    expect(screen.getByText('Fish')).toBeVisible()
    expect(screen.queryByText('Car')).not.toBeInTheDocument()
    expect(screen.queryByText('Loose')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('leaves out the model filter when every work uses one model', async () => {
    mockStudioGallery(
      JSON.stringify({
        items: [{ title: 'Car', spec: 'Wan 3.0 · 16:9', poster: '/a.jpg' }],
      })
    )
    renderGallery()

    expect(await screen.findByText('Car')).toBeVisible()
    expect(
      screen.queryByRole('group', { name: 'Filter by model' })
    ).not.toBeInTheDocument()
  })
})
