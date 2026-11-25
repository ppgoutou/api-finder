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
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getServerErrorMessage } from '@/lib/server-error-message'
import {
  useStudioPending,
  type PendingVideo,
} from '@/stores/studio-pending-store'

import { createVideoTask } from '../api'
import { STUDIO_BALANCE_QUERY_KEY, STUDIO_WORKS_QUERY_KEY } from '../constants'
import { rememberTaskPrompt } from '../lib/prompt-history'
import type { VideoTaskRequest } from '../types'

let nextPendingId = 0

/**
 * Submits a request as one or more video tasks. A card for each shows at
 * once; the tasks are created one after another, stopping at the first
 * failure, and the works list is refreshed at the end.
 */
export function useVideoSubmit() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const addPending = useStudioPending((state) => state.add)
  const pendingCreated = useStudioPending((state) => state.created)
  const removePending = useStudioPending((state) => state.remove)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (
    request: VideoTaskRequest,
    count: number,
    onStarted?: () => void
  ): Promise<number> => {
    setSubmitting(true)
    const spec = [
      request.model,
      request.ratio,
      request.resolution,
      t('{{seconds}}s', { seconds: request.seconds }),
    ]
      .filter(Boolean)
      .join(' · ')
    const startedAt = Math.floor(Date.now() / 1000)
    const pending = Array.from({ length: count }, (): PendingVideo => {
      nextPendingId += 1
      return { id: `pending-${nextPendingId}`, request, spec, startedAt }
    })
    addPending(pending)
    onStarted?.()
    let created = 0
    try {
      for (const video of pending) {
        const taskId = await createVideoTask(request)
        rememberTaskPrompt(taskId, request, spec)
        pendingCreated(video.id, taskId)
        created += 1
      }
      toast.success(t('Submitted. You can leave this page while it generates.'))
    } catch (error) {
      toast.error(getServerErrorMessage(error, t('Task submission failed')))
    } finally {
      removePending(pending.slice(created).map((video) => video.id))
      setSubmitting(false)
      void queryClient.invalidateQueries({ queryKey: STUDIO_BALANCE_QUERY_KEY })
      // Created tasks keep their cards until the list shows them.
      void queryClient
        .invalidateQueries({ queryKey: STUDIO_WORKS_QUERY_KEY })
        .finally(() => removePending(pending.map((video) => video.id)))
    }
    return created
  }

  return { submit, submitting }
}
