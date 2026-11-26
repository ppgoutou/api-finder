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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getTaskArtifacts, getUserTaskLogs } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { useStudioPending } from '@/stores/studio-pending-store'

import { createVideoTask, deleteTaskPrompt } from '../api'
import { WorksList } from '../components/works-list'
import { rememberTaskPrompt } from '../lib/prompt-history'

vi.mock('../api', () => ({
  createVideoTask: vi.fn(),
  deleteTaskPrompt: vi.fn(),
}))
vi.mock('@/features/pricing/hooks', () => ({
  useModelDisplayName: () => (name: string) => name,
}))
vi.mock('../hooks/use-studio-price', () => ({
  useStudioPricer: () => () => ({ label: '¥5.24', costUSD: 0.77 }),
}))
vi.mock('@/features/usage-logs/api', () => ({
  getUserTaskLogs: vi.fn(),
  getTaskArtifacts: vi.fn(),
}))

function failedTask(taskId: string, model: string): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: 'video',
    task_id: taskId,
    action: 'GENERATE',
    channel_id: 1,
    group: 'default',
    quota: 0,
    submit_time: 1_790_000_000,
    status: 'FAILURE',
    fail_reason: 'Video generation failed',
    properties: { origin_model_name: model },
  }
}

function renderList(onEdit: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <WorksList onEdit={onEdit} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  useStudioPending.setState({ videos: [] })
  vi.mocked(getTaskArtifacts).mockResolvedValue({ artifacts: [] } as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('WorksList', () => {
  it('hands the remembered request of a work to onEdit when Edit again is clicked', async () => {
    rememberTaskPrompt(
      'task_1',
      {
        model: 'seedance-2.5',
        prompt: 'a cat in @图片1',
        seconds: 8,
        resolution: '1080p',
        images: ['https://site.example/video-assets/cat.png'],
      },
      'seedance-2.5 · 1080p · 8s'
    )
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [failedTask('task_1', 'seedance-2.5')] },
    } as never)
    const onEdit = vi.fn()
    const user = userEvent.setup()
    renderList(onEdit)

    await user.click(await screen.findByRole('button', { name: 'Edit again' }))

    expect(onEdit).toHaveBeenCalledOnce()
    expect(onEdit.mock.calls[0][0]).toMatchObject({
      mode: 'reference',
      model: 'seedance-2.5',
      prompt: 'a cat in @图片1',
      seconds: 8,
      resolution: '1080p',
      references: [
        {
          kind: 'image',
          status: 'ready',
          url: 'https://site.example/video-assets/cat.png',
        },
      ],
    })
  })

  it('offers only the model of a work submitted without a remembered request', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [failedTask('task_old', 'seedance-2.0')] },
    } as never)
    const onEdit = vi.fn()
    const user = userEvent.setup()
    renderList(onEdit)

    await user.click(await screen.findByRole('button', { name: 'Edit again' }))

    expect(onEdit).toHaveBeenCalledWith({ model: 'seedance-2.0' }, false)
  })

  it('asks the server for video works only, so images never push them off the page', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [], total: 0 },
    } as never)
    renderList(vi.fn())

    expect(await screen.findByText('No videos yet')).toBeInTheDocument()
    expect(getUserTaskLogs).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video' })
    )
  })

  it('hides a work in this browser after the delete is confirmed', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [failedTask('task_1', 'seedance-2.0')] },
    } as never)
    const user = userEvent.setup()
    const view = renderList(vi.fn())

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      })
    )

    expect(await screen.findByText('No videos yet')).toBeInTheDocument()
    view.unmount()
    renderList(vi.fn())
    expect(await screen.findByText('No videos yet')).toBeInTheDocument()
  })

  it('keeps the work when the delete is cancelled', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [failedTask('task_1', 'seedance-2.0')] },
    } as never)
    const user = userEvent.setup()
    renderList(vi.fn())

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.getByRole('button', { name: 'Edit again' })
    ).toBeInTheDocument()
    expect(screen.queryByText('No videos yet')).not.toBeInTheDocument()
  })

  it('shows how long a finished video stays available', async () => {
    const now = Math.floor(Date.now() / 1000)
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: {
        items: [
          {
            ...failedTask('task_1', 'seedance-2.0'),
            status: 'SUCCESS',
            fail_reason: '',
            media_expires_at: now + 5 * 60 * 60 + 600,
          },
        ],
      },
    } as never)
    renderList(vi.fn())

    expect(await screen.findByText('Expires in 5 hours')).toBeInTheDocument()
  })

  it('loads the next page of works when Load more is clicked', async () => {
    vi.mocked(getUserTaskLogs).mockImplementation(async (params) => {
      const items =
        params.page_size === 12
          ? [failedTask('task_1', 'seedance-2.0')]
          : [
              failedTask('task_1', 'seedance-2.0'),
              failedTask('task_2', 'seedance-2.0'),
            ]
      return { data: { items, total: 2 } } as never
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <WorksList loadMore />
      </QueryClientProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'Load more' }))

    expect(getUserTaskLogs).toHaveBeenLastCalledWith({
      p: 1,
      page_size: 24,
      kind: 'video',
    })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument()
  })

  const REQUEST = {
    model: 'seedance-2.5',
    prompt: 'a cat in @图片1',
    seconds: 8,
    resolution: '1080p',
  }

  function finishedTask(taskId: string, expiresIn: number): TaskLog {
    return {
      ...failedTask(taskId, 'seedance-2.5'),
      status: 'SUCCESS',
      fail_reason: '',
      media_expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    }
  }

  function listTasks(items: TaskLog[]) {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items, total: items.length },
    } as never)
  }

  it('asks with the fee before a failed work is submitted and charged again', async () => {
    rememberTaskPrompt('task_1', REQUEST, 'seedance-2.5 · 1080p · 8s')
    listTasks([failedTask('task_1', 'seedance-2.5')])
    vi.mocked(createVideoTask).mockResolvedValue('task_2')
    const user = userEvent.setup()
    renderList(vi.fn())

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('¥5.24')
    expect(createVideoTask).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole('button', { name: 'Generate again' })
    )

    await waitFor(() => expect(createVideoTask).toHaveBeenCalledWith(REQUEST))
  })

  it('names a work after its model when the prompt is unknown here', async () => {
    listTasks([failedTask('task_old', 'seedance-2.0')])
    renderList(vi.fn())

    expect(
      await within(await screen.findByRole('article')).findByTitle(
        'seedance-2.0'
      )
    ).toBeInTheDocument()
  })

  it('offers no player or download for an expired video and does not load it', async () => {
    rememberTaskPrompt('task_1', REQUEST, 'seedance-2.5 · 1080p · 8s')
    listTasks([finishedTask('task_1', -60)])
    renderList(vi.fn())

    expect(await screen.findByText('Expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(getTaskArtifacts).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Generate again' })
    ).toBeInTheDocument()
  })

  it('promises no settings of an expired video whose request is unknown', async () => {
    listTasks([finishedTask('task_old', -60)])
    renderList(vi.fn())

    expect(
      await screen.findByText('The video has been deleted.')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Generate again' })
    ).not.toBeInTheDocument()
  })

  it('plays a finished video with its prompt, and steps to the next one', async () => {
    rememberTaskPrompt('task_1', REQUEST, 'seedance-2.5 · 1080p · 8s')
    rememberTaskPrompt(
      'task_2',
      { ...REQUEST, prompt: 'a dog' },
      'seedance-2.5 · 1080p · 8s'
    )
    listTasks([finishedTask('task_1', 86400), finishedTask('task_2', 86400)])
    vi.mocked(getTaskArtifacts).mockResolvedValue({
      artifacts: [
        { key: 'video', type: 'video', content_url: 'https://cdn/v.mp4' },
      ],
    } as never)
    const user = userEvent.setup()
    renderList(vi.fn())

    await user.click(
      await screen.findByRole('button', { name: 'Play: a cat in @Image1' })
    )
    const dialog = screen.getByRole('dialog')
    // Kept out of the flow, or a portrait video would stretch its card.
    expect(
      screen.getByRole('button', {
        name: 'Play: a cat in @Image1',
        hidden: true,
      })
    ).toHaveClass('absolute', 'inset-0')
    expect(within(dialog).getByText('a cat in @Image1')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Previous work' })
    ).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Next work' }))

    expect(within(dialog).getByText('a dog')).toBeInTheDocument()
  })

  it('shows submissions without a task ahead of the works, until the task is listed', async () => {
    useStudioPending.setState({
      videos: [
        { id: 'p1', request: REQUEST, spec: 'seedance-2.5', startedAt: 0 },
        {
          id: 'p2',
          request: REQUEST,
          spec: 'seedance-2.5',
          startedAt: 0,
          taskId: 'task_1',
        },
      ],
    })
    listTasks([failedTask('task_1', 'seedance-2.5')])
    renderList(vi.fn())

    expect(await screen.findByText('Submitting')).toBeInTheDocument()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('Submitting')).toBeInTheDocument()
  })

  it('narrows the loaded works by state and by words of the prompt', async () => {
    rememberTaskPrompt('task_1', REQUEST, 'seedance-2.5 · 1080p · 8s')
    listTasks([
      failedTask('task_1', 'seedance-2.5'),
      finishedTask('task_2', -60),
    ])
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <WorksList loadMore onEdit={vi.fn()} />
      </QueryClientProvider>
    )
    expect(await screen.findAllByRole('article')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Failed' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.type(screen.getByRole('searchbox'), 'A CAT')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.type(screen.getByRole('searchbox'), ' nothing')
    expect(screen.getByText('No works match')).toBeInTheDocument()
  })

  function keptTask(taskId: string): TaskLog {
    return {
      ...failedTask(taskId, 'seedance-2.5'),
      properties: {
        origin_model_name: 'seedance-2.5',
        console_request: JSON.stringify(REQUEST),
      },
    }
  }

  async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      })
    )
  }

  it('names and reloads a work from what the server kept when this browser knows nothing', async () => {
    listTasks([keptTask('task_1')])
    const onEdit = vi.fn()
    const user = userEvent.setup()
    renderList(onEdit)

    expect(await screen.findByText('a cat in @Image1')).toBeInTheDocument()
    expect(screen.getByText(/^seedance-2\.5 · 1080p · 8s/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit again' }))
    expect(onEdit.mock.calls[0][0]).toMatchObject({
      prompt: REQUEST.prompt,
      seconds: 8,
      resolution: '1080p',
    })
  })

  it('ignores a kept request it cannot read', async () => {
    listTasks([
      {
        ...keptTask('task_1'),
        properties: { origin_model_name: 'seedance-2.0', console_request: '{' },
      },
    ])
    renderList(vi.fn())

    expect(
      await within(await screen.findByRole('article')).findByTitle(
        'seedance-2.0'
      )
    ).toBeInTheDocument()
  })

  it('deletes the prompt kept on the server along with the work', async () => {
    listTasks([keptTask('task_1')])
    const user = userEvent.setup()
    renderList(vi.fn())

    await confirmDelete(user)

    expect(await screen.findByText('No videos yet')).toBeInTheDocument()
    expect(deleteTaskPrompt).toHaveBeenCalledWith('task_1')
  })

  it('keeps the work listed when the server could not delete its prompt', async () => {
    vi.mocked(deleteTaskPrompt).mockRejectedValueOnce(new Error('offline'))
    listTasks([keptTask('task_1')])
    const user = userEvent.setup()
    renderList(vi.fn())

    await confirmDelete(user)

    await waitFor(() => expect(deleteTaskPrompt).toHaveBeenCalledOnce())
    expect(
      await screen.findByRole('button', { name: 'Edit again' })
    ).toBeInTheDocument()
  })
})

describe('WorksList failures and fees', () => {
  it('loads a failed work with the model menu open to try another model', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [failedTask('task_1', 'seedance-2.0')] },
    } as never)
    const onEdit = vi.fn()
    const user = userEvent.setup()
    renderList(onEdit)

    await user.click(
      await screen.findByRole('button', { name: 'Try another model' })
    )

    expect(onEdit).toHaveBeenCalledWith({ model: 'seedance-2.0' }, true)
  })

  it('shows what a finished work cost, and no charge for a failed one', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: {
        items: [
          { ...failedTask('task_1', 'seedance-2.0'), quota: 500000 },
          {
            ...failedTask('task_2', 'seedance-2.0'),
            status: 'SUCCESS',
            fail_reason: '',
            quota: 276481,
          },
        ],
      },
    } as never)
    renderList(vi.fn())

    const cards = await screen.findAllByRole('article')
    expect(cards[0]).not.toHaveTextContent('$1')
    // To the cent, not with the many digits of the usage logs.
    expect(cards[1]).toHaveTextContent(/\$0\.55(?!\d)/)
  })

  it('tells what a failed work gave back and copies its request ID for support', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: {
        items: [
          {
            ...failedTask('task_1', 'seedance-2.0'),
            refunded_quota: 500000,
            request_id: 'req-123',
          },
        ],
      },
    } as never)
    renderList(vi.fn())

    expect(await screen.findByText('Refunded $1')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy request ID' })
    ).toBeInTheDocument()
  })

  it('copies the task ID of a failed work submitted before request IDs were kept', async () => {
    vi.mocked(getUserTaskLogs).mockResolvedValue({
      data: { items: [failedTask('task_1', 'seedance-2.0')] },
    } as never)
    renderList(vi.fn())

    expect(
      await screen.findByRole('button', { name: 'Copy task ID' })
    ).toBeInTheDocument()
    expect(screen.getByRole('article')).not.toHaveTextContent('Refunded')
  })
})
