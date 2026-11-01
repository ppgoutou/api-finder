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
import type { TFunction } from 'i18next'

import type { SystemTask } from '@/features/system-settings/types'

import type { OnboardingSyncSummary } from '../types'
import { modelsQueryKeys } from './query-keys'

export const SYNC_TASK_TYPE = 'upstream_price_check'
export const SYNC_HISTORY_KEY = [
  ...modelsQueryKeys.all,
  'onboarding',
  'sync-history',
]

export type SyncTask = SystemTask<
  Record<string, unknown>,
  { progress?: number },
  OnboardingSyncSummary
>

export function isActiveSyncTask(task: SyncTask | undefined): boolean {
  return task?.status === 'pending' || task?.status === 'running'
}

/** One line per part of a sync run, for the toast and the run history. */
export function syncSummaryLines(
  summary: OnboardingSyncSummary | undefined,
  t: TFunction
): string[] {
  if (!summary) return []
  const lines: string[] = []
  if (summary.detection) {
    lines.push(
      t(
        'Model detection: {{checked}} channels, {{added}} new, {{removed}} delisted, {{failed}} failed',
        {
          checked: summary.detection.checked_channels,
          added: summary.detection.detected_add_models,
          removed: summary.detection.detected_remove_models,
          failed: summary.detection.failed_channels,
        }
      )
    )
  }
  lines.push(
    t(
      'Supplier prices: {{checked}} channels checked, {{failed}} failed, {{changes}} changes',
      {
        checked: summary.checked_channels,
        failed: summary.failed_channels,
        changes: summary.changes,
      }
    )
  )
  for (const failure of summary.failures ?? []) {
    lines.push(`${failure.channel_name}: ${failure.error}`)
  }
  if (summary.applied_models?.length) {
    lines.push(
      t('Priced from the supplier: {{names}}', {
        names: summary.applied_models.join(', '),
      })
    )
  }
  if (summary.adapted_models?.length) {
    lines.push(
      t('Plugins adapted to: {{names}}', {
        names: summary.adapted_models.join(', '),
      })
    )
  }
  if (summary.waiting_models) {
    lines.push(
      t('{{count}} models still wait for their plugin', {
        count: summary.waiting_models,
      })
    )
  }
  if (summary.drafted_models?.length) {
    lines.push(
      t('Drafts prepared for: {{names}}', {
        names: summary.drafted_models.join(', '),
      })
    )
  }
  return lines
}
