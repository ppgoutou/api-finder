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
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getUserTaskLogs } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { createSiteTitle } from '@/lib/site-title'

import { StudioTaskTray } from '../components/studio-task-tray'
import { StudioTaskWatcher } from '../components/studio-task-watcher'
import { STUDIO_WORKS_QUERY_KEY } from '../constants'
import { rememberTaskPrompt } from '../lib/prompt-history'

const router = vi.hoisted(() => ({ pathname: '/wallet' }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: (options: {
    select: (state: { location: { pathname: string } }) => string
  }) => options.select({ location: { pathname: router.pathname } }),
  Link: (props: { to: string; children: ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))
vi.mock('@/features/usage-logs/api', () => ({ getUserTaskLogs: vi.fn() }))

function listTask(status: string, taskId = 'task_1') {
  const now = Math.floor(Date.now() / 1000)
  const task: Partial<TaskLog> = {
    task_id: taskId,
    action: 'generate',
    status,
    submit_time: now - 30,
    finish_time: status === 'SUCCESS' || status === 'FAILURE' ? now : 0,
    properties: { origin_model_name: 'm' },
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
      <StudioTaskTray />
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
  window.sessionStorage.clear()
  router.pathname = '/wallet'
  rememberTaskPrompt(
    'task_1',
    { model: 'm', prompt: 'a cat', seconds: 5, resolution: '720p' },
    'm'
  )
})

afterEach(() => {
  notifyManager.setScheduler(defaultScheduler)
  vi.unstubAllGlobals()
})

describe('StudioTaskTray', () => {
  it('shows on another page a video of this browser while it runs and once it is ready', async () => {
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    const tray = screen.getByRole('region', { name: 'Your videos' })
    expect(tray).toHaveTextContent('a cat')
    expect(tray).toHaveTextContent('Generating')

    listTask('SUCCESS')
    await refetch()

    expect(tray).toHaveTextContent('Completed')
    expect(screen.getByRole('link', { name: 'View my works' })).toHaveAttribute(
      'href',
      '/my-works'
    )
  })

  it('stays closed for the videos it showed once it is closed', async () => {
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await refetch()

    expect(screen.queryByRole('region', { name: 'Your videos' })).toBeNull()
  })

  it('does not show on the pages that list the works', async () => {
    router.pathname = '/my-works'
    listTask('IN_PROGRESS')
    await renderWatcher()

    expect(screen.queryByRole('region', { name: 'Your videos' })).toBeNull()
  })

  it('does not show tasks submitted elsewhere, such as through the API', async () => {
    listTask('IN_PROGRESS', 'task_api')
    await renderWatcher()

    expect(screen.queryByRole('region', { name: 'Your videos' })).toBeNull()
  })
})

describe('StudioTaskWatcher', () => {
  it('notifies while the tab is hidden and notifications are allowed', async () => {
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
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    listTask('SUCCESS')
    await refetch()

    expect(notify).toHaveBeenCalledWith('Your video is ready', 'a cat')
    hidden.mockRestore()
  })

  it('counts the running works in the tab title, then says one is ready until the tab is seen', async () => {
    createSiteTitle(document, '/wallet').setSiteName('Acme')
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    listTask('IN_PROGRESS')
    const refetch = await renderWatcher()
    await vi.waitFor(() => expect(document.title).toBe('1 generating · Acme'))
    listTask('SUCCESS')
    await refetch()
    expect(document.title).toBe('Video ready · Acme')

    hidden.mockReturnValue(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(document.title).toBe('Acme')
    hidden.mockRestore()
  })

  it('does not announce works that were finished already', async () => {
    const notify = vi.fn()
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted'
        constructor() {
          notify()
        }
      }
    )
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    listTask('SUCCESS')
    const refetch = await renderWatcher()
    await refetch()

    expect(notify).not.toHaveBeenCalled()
    hidden.mockRestore()
  })
})
