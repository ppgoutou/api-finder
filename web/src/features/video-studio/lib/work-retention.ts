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
import { TASK_ACTIONS, TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'

import type { StudioImage } from '../types'

/** Generated image links from suppliers stop working about a day later. */
export const IMAGE_LINK_LIFETIME_SECONDS = 24 * 60 * 60

/** Works due to expire within this many seconds are flagged as expiring. */
export const EXPIRY_REMINDER_SECONDS = 3 * 24 * 60 * 60

/**
 * How long a work stays available:
 * - `expiring`: expires within the reminder window, download it soon;
 * - `scheduled`: expires later than the reminder window;
 * - `expired`: its link no longer works.
 */
export interface WorkRetention {
  state: 'expiring' | 'scheduled' | 'expired'
  expiresAt: number
}

function retentionUntil(expiresAt: number, now: number): WorkRetention {
  if (expiresAt <= now) return { state: 'expired', expiresAt }
  if (expiresAt - now <= EXPIRY_REMINDER_SECONDS) {
    return { state: 'expiring', expiresAt }
  }
  return { state: 'scheduled', expiresAt }
}

export function isFinishedTask(task: TaskLog): boolean {
  return (
    task.status === TASK_STATUS.SUCCESS || task.status === TASK_STATUS.FAILURE
  )
}

export function isImageTask(task: TaskLog): boolean {
  return (
    task.action === TASK_ACTIONS.TEXT_TO_IMAGE ||
    task.action === TASK_ACTIONS.IMAGE_TO_IMAGE
  )
}

/**
 * Image tasks to list next to the images kept in this browser: those created
 * on this site, unless deleted, already among the browser's images, or
 * finished with a result that was never kept.
 */
export function listedImageTasks(
  tasks: readonly TaskLog[],
  images: readonly StudioImage[],
  hidden: readonly string[]
): TaskLog[] {
  const shown = new Set(images.map((image) => image.taskId))
  return tasks.filter(
    (task) =>
      isImageTask(task) &&
      task.console_image === true &&
      !hidden.includes(task.task_id) &&
      !shown.has(task.task_id) &&
      !(task.status === TASK_STATUS.SUCCESS && task.result_discarded)
  )
}

/**
 * Retention of a task's video or image as the server reports it; null while
 * the task is unfinished or its copy into media storage is still in progress.
 * `now` is in Unix seconds.
 */
export function taskRetention(
  task: TaskLog,
  now: number
): WorkRetention | null {
  if (!task.media_expires_at) return null
  return retentionUntil(task.media_expires_at, now)
}

/**
 * Retention of an image generated in this browser: until the expiry of the
 * server's copy, else as long as the upstream link. An inline image lives in
 * the browser as long as the work does.
 */
export function imageRetention(
  image: StudioImage,
  now: number
): WorkRetention | null {
  if (image.expiresAt) return retentionUntil(image.expiresAt, now)
  if (image.url.startsWith('data:')) return null
  return retentionUntil(image.createdAt + IMAGE_LINK_LIFETIME_SECONDS, now)
}

/** Seconds until expiry as the largest whole unit: days, hours or minutes. */
export function remainingParts(
  expiresAt: number,
  now: number
): { value: number; unit: 'day' | 'hour' | 'minute' } {
  const seconds = Math.max(0, expiresAt - now)
  if (seconds >= 24 * 60 * 60) {
    return { value: Math.floor(seconds / (24 * 60 * 60)), unit: 'day' }
  }
  if (seconds >= 60 * 60) {
    return { value: Math.floor(seconds / (60 * 60)), unit: 'hour' }
  }
  return { value: Math.max(1, Math.ceil(seconds / 60)), unit: 'minute' }
}
