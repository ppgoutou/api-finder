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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getTaskArtifacts, getUserTaskLogs } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { createAppQueryClient } from '@/lib/query-client'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { generateImages } from '../api'
import { ImageWorksList } from '../components/image-works-list'
import { STUDIO_IMAGE_WORKS_KEY } from '../constants'

vi.mock('../api', () => ({
  generateImages: vi.fn(),
  deleteTaskPrompt: vi.fn(),
}))
vi.mock('@/features/usage-logs/api', () => ({
  getUserTaskLogs: vi.fn(),
  getTaskArtifacts: vi.fn(),
}))
vi.mock('@/features/pricing/hooks', () => ({
  useModelDisplayName: () => (name: string) => name,
}))

const NOW = Math.floor(Date.now() / 1000)

const work = {
  id: 'img_1',
  url: 'https://cdn.example/fox.png',
  prompt: 'a red fox',
  model: 'seedream-5.0-pro',
  size: '2048x2048',
  createdAt: NOW - 60,
}

function imageTask(fields: Partial<TaskLog> = {}): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: '',
    task_id: 'task_1',
    action: 'text_to_image',
    console_image: true,
    channel_id: 0,
    group: 'default',
    quota: 0,
    submit_time: NOW - 120,
    status: 'SUCCESS',
    properties: { origin_model_name: 'plugin-image' },
    ...fields,
  }
}

function serveTasks(...tasks: TaskLog[]) {
  vi.mocked(getUserTaskLogs).mockResolvedValue({
    data: { items: tasks, total: tasks.length },
  } as never)
}

function serveImages(...keys: string[]) {
  vi.mocked(getTaskArtifacts).mockResolvedValue({
    artifacts: keys.map((key) => ({
      key,
      type: 'image',
      content_url: `https://site.example/v1/tasks/task_1/artifacts/${key}/content`,
    })),
  } as never)
}

function renderList(onEdit?: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ImageWorksList onEdit={onEdit} />
    </QueryClientProvider>
  )
}

async function confirmDelete() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Delete' }))
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete',
    })
  )
}

beforeEach(() => {
  window.localStorage.clear()
  useStudioImageWorks.setState({ works: [], pending: [], failed: [] })
  serveTasks()
  serveImages('image-1')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ImageWorksList browser images', () => {
  it('removes an image from the list and storage after the delete is confirmed', async () => {
    useStudioImageWorks.setState({ works: [work] })
    renderList()

    await confirmDelete()

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
    renderList()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('img', { name: 'a red fox' })).toBeInTheDocument()
    expect(useStudioImageWorks.getState().works).toHaveLength(1)
  })

  it('does not bring a deleted image back as its task', async () => {
    useStudioImageWorks.setState({ works: [{ ...work, taskId: 'task_1' }] })
    serveTasks(imageTask())
    renderList()

    await confirmDelete()

    expect(await screen.findByText('No images yet')).toBeInTheDocument()
  })

  it('says an image past its expiry has expired when it no longer loads', () => {
    useStudioImageWorks.setState({
      works: [{ ...work, createdAt: NOW - 3 * 24 * 3600 }],
    })
    renderList()

    fireEvent.error(screen.getByRole('img', { name: 'a red fox' }))

    expect(screen.getByText('This image has expired')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Download image' })
    ).not.toBeInTheDocument()
  })
})

describe('ImageWorksList layout and full view', () => {
  it('lays images out six to eight in a row on wide screens', () => {
    useStudioImageWorks.setState({ works: [work] })
    renderList()

    expect(screen.getByRole('article').parentElement).toHaveClass(
      'grid-cols-2',
      'xl:grid-cols-6',
      '2xl:grid-cols-7',
      'min-[112.5rem]:grid-cols-8'
    )
  })

  it('lists the small version and opens the full image in a dialog on click', async () => {
    useStudioImageWorks.setState({
      works: [{ ...work, thumbnailUrl: 'https://cdn.example/fox_thumb.jpg' }],
    })
    const user = userEvent.setup()
    renderList()
    expect(screen.getByRole('img', { name: 'a red fox' })).toHaveAttribute(
      'src',
      'https://cdn.example/fox_thumb.jpg'
    )

    await user.click(screen.getByRole('button', { name: 'View full image' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('img', { name: 'a red fox' })
    ).toHaveAttribute('src', 'https://cdn.example/fox.png')
    expect(
      within(dialog).getByRole('button', { name: 'Download image' })
    ).toBeInTheDocument()
  })

  it('lists the full image when its small version does not load', () => {
    useStudioImageWorks.setState({
      works: [{ ...work, thumbnailUrl: 'https://cdn.example/fox_thumb.jpg' }],
    })
    renderList()

    fireEvent.error(screen.getByRole('img', { name: 'a red fox' }))

    expect(screen.getByRole('img', { name: 'a red fox' })).toHaveAttribute(
      'src',
      'https://cdn.example/fox.png'
    )
  })

  it('asks a host that refuses CORS for the full image plainly', async () => {
    useStudioImageWorks.setState({ works: [work] })
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: 'View full image' }))
    const dialog = await screen.findByRole('dialog')
    const full = () => within(dialog).getByRole('img', { name: 'a red fox' })
    expect(full()).toHaveAttribute('crossorigin', 'anonymous')

    fireEvent.error(full())

    expect(full()).not.toHaveAttribute('crossorigin')
    fireEvent.error(full())
    expect(
      within(dialog).getByText('The image could not be loaded')
    ).toBeInTheDocument()
  })
})

describe('ImageWorksList image tasks', () => {
  it('shows a stored image from its CDN links without asking for its artifacts', async () => {
    serveTasks(
      imageTask({
        image_url: 'https://cdn.example/a.png',
        thumbnail_url: 'https://cdn.example/a_thumb.jpg',
        media_expires_at: NOW + 7 * 24 * 3600,
      })
    )
    renderList()

    expect(
      await screen.findByRole('img', { name: 'Image task' })
    ).toHaveAttribute('src', 'https://cdn.example/a_thumb.jpg')
    expect(getTaskArtifacts).not.toHaveBeenCalled()
  })

  it('shows a browser image from the copy its task got later, with that expiry', async () => {
    useStudioImageWorks.setState({ works: [{ ...work, taskId: 'task_1' }] })
    serveTasks(
      imageTask({
        image_url: 'https://cdn.example/a.png',
        thumbnail_url: 'https://cdn.example/a_thumb.jpg',
        media_expires_at: NOW + 7 * 24 * 3600,
      })
    )
    renderList()

    expect(await screen.findByText(/^Kept until/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'a red fox' })).toHaveAttribute(
      'src',
      'https://cdn.example/a_thumb.jpg'
    )
    expect(screen.queryByText(/^Expires in/)).not.toBeInTheDocument()
  })

  it('shows the image of a task finished in another browser with its download and expiry', async () => {
    serveTasks(imageTask({ media_expires_at: NOW + 5 * 3600 + 600 }))
    renderList()

    expect(
      await screen.findByRole('img', { name: 'Image task' })
    ).toHaveAttribute(
      'src',
      'https://site.example/v1/tasks/task_1/artifacts/image-1/content'
    )
    expect(
      screen.getByRole('button', { name: 'Download image' })
    ).toBeInTheDocument()
    expect(screen.getByText('Expires in 5 hours')).toBeInTheDocument()
    expect(getUserTaskLogs).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image' })
    )
  })

  it('shows one card per image of a task that drew several', async () => {
    serveTasks(imageTask())
    serveImages('image-1', 'image-2')
    renderList()

    expect(
      await screen.findAllByRole('img', { name: 'Image task' })
    ).toHaveLength(2)
  })

  it('shows the progress of a running task without asking for its image', async () => {
    serveTasks(imageTask({ status: 'IN_PROGRESS', progress: '40%' }))
    renderList()

    expect(await screen.findByText('Generating')).toBeInTheDocument()
    expect(screen.queryByText('40%')).not.toBeInTheDocument()
    expect(getTaskArtifacts).not.toHaveBeenCalled()
  })

  it('shows why a failed task has no image', async () => {
    serveTasks(
      imageTask({
        status: 'FAILURE',
        fail_reason:
          'Video generation failed. Your charge has been refunded. Please submit again later. If it keeps failing, send the request ID to support.',
      })
    )
    renderList()

    expect(await screen.findByText('Generation failed')).toBeInTheDocument()
    expect(
      screen.getByText(/^Image generation failed\. Your charge/)
    ).toBeInTheDocument()
  })

  it('says the image could not be loaded when its task lists none', async () => {
    serveTasks(imageTask())
    serveImages()
    renderList()

    expect(
      await screen.findByText('The image could not be loaded')
    ).toBeInTheDocument()
  })

  it('keeps a server error on the card of the image instead of the whole page', async () => {
    serveTasks(imageTask())
    vi.mocked(getTaskArtifacts).mockRejectedValue(
      Object.assign(new Error('failed'), { response: { status: 500 } })
    )
    const onInternalServerError = vi.fn()
    const client = createAppQueryClient(onInternalServerError)
    render(
      <QueryClientProvider client={client}>
        <ImageWorksList />
      </QueryClientProvider>
    )

    expect(
      await screen.findByText('The image could not be loaded')
    ).toBeInTheDocument()
    expect(onInternalServerError).not.toHaveBeenCalled()
  })

  it('hides a deleted task in this browser', async () => {
    serveTasks(imageTask())
    const view = renderList()

    await confirmDelete()

    expect(await screen.findByText('No images yet')).toBeInTheDocument()
    view.unmount()
    renderList()
    expect(await screen.findByText('No images yet')).toBeInTheDocument()
  })

  it('asks for a longer list when Load more is clicked', async () => {
    vi.mocked(getUserTaskLogs).mockImplementation(async (params) => {
      const items = [imageTask(), imageTask({ task_id: 'task_2' })]
      return {
        data: {
          items: params.page_size === 24 ? items.slice(0, 1) : items,
          total: 2,
        },
      } as never
    })
    const user = userEvent.setup()
    renderList()

    await user.click(await screen.findByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument()
  })
})

describe('ImageWorksList failed requests', () => {
  it('sends a failed request again on Retry and drops it on Dismiss', async () => {
    const request = {
      model: 'plugin-image',
      prompt: 'a red fox',
      n: 1,
      response_format: 'url' as const,
    }
    useStudioImageWorks.setState({
      failed: [
        { id: 'f1', request, reason: 'Busy', failedAt: 1 },
        { id: 'f2', request, reason: 'Busy', failedAt: 1 },
      ],
    })
    vi.mocked(generateImages).mockResolvedValue([
      { url: 'https://cdn.example/a.png' },
    ])
    const user = userEvent.setup()
    renderList()

    const retries = await screen.findAllByRole('button', { name: 'Retry' })
    await user.click(retries[0])
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(generateImages).toHaveBeenCalledWith(request)
    await waitFor(() =>
      expect(useStudioImageWorks.getState().works).toHaveLength(1)
    )
    expect(useStudioImageWorks.getState().failed).toEqual([])
  })
})
