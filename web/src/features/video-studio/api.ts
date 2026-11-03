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
import { api } from '@/lib/api'
import type { HomePageContentResponse } from '@/features/home/types'

import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoAssetUploadResponse,
  VideoTaskRequest,
  VideoTaskResponse,
} from './types'

/**
 * Curated video-studio gallery settings (`StudioGallery` option as JSON;
 * empty when no works are configured).
 */
export async function getStudioGallery(): Promise<HomePageContentResponse> {
  const res = await api.get('/api/studio_gallery', {
    headers: { 'Cache-Control': null },
  })
  return res.data
}

/** Uploads a reference file and returns its public URL. */
export async function uploadVideoAsset(
  file: File,
  onProgress?: (percent: number) => void
) {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post<VideoAssetUploadResponse>(
    '/api/video_assets',
    form,
    {
      skipErrorHandler: true,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    }
  )
  return res.data
}

/**
 * Generates images with the signed-in session, charged to the wallet.
 * Returns each image as a URL, turning inline base64 images into data URLs.
 */
export async function generateImages(
  body: ImageGenerationRequest
): Promise<string[]> {
  const res = await api.post<ImageGenerationResponse>(
    '/pg/images/generations',
    body,
    { skipErrorHandler: true }
  )
  const data = res.data.data ?? []
  const items = Array.isArray(data) ? data : [data]
  const urls = items.flatMap((item) => {
    if (item.url) return [item.url]
    if (item.b64_json) return [`data:image/png;base64,${item.b64_json}`]
    return []
  })
  if (urls.length === 0) throw new Error('Image generation failed')
  return urls
}

/**
 * Creates one video task with the signed-in session, charged to the wallet.
 * Returns the task id.
 */
export async function createVideoTask(body: VideoTaskRequest): Promise<string> {
  const res = await api.post<VideoTaskResponse>('/pg/videos', body, {
    skipErrorHandler: true,
  })
  const data = res.data
  if (data.status?.startsWith('failed')) {
    const reason =
      typeof data.error === 'string' ? data.error : data.error?.message
    throw new Error(reason || 'Task submission failed')
  }
  const taskId = data.id ?? data.task_id
  if (!taskId) throw new Error('Task submission failed')
  return taskId
}
