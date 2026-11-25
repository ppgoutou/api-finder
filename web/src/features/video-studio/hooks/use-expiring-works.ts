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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getUserTaskLogs } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { STUDIO_WORKS_QUERY_KEY } from '../constants'
import { readHiddenTasks } from '../lib/hidden-works'
import {
  imageRetention,
  isImageTask,
  listedImageTasks,
  taskRetention,
} from '../lib/work-retention'

/** Recent tasks checked for expiry; older ones have long expired. */
const REMINDER_TASK_COUNT = 50

/** The current time in Unix seconds, refreshed every minute. */
export function useUnixNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      60 * 1000
    )
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/**
 * How many of the user's works expire soon and should be downloaded: recent
 * tasks the server reports as expiring, and images linked from this browser. Works the user deleted are left out.
 */
export function useExpiringWorks() {
  const now = useUnixNow()
  const images = useStudioImageWorks((state) => state.works)
  const tasks = useQuery({
    queryKey: [...STUDIO_WORKS_QUERY_KEY, 'reminder'],
    queryFn: async () => {
      const response = await getUserTaskLogs({
        p: 1,
        page_size: REMINDER_TASK_COUNT,
      })
      return (response.data?.items ?? []) as TaskLog[]
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
  const hidden = readHiddenTasks()
  const recent = tasks.data ?? []
  const videos = recent.filter(
    (task) =>
      !hidden.includes(task.task_id) &&
      !isImageTask(task) &&
      taskRetention(task, now)?.state === 'expiring'
  ).length
  const imageCount =
    images.filter((image) => imageRetention(image, now)?.state === 'expiring')
      .length +
    listedImageTasks(recent, images, hidden).filter(
      (task) => taskRetention(task, now)?.state === 'expiring'
    ).length
  return { videos, images: imageCount, total: videos + imageCount }
}
