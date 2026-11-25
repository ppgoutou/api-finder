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
import type { TaskLog } from '@/features/usage-logs/types'

import type { VideoTaskRequest } from '../types'

/** What the server keeps of a task submitted on the creation page. */
export interface ConsoleRequest {
  model: string
  prompt: string
  seconds?: number
  resolution?: string
  ratio?: string
  size?: string
  aspect_ratio?: string
  image?: string[]
  images?: string[]
  videos?: string[]
  audios?: string[]
  first_image_url?: string
  last_image_url?: string
}

/** The request the server kept with the task, or null when it kept none. */
export function consoleRequestOf(task: TaskLog): ConsoleRequest | null {
  const raw = task.properties?.console_request
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ConsoleRequest | null
    if (typeof parsed?.prompt !== 'string') return null
    return typeof parsed.model === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** The kept request as a video request, or null when it is not one. */
export function videoRequestOf(
  request: ConsoleRequest | null
): VideoTaskRequest | null {
  if (!request?.seconds || !request.resolution) return null
  return {
    model: request.model,
    prompt: request.prompt,
    seconds: request.seconds,
    resolution: request.resolution,
    ...(request.ratio ? { ratio: request.ratio } : {}),
    ...(request.images ? { images: request.images } : {}),
    ...(request.videos ? { videos: request.videos } : {}),
    ...(request.audios ? { audios: request.audios } : {}),
    ...(request.first_image_url
      ? { first_image_url: request.first_image_url }
      : {}),
    ...(request.last_image_url
      ? { last_image_url: request.last_image_url }
      : {}),
  }
}
