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

import { WorksList } from '../components/works-list'
import { rememberTaskPrompt } from '../lib/prompt-history'

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

    expect(onEdit).toHaveBeenCalledWith({ model: 'seedance-2.0' })
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
})
