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
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { Showcase } from '../components/sections/showcase'
import { SHOWCASE_VIDEOS } from '../lib/video-home'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

function mockHomeShowcase(value: string) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: value },
  })
}

function renderShowcase() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Showcase />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockHomeShowcase('')
})

function clipTitles(): string[] {
  return within(screen.getByRole('list'))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent ?? '')
}

describe('home showcase', () => {
  it('lists every clip when no category is chosen', () => {
    renderShowcase()

    expect(clipTitles()).toEqual(SHOWCASE_VIDEOS.map((video) => video.title))
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('keeps only the chosen category when a category filter is pressed', async () => {
    const user = userEvent.setup()
    renderShowcase()

    await user.click(screen.getByRole('button', { name: 'Product ads' }))

    expect(clipTitles()).toEqual(['Supercar in the rain', 'Mechanical watch'])
    expect(screen.getByRole('button', { name: 'Product ads' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('keeps prompts off the grid until a clip is opened', async () => {
    const user = userEvent.setup()
    renderShowcase()
    const prompt = SHOWCASE_VIDEOS[1].prompt

    expect(screen.queryByText(prompt)).toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Play Mechanical watch with sound' })
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Mechanical watch',
    })
    expect(within(dialog).getByText(prompt)).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'Generate with it' })
    ).toHaveAttribute('href', '/sign-up')
  })

  it('copies the full prompt of a clip when its copy button is pressed', async () => {
    const user = userEvent.setup()
    renderShowcase()

    await user.click(
      screen.getByRole('button', { name: 'Play Mechanical watch with sound' })
    )
    await user.click(
      await screen.findByRole('button', {
        name: 'Copy prompt: Mechanical watch',
      })
    )

    // user-event installs a clipboard stub for the session.
    expect(await navigator.clipboard.readText()).toBe(SHOWCASE_VIDEOS[1].prompt)
  })

  it('shows a labelled placeholder instead of video while no media host is set', () => {
    renderShowcase()

    expect(
      screen.getByRole('img', { name: 'Video preview: Crystal cave' })
    ).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  it('shows the admin clips with their own categories instead of the examples', async () => {
    const user = userEvent.setup()
    mockHomeShowcase(
      JSON.stringify({
        showcase: [
          {
            title: 'City chase',
            category: 'Action',
            prompt: 'A chase through a market',
            video: '/home-media/0123456789abcdef0123456789abcdef.mp4',
          },
          {
            title: 'Pastry ad',
            category: 'Food',
            prompt: 'A baker glazes a tart',
            video: '/home-media/fedcba9876543210fedcba9876543210.mp4',
          },
          { title: 'Draft without video', category: 'Action' },
        ],
      })
    )
    renderShowcase()

    await screen.findByRole('heading', { level: 3, name: 'City chase' })
    expect(clipTitles()).toEqual(['City chase', 'Pastry ad'])
    await user.click(screen.getByRole('button', { name: 'Food' }))
    expect(clipTitles()).toEqual(['Pastry ad'])
  })
})
