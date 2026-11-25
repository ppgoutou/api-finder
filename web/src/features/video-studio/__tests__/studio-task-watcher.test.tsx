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
import {
  defaultScheduler,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getUserTaskLogs } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { createSiteTitle } from '@/lib/site-title'

import { StudioTaskWatcher } from '../components/studio-task-watcher'
import { STUDIO_WORKS_QUERY_KEY } from '../constants'
import { rememberTaskPrompt } from '../lib/prompt-history'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/usage-logs/api', () => ({ getUserTaskLogs: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function listTask(status: string) {
  const task: Partial<TaskLog> = {
    task_id: 'task_1',
    action: 'generate',
    status,
    submit_time: 1_790_000_000,
  }
  vi.mocked(getUserTaskLogs).mockResolvedValue({
    data: { items: [task], total: 1 },
  } as never)
}

async function renderWatcher() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StudioTaskWatcher />
    </QueryClientProvider>
  )
  await vi.waitFor(() =>
    expect(
      client.getQueryData([...STUDIO_WORKS_QUERY_KEY, 'reminder'])
    ).toBeDefined()
  )
  return () =>
    act(() => client.refetchQueries({ queryKey: STUDIO_WORKS_QUERY_KEY }))
}

beforeEach(() => {
  // Query results reach the component within the act() that refetches.
  notifyManager.setScheduler((callback) => callback())
  window.localStorage.clear()
  window.history.replaceState({}, '', '/wallet')
  rememberTaskPrompt(
    'task_1',
    { model: 'm', prompt: 'a cat', seconds: 5, resolution: '720p' },
    'm'
  )
})

afterEach(() => {
  notifyManager.setScheduler(defaultScheduler)
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('StudioTaskWatcher', () => {
  it('says on another page that a video of this browser is ready', async () => {
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    listTask('SUCCESS')
    await refetch()

    expect(toast.success).toHaveBeenCalledWith(
      'Your video is ready',
      expect.objectContaining({ description: 'a cat' })
    )
  })

  it('stays quiet on the pages that list the works', async () => {
    window.history.replaceState({}, '', '/video-studio')
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    listTask('SUCCESS')
    await refetch()

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does not announce works that were finished already, or API tasks', async () => {
    listTask('SUCCESS')
    const refetch = await renderWatcher()
    await refetch()
    expect(toast.success).not.toHaveBeenCalled()

    window.localStorage.clear()
    listTask('IN_PROGRESS')
    await refetch()
    listTask('FAILURE')
    await refetch()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('notifies instead while the tab is hidden and notifications are allowed', async () => {
    const notify = vi.fn()
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor(title: string, options: { body: string }) {
        notify(title, options.body)
      }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    listTask('SUCCESS')
    await refetch()

    expect(notify).toHaveBeenCalledWith('Your video is ready', 'a cat')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('counts the running works in the tab title until they end', async () => {
    createSiteTitle(document, '/wallet').setSiteName('Acme')
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    await vi.waitFor(() => expect(document.title).toBe('1 generating · Acme'))
    listTask('SUCCESS')
    await refetch()

    expect(document.title).toBe('Acme')
    expect(screen.queryByText('1 generating')).toBeNull()
  })
})
