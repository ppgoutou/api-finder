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
import { render as renderTree, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getUserTaskLogs } from '@/features/usage-logs/api'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { generateImages } from '../api'
import { ImageComposer } from '../components/image-composer'
import { ImageWorksList } from '../components/image-works-list'

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
    {
      name: 'plugin-image',
      group: 'Plugin',
      plugin: {
        resolutions: ['1K', '2K'],
        ratios: ['1:1', '16:9'],
        maxReferences: 0,
      },
    },
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

vi.mock('@/features/usage-logs/api', () => ({
  getUserTaskLogs: vi.fn(),
  getTaskArtifacts: vi.fn(),
}))

function render(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderTree(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  )
}

const generateMock = vi.mocked(generateImages)

beforeEach(() => {
  studioBalance.shortfallUSD = null
  window.localStorage.clear()
  useStudioImageWorks.setState({ works: [], pending: [] })
  vi.mocked(getUserTaskLogs).mockResolvedValue({
    data: { items: [], total: 0 },
  } as never)
  generateMock.mockResolvedValue([
    { url: 'https://cdn.example/a.png', expiresAt: 1_900_000_000 },
    { url: 'https://cdn.example/b.png' },
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
    expect(
      useStudioImageWorks.getState().works.map((work) => work.expiresAt)
    ).toEqual([1_900_000_000, undefined])
  })

  it('offers the sizes and ratios of a task plugin model and keeps the images that succeed', async () => {
    generateMock
      .mockResolvedValueOnce([{ url: 'https://cdn.example/a.png' }])
      .mockRejectedValueOnce(new Error('busy'))
    const user = userEvent.setup()
    render(<ImageComposer initialModel='plugin-image' />)

    expect(
      screen.queryByRole('button', { name: /^Size:/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('References')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Resolution:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: '2K' }))
    await user.click(screen.getByRole('button', { name: /^Aspect ratio:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: '16:9' }))
    await user.click(screen.getByRole('button', { name: /^Images:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: '2 images' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Image prompt' }),
      'a red fox'
    )
    await user.click(screen.getByRole('button', { name: 'Generate image' }))

    await waitFor(() =>
      expect(useStudioImageWorks.getState().works).toHaveLength(1)
    )
    expect(useStudioImageWorks.getState().works[0].size).toBe('2K 16:9')
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock.mock.calls[0][0]).toMatchObject({
      model: 'plugin-image',
      size: '2K',
      aspect_ratio: '16:9',
      n: 1,
    })
  })

  it('lists the running task while the reply is pending, then the image in its place', async () => {
    const task = {
      task_id: 'task_1',
      action: 'text_to_image',
      console_image: true,
      status: 'IN_PROGRESS',
      submit_time: Math.floor(Date.now() / 1000),
      properties: { origin_model_name: 'plugin-image' },
    }
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [task], total: 1 },
    } as never)
    let reply = (_: { url: string; taskId: string }[]) => {}
    generateMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve
        })
    )
    const user = userEvent.setup()
    render(
      <>
        <ImageComposer initialModel='plugin-image' />
        <ImageWorksList />
      </>
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Image prompt' }),
      'a red fox'
    )
    await user.click(screen.getByRole('button', { name: 'Generate image' }))

    expect(await screen.findByText('Generating')).toBeInTheDocument()
    expect(useStudioImageWorks.getState().pending).toHaveLength(1)
    reply([{ url: 'https://cdn.example/a.png', taskId: 'task_1' }])

    expect(
      await screen.findByRole('img', { name: 'a red fox' })
    ).toBeInTheDocument()
    expect(screen.queryByText('Generating')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await waitFor(() =>
      expect(useStudioImageWorks.getState().pending).toHaveLength(0)
    )
  })

  it('shows a waiting card per image at once and takes the next request meanwhile', async () => {
    generateMock.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <>
        <ImageComposer initialModel='seedream-5.0-pro' />
        <ImageWorksList />
      </>
    )
    await user.click(screen.getByRole('button', { name: /^Images:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: '2 images' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Image prompt' }),
      'a red fox'
    )
    const button = screen.getByRole('button', { name: 'Generate image' })
    await user.click(button)

    expect(await screen.findAllByText('Generating')).toHaveLength(2)
    // A second click right away is the same click.
    expect(button).toBeDisabled()
    await vi.advanceTimersByTimeAsync(2000)
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(await screen.findAllByText('Generating')).toHaveLength(4)
    vi.useRealTimers()
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
