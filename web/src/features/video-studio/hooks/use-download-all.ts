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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getTaskArtifacts } from '@/features/usage-logs/api'
import type { TaskLog } from '@/features/usage-logs/types'
import { saveFileInParts } from '@/hooks/use-segmented-download'

import type { StudioImage } from '../types'

interface Downloadable {
  /** Resolves the address when it is not known yet. */
  url: () => Promise<string | undefined>
  filename: string
}

async function taskArtifactUrl(task: TaskLog, type: 'video' | 'image') {
  const projection = await getTaskArtifacts(task.task_id)
  return (
    projection.artifacts.find((artifact) => artifact.type === type)
      ?.content_url ?? projection.legacyContentUrl
  )
}

/**
 * Downloads the given works one after another. Files the browser cannot fetch
 * in parts are counted and named afterwards, since opening a tab for each
 * would be blocked.
 */
export function useDownloadAll() {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  const downloadAll = async (works: {
    videoTasks: TaskLog[]
    imageTasks: TaskLog[]
    browserImages: StudioImage[]
  }) => {
    const files: Downloadable[] = [
      ...works.videoTasks.map((task) => ({
        url: () => taskArtifactUrl(task, 'video'),
        filename: `${task.task_id}.mp4`,
      })),
      ...works.imageTasks.map((task) => ({
        url: async () => task.image_url ?? taskArtifactUrl(task, 'image'),
        filename: task.task_id,
      })),
      ...works.browserImages.map((image) => ({
        url: async () => image.url,
        filename: `image-${image.id}`,
      })),
    ]
    if (files.length === 0) return
    let failed = 0
    setProgress({ done: 0, total: files.length })
    for (const [index, file] of files.entries()) {
      try {
        const url = await file.url()
        if (!url) throw new Error('No address')
        await saveFileInParts(url, file.filename, {
          signal: new AbortController().signal,
          onProgress: () => undefined,
        })
      } catch {
        failed += 1
      }
      setProgress({ done: index + 1, total: files.length })
    }
    setProgress(null)
    if (failed > 0) {
      toast.error(
        t(
          '{{count}} works could not be downloaded together. Download them one by one from their cards.',
          { count: failed }
        )
      )
    }
  }

  return { downloadAll, progress }
}
