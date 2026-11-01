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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getSystemTask, listSystemTasks } from '@/features/system-settings/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { startOnboardingSync } from '../api'
import {
  isActiveSyncTask as isActive,
  SYNC_HISTORY_KEY,
  SYNC_TASK_TYPE,
  syncSummaryLines,
  type SyncTask,
} from '../lib/onboarding-sync'

/**
 * Starts the upstream sync run and follows it to the end, also picking up a
 * run that was already going when the page opened.
 */
export function useOnboardingSync(onFinished: () => Promise<void>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const announced = useRef<string | null>(null)

  const active = useQuery({
    queryKey: [...SYNC_HISTORY_KEY, 'active'],
    queryFn: async () => {
      const response = await listSystemTasks(1, {
        scope: 'active',
        type: SYNC_TASK_TYPE,
      })
      return (response.data?.[0] as SyncTask | undefined) ?? null
    },
    staleTime: Infinity,
  })
  const followed = taskId ?? active.data?.task_id ?? null

  const task = useQuery({
    queryKey: [...SYNC_HISTORY_KEY, 'task', followed],
    queryFn: async () => {
      const response = await getSystemTask(followed ?? '')
      if (!response.success || !response.data) {
        throw createServerError(response, t('We could not load system tasks.'))
      }
      return response.data as unknown as SyncTask
    },
    enabled: followed !== null,
    refetchInterval: (query) =>
      isActive(query.state.data) || !query.state.data ? 2000 : false,
  })

  useEffect(() => {
    const finished = task.data
    if (
      !finished ||
      isActive(finished) ||
      announced.current === finished.task_id
    ) {
      return
    }
    announced.current = finished.task_id
    setTaskId(null)
    queryClient.setQueryData([...SYNC_HISTORY_KEY, 'active'], null)
    void queryClient.invalidateQueries({ queryKey: SYNC_HISTORY_KEY })
    void onFinished()
    const lines = syncSummaryLines(finished.result, t)
    if (finished.status === 'failed') {
      toast.error(t('Upstream sync failed'), { description: finished.error })
      return
    }
    toast.success(t('Upstream sync finished'), {
      description: lines.join('\n'),
      duration: 12000,
    })
  }, [task.data, queryClient, onFinished, t])

  const start = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await startOnboardingSync()).data,
    onSuccess: (started) => {
      if (!started) return
      announced.current = null
      setTaskId(started.task_id)
      if (!started.created) {
        toast.info(t('A sync is already running. Following it.'))
      }
    },
  })

  const running =
    start.isPending ||
    (followed !== null && (!task.data || isActive(task.data)))
  return {
    start: () => start.mutate(),
    running,
    progress: task.data?.state?.progress,
  }
}
