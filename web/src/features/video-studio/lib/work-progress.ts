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
import { TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'

import { isFinishedTask } from './work-retention'

/** What a work that is not finished yet is doing. */
export type WorkStage = 'submitting' | 'queued' | 'generating'

/** Finished tasks needed before their time counts as typical. */
const TYPICAL_MIN_SAMPLES = 3
const TYPICAL_MAX_SAMPLES = 10
/** Share of the typical time the bar never passes while unfinished. */
const MAX_PROGRESS = 0.95
/** Past this multiple of the typical time a work counts as slow. */
const SLOW_FACTOR = 1.5
/** Without a typical time, a work counts as slow after this many seconds. */
const SLOW_SECONDS = 15 * 60

export function taskStage(task: TaskLog): WorkStage {
  return task.status === TASK_STATUS.IN_PROGRESS ? 'generating' : 'queued'
}

/**
 * Median seconds the user's own recent works on the model took, or null with
 * too few of them. Queue time is included, as it is in the elapsed time.
 */
export function typicalSeconds(
  tasks: readonly TaskLog[],
  model: string | undefined
): number | null {
  if (!model) return null
  const durations = tasks
    .filter(
      (task) =>
        task.status === TASK_STATUS.SUCCESS &&
        task.properties?.origin_model_name === model
    )
    .map((task) => (task.finish_time ?? 0) - task.submit_time)
    .filter((seconds) => seconds > 0)
    .slice(0, TYPICAL_MAX_SAMPLES)
    .sort((a, b) => a - b)
  if (durations.length < TYPICAL_MIN_SAMPLES) return null
  return durations[Math.floor(durations.length / 2)]
}

export interface WorkProgress {
  elapsed: number
  /** Share of the typical time, or null when there is none to compare with. */
  share: number | null
  /** Whole minutes left by the typical time, or null when unknown or past. */
  minutesLeft: number | null
  slow: boolean
}

/** Times are in Unix seconds. */
export function workProgress(
  startedAt: number,
  now: number,
  typical: number | null
): WorkProgress {
  const elapsed = Math.max(0, now - startedAt)
  return {
    elapsed,
    share: typical ? Math.min(MAX_PROGRESS, elapsed / typical) : null,
    minutesLeft:
      typical && elapsed < typical ? Math.ceil((typical - elapsed) / 60) : null,
    slow: elapsed > (typical ? typical * SLOW_FACTOR : SLOW_SECONDS),
  }
}

/** Elapsed time as "m:ss", or "h:mm:ss" from an hour on. */
export function formatElapsed(seconds: number): string {
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  if (hours === 0) return `${minutes}:${rest}`
  return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
}

/** Tasks submitted in this browser that are still running. */
export function runningTasks(
  tasks: readonly TaskLog[],
  remembered: ReadonlySet<string>
): TaskLog[] {
  return tasks.filter(
    (task) => !isFinishedTask(task) && remembered.has(task.task_id)
  )
}
