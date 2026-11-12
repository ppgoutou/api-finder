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
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { TaskLog } from '../../types'
import { TaskDetailsDialog } from '../dialogs/task-details-dialog'

function makeTask(platform: string): TaskLog {
  return {
    id: 1,
    user_id: 7,
    platform,
    task_id: 'task_public',
    action: 'TEXT_GENERATE',
    channel_id: 0,
    group: 'default',
    quota: 100,
    submit_time: 1,
    status: 'SUCCESS',
    properties: { origin_model_name: 'public-model' },
  }
}

function renderTask(platform: string): void {
  render(
    <TaskDetailsDialog
      log={makeTask(platform)}
      isAdmin={false}
      isRoot={false}
      open
      onOpenChange={() => undefined}
    />
  )
}

describe('task details platform row', () => {
  test('omits the platform row when the self view carries no platform', () => {
    renderTask('')

    expect(screen.queryByText('Platform')).toBeNull()
    expect(screen.getByText('public-model')).toBeVisible()
  })

  test('shows the platform row when the platform is present', () => {
    renderTask('suno')

    expect(screen.getByText('Platform')).toBeVisible()
    expect(screen.getByText('suno')).toBeVisible()
  })
})

describe('task details media storage section', () => {
  const copied: TaskLog = {
    ...makeTask('suno'),
    admin_info: {
      media_copy: {
        stored: true,
        size: 2 * 1024 * 1024,
        download_ms: 4200,
        upload_ms: { overseas: 1100, mainland: 2000 },
      },
    },
  }

  function renderCopied(isAdmin: boolean): void {
    render(
      <TaskDetailsDialog
        log={copied}
        isAdmin={isAdmin}
        isRoot={false}
        open
        onOpenChange={() => undefined}
      />
    )
  }

  test('shows admins the download and per-bucket upload times', () => {
    renderCopied(true)

    expect(screen.getByText('Media storage')).toBeVisible()
    expect(screen.getByText('Stored')).toBeVisible()
    expect(screen.getByText('4.2 s')).toBeVisible()
    expect(screen.getByText('Overseas storage')).toBeVisible()
    expect(screen.getByText('1.1 s')).toBeVisible()
    expect(screen.getByText('Mainland China storage')).toBeVisible()
    expect(screen.getByText('2 s')).toBeVisible()
  })

  test('hides the section from the task owner', () => {
    renderCopied(false)

    expect(screen.queryByText('Media storage')).toBeNull()
  })
})
