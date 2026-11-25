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
  formatElapsed,
  runningTasks,
  typicalSeconds,
  workProgress,
} from '../lib/work-progress'

function task(
  id: string,
  status: string,
  seconds: number,
  model = 'm'
): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: '',
    task_id: id,
    action: 'generate',
    channel_id: 1,
    group: 'default',
    quota: 0,
    submit_time: 1000,
    finish_time: seconds ? 1000 + seconds : 0,
    status,
    properties: { origin_model_name: model },
  }
}

describe('typicalSeconds', () => {
  it('takes the median of the finished works of the model', () => {
    const tasks = [
      task('a', 'SUCCESS', 100),
      task('b', 'SUCCESS', 900),
      task('c', 'SUCCESS', 200),
      task('d', 'FAILURE', 5),
      task('e', 'SUCCESS', 5, 'other'),
    ]
    expect(typicalSeconds(tasks, 'm')).toBe(200)
  })

  it('knows no typical time from fewer than three works', () => {
    const tasks = [task('a', 'SUCCESS', 100), task('b', 'SUCCESS', 100)]
    expect(typicalSeconds(tasks, 'm')).toBeNull()
    expect(typicalSeconds(tasks, undefined)).toBeNull()
  })
})

describe('workProgress', () => {
  it('compares the elapsed time with the typical one', () => {
    expect(workProgress(1000, 1150, 600)).toEqual({
      elapsed: 150,
      share: 0.25,
      minutesLeft: 8,
      slow: false,
    })
  })

  it('never fills the bar and turns slow well past the typical time', () => {
    const progress = workProgress(1000, 2000, 600)
    expect(progress.share).toBe(0.95)
    expect(progress.minutesLeft).toBeNull()
    expect(progress.slow).toBe(true)
  })

  it('estimates nothing without a typical time, and turns slow after 15 minutes', () => {
    expect(workProgress(1000, 1300, null)).toMatchObject({
      share: null,
      minutesLeft: null,
      slow: false,
    })
    expect(workProgress(1000, 1901, null).slow).toBe(true)
  })

  it('starts at zero when the browser clock is behind', () => {
    expect(workProgress(1000, 990, null).elapsed).toBe(0)
  })
})

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [3725, '1:02:05'],
  ])('shows %i seconds as %s', (seconds, text) => {
    expect(formatElapsed(seconds)).toBe(text)
  })
})

describe('runningTasks', () => {
  it('keeps unfinished tasks of this browser, not those of the API', () => {
    const tasks = [
      task('mine', 'IN_PROGRESS', 0),
      task('api', 'IN_PROGRESS', 0),
      task('done', 'SUCCESS', 10),
    ]
    expect(
      runningTasks(tasks, new Set(['mine', 'done'])).map((item) => item.task_id)
    ).toEqual(['mine'])
  })
})
