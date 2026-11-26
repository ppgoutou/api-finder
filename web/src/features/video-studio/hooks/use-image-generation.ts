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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getServerErrorMessage } from '@/lib/server-error-message'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { generateImages } from '../api'
import { STUDIO_BALANCE_QUERY_KEY, STUDIO_WORKS_QUERY_KEY } from '../constants'
import { imageShapeLabel } from '../lib/image-draft'
import type { ImageGenerationRequest } from '../types'

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Sends image requests, with waiting cards while they run. Images that come
 * back are listed; each request that fails stays as a card to retry, since a
 * plugin model draws one image per request.
 */
export function useImageGeneration() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const addWorks = useStudioImageWorks((state) => state.add)
  const startGenerating = useStudioImageWorks((state) => state.startGenerating)
  const stopGenerating = useStudioImageWorks((state) => state.stopGenerating)
  const addFailed = useStudioImageWorks((state) => state.addFailed)

  return async (requests: ImageGenerationRequest[], count: number) => {
    const [body] = requests
    const pendingId = newId()
    startGenerating({
      id: pendingId,
      prompt: body.prompt,
      model: body.model,
      size: imageShapeLabel(body),
      count,
      startedAt: Math.floor(Date.now() / 1000),
    })
    try {
      const results = await Promise.allSettled(
        requests.map((request) => generateImages(request))
      )
      const images = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : []
      )
      const createdAt = Math.floor(Date.now() / 1000)
      addWorks(
        images.map((image, index) => ({
          id: `${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          url: image.url,
          ...(image.thumbnailUrl ? { thumbnailUrl: image.thumbnailUrl } : {}),
          ...(image.expiresAt ? { expiresAt: image.expiresAt } : {}),
          ...(image.taskId ? { taskId: image.taskId } : {}),
          prompt: body.prompt,
          model: body.model,
          size: imageShapeLabel(body),
          ...(body.image ? { references: body.image } : {}),
          createdAt,
        }))
      )
      const failures = requests.flatMap((request, index) => {
        const result = results[index]
        return result.status === 'rejected'
          ? [{ request, reason: result.reason as unknown }]
          : []
      })
      addFailed(
        failures.map(({ request, reason }) => ({
          id: newId(),
          request,
          reason: getServerErrorMessage(reason, t('Image generation failed')),
          failedAt: createdAt,
        }))
      )
      if (images.length > 0) {
        toast.success(t('Images generated; they appear below.'))
      }
      if (failures.length > 0) {
        toast.error(
          getServerErrorMessage(
            failures[0].reason,
            t('Image generation failed')
          )
        )
      }
    } finally {
      stopGenerating(pendingId)
      void queryClient.invalidateQueries({ queryKey: STUDIO_WORKS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: STUDIO_BALANCE_QUERY_KEY })
    }
  }
}
