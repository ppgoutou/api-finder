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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { generateImages } from '../api'
import { ImageComposer } from '../components/image-composer'
import { ImageWorksList } from '../components/image-works-list'
import { STUDIO_IMAGE_WORKS_KEY } from '../constants'

const studioBalance = vi.hoisted(() => ({
  shortfallUSD: null as number | null,
}))

vi.mock('../api', () => ({
  uploadVideoAsset: vi.fn(),
  generateImages: vi.fn(),
}))

// The public pricing list names models; these tests show model IDs as-is.
vi.mock('@/features/pricing/hooks', () => ({
  useModelDisplayName: () => (name: string) => name,
}))
vi.mock('../hooks/use-studio-models', () => ({
  useStudioImageModels: () => [
    { name: 'seedream-5-0-flash', group: 'Seedream' },
    { name: 'seedream-5.0-pro', group: 'Seedream' },
  ],
}))

vi.mock('../hooks/use-studio-price', () => ({
  useStudioImagePrice: () => ({ label: '¥0.19', costUSD: 0.03 }),
}))

vi.mock('../hooks/use-studio-balance', () => ({
  useStudioBalance: () => ({
    shortfallUSD: studioBalance.shortfallUSD,
    refresh: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

const generateMock = vi.mocked(generateImages)

beforeEach(() => {
  studioBalance.shortfallUSD = null
  window.localStorage.clear()
  useStudioImageWorks.setState({ works: [] })
  generateMock.mockResolvedValue([
    'https://cdn.example/a.png',
    'https://cdn.example/b.png',
  ])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ImageComposer', () => {
  it('generates the requested number of images with the picked model and size, then lists them', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ImageComposer initialModel='seedream-5.0-pro' />
        <ImageWorksList />
      </>
    )

    await user.click(screen.getByRole('button', { name: /^Size:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /16:9/ }))
    await user.click(screen.getByRole('button', { name: /^Images:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: '2 images' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Image prompt' }),
      'a red fox'
    )
    await user.click(screen.getByRole('button', { name: 'Generate image' }))

    await waitFor(() => expect(generateMock).toHaveBeenCalledOnce())
    expect(generateMock).toHaveBeenCalledWith({
      model: 'seedream-5.0-pro',
      prompt: 'a red fox',
      size: '2560x1440',
      n: 2,
      response_format: 'url',
    })
    expect(
      await screen.findAllByRole('img', { name: 'a red fox' })
    ).toHaveLength(2)
  })

  it('does not submit without a prompt', async () => {
    const user = userEvent.setup()
    render(<ImageComposer />)

    await user.click(screen.getByRole('button', { name: 'Generate image' }))

    expect(generateMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Model: seedream-5-0-flash' })
    ).toBeInTheDocument()
  })

  it('blocks generation and links to top-up when the wallet falls short', async () => {
    studioBalance.shortfallUSD = 0.2
    const user = userEvent.setup()
    render(<ImageComposer />)
    await user.type(
      screen.getByRole('textbox', { name: 'Image prompt' }),
      'a red fox{Enter}'
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance')
    expect(screen.getByRole('link', { name: 'Go to top up' })).toHaveAttribute(
      'href',
      '/wallet'
    )
    expect(
      screen.getByRole('button', { name: 'Generate image' })
    ).toBeDisabled()
    expect(generateMock).not.toHaveBeenCalled()
  })
})

describe('ImageWorksList', () => {
  const work = {
    id: 'img_1',
    url: 'https://cdn.example/fox.png',
    prompt: 'a red fox',
    model: 'seedream-5.0-pro',
    size: '2048x2048',
    createdAt: 1_790_000_000,
  }

  it('removes an image from the list and storage after the delete is confirmed', async () => {
    useStudioImageWorks.setState({ works: [work] })
    const user = userEvent.setup()
    render(<ImageWorksList />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      })
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('img', { name: 'a red fox' })
      ).not.toBeInTheDocument()
    )
    expect(useStudioImageWorks.getState().works).toEqual([])
    expect(window.localStorage.getItem(STUDIO_IMAGE_WORKS_KEY)).toBe('[]')
  })

  it('keeps the image when the delete is cancelled', async () => {
    useStudioImageWorks.setState({ works: [work] })
    const user = userEvent.setup()
    render(<ImageWorksList />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('img', { name: 'a red fox' })).toBeInTheDocument()
    expect(useStudioImageWorks.getState().works).toHaveLength(1)
  })
})
