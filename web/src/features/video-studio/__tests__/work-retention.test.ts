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
import { describe, expect, it } from 'vitest'

import type { TaskLog } from '@/features/usage-logs/types'

import {
  imageRetention,
  listedImageTasks,
  remainingParts,
  taskRetention,
} from '../lib/work-retention'
import type { StudioImage } from '../types'

const NOW = 1_800_000_000
const HOUR = 60 * 60
const DAY = 24 * HOUR

function task(fields: Partial<TaskLog>): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: '',
    task_id: 'task_1',
    action: 'GENERATE',
    channel_id: 0,
    group: 'default',
    quota: 0,
    submit_time: NOW - HOUR,
    status: 'SUCCESS',
    ...fields,
  }
}

function image(url: string, createdAt: number): StudioImage {
  return {
    id: 'img_1',
    url,
    prompt: 'a cat',
    model: 'm',
    size: '1024x1024',
    createdAt,
  }
}

describe('taskRetention', () => {
  it('reports nothing while the server has not decided how long the video lasts', () => {
    expect(taskRetention(task({}), NOW)).toBeNull()
  })

  it('flags a video expiring within three days as expiring', () => {
    expect(
      taskRetention(task({ media_expires_at: NOW + 20 * HOUR }), NOW)
    ).toEqual({ state: 'expiring', expiresAt: NOW + 20 * HOUR })
  })

  it('reports a video expiring later than three days as scheduled', () => {
    expect(
      taskRetention(task({ media_expires_at: NOW + 10 * DAY }), NOW)?.state
    ).toBe('scheduled')
  })

  it('reports a video past its expiry as expired', () => {
    expect(taskRetention(task({ media_expires_at: NOW - 1 }), NOW)?.state).toBe(
      'expired'
    )
  })
})

describe('listedImageTasks', () => {
  const imageTask = task({ action: 'text_to_image', console_image: true })

  it('lists finished, running and failed image tasks created on this site', () => {
    const tasks = [
      imageTask,
      { ...imageTask, task_id: 'task_2', status: 'IN_PROGRESS' },
      { ...imageTask, task_id: 'task_3', status: 'FAILURE' },
      { ...imageTask, task_id: 'task_4', action: 'image_to_image' },
    ]

    expect(listedImageTasks(tasks, [], [])).toEqual(tasks)
  })

  it.each([
    ['a video task', { ...imageTask, action: 'text_to_video' }, [], []],
    ['an API client image', { ...imageTask, console_image: false }, [], []],
    ['a deleted image', imageTask, [], ['task_1']],
    [
      'an image this browser holds',
      imageTask,
      [{ ...image('https://cdn.example/a.png', NOW), taskId: 'task_1' }],
      [],
    ],
    [
      'an image that was never kept',
      { ...imageTask, result_discarded: true },
      [],
      [],
    ],
  ])('leaves out %s', (_, candidate, images, hidden) => {
    expect(listedImageTasks([candidate], images, hidden)).toEqual([])
  })
})

describe('imageRetention', () => {
  it('uses the expiry of the copy the server stored', () => {
    expect(
      imageRetention(
        {
          ...image('https://media.example/images/a.png', NOW - 2 * DAY),
          expiresAt: NOW + 13 * DAY,
        },
        NOW
      )
    ).toEqual({ state: 'scheduled', expiresAt: NOW + 13 * DAY })
  })

  it('keeps the longer expiry of the image and the copy its task got later', () => {
    const work = {
      ...image('https://cdn.example/a.png', NOW - 2 * HOUR),
      taskId: 'task_1',
    }
    const copied = task({
      image_url: 'https://media.example/images/a.png',
      media_expires_at: NOW + 7 * DAY,
    })

    expect(imageRetention(work, NOW, [copied])?.expiresAt).toBe(NOW + 7 * DAY)
    expect(
      imageRetention({ ...work, expiresAt: NOW + 13 * DAY }, NOW, [copied])
        ?.expiresAt
    ).toBe(NOW + 13 * DAY)
  })

  it('gives a linked image one day from its creation', () => {
    expect(
      imageRetention(image('https://cdn.example/a.png', NOW - 2 * HOUR), NOW)
    ).toEqual({ state: 'expiring', expiresAt: NOW + 22 * HOUR })
  })

  it('reports a linked image older than one day as expired', () => {
    expect(
      imageRetention(image('https://cdn.example/a.png', NOW - 2 * DAY), NOW)
        ?.state
    ).toBe('expired')
  })

  it('reports nothing for an inline image kept in the browser', () => {
    expect(
      imageRetention(image('data:image/png;base64,AAAA', NOW - 2 * DAY), NOW)
    ).toBeNull()
  })
})

describe('remainingParts', () => {
  it.each([
    [3 * DAY + HOUR, { value: 3, unit: 'day' }],
    [5 * HOUR + 59 * 60, { value: 5, unit: 'hour' }],
    [90, { value: 2, unit: 'minute' }],
    [0, { value: 1, unit: 'minute' }],
  ])('reads %i seconds left as the largest whole unit', (left, expected) => {
    expect(remainingParts(NOW + left, NOW)).toEqual(expected)
  })
})
