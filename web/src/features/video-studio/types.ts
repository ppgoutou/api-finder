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

export type AssetKind = 'image' | 'video' | 'audio'

/** A reference file on the canvas, uploaded or still uploading. */
export interface StudioAsset {
  /** Local id, stable while the file stays on the canvas. */
  id: string
  kind: AssetKind
  fileName: string
  /** Object URL of the local file, for the thumbnail. */
  previewUrl: string
  status: 'uploading' | 'ready' | 'error'
  progress: number
  /** Public URL returned by the upload, once ready. */
  url?: string
  error?: string
}

export type StudioMode = 'reference' | 'frames'

/** Ratio sent to the API; 'auto' leaves the choice to the model. */
export type StudioRatio =
  | 'auto'
  | '21:9'
  | '16:9'
  | '4:3'
  | '1:1'
  | '3:4'
  | '9:16'
  | '9:21'

export interface StudioDraft {
  mode: StudioMode
  model: string
  prompt: string
  ratio: StudioRatio
  resolution: string
  seconds: number
  count: number
  /** Reference mode: images, videos and audio in upload order. */
  references: StudioAsset[]
  /** Frames mode: first frame (required) and last frame (optional). */
  firstFrame?: StudioAsset
  lastFrame?: StudioAsset
}

/** What the studio creates: a video task or a batch of images. */
export type StudioKind = 'video' | 'image'

/** Request body of POST /pg/images/generations. */
export interface ImageGenerationRequest {
  model: string
  prompt: string
  size: string
  n: number
  response_format: 'url'
  /** Public URLs of reference images, for image-to-image models. */
  image?: string[]
}

export interface ImageGenerationResponse {
  data?:
    | { url?: string; b64_json?: string }[]
    | { url?: string; b64_json?: string }
}

/** A generated image kept in this browser's works list. */
export interface StudioImage {
  id: string
  /** Upstream URL, which expires after a while, or an inline data URL. */
  url: string
  prompt: string
  model: string
  size: string
  /** Public URLs of the reference images the request carried. */
  references?: string[]
  /** Unix seconds. */
  createdAt: number
}

/** Request body of POST /pg/videos. */
export interface VideoTaskRequest {
  model: string
  prompt: string
  seconds: number
  resolution: string
  ratio?: string
  images?: string[]
  videos?: string[]
  audios?: string[]
  first_image_url?: string
  last_image_url?: string
}

export interface VideoAssetUploadResponse {
  success: boolean
  message?: string
  data?: {
    url: string
    content_type: string
    size: number
    expires_at: number
  }
}

export interface VideoTaskResponse {
  id?: string
  task_id?: string
  status?: string
  error?: { message?: string } | string
}
