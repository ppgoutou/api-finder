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
import type { AssetKind, StudioDraft, StudioRatio } from './types'

/** A model listed on the canvas that refuses new requests for now. */
export interface StudioModelAvailability {
  unavailable?: boolean
  /** Administrator note shown while the model is unavailable. */
  unavailableReason?: string
}

export interface StudioModel extends StudioModelAvailability {
  name: string
  /** Name shown in menus; requests still send `name`. */
  label?: string
  /** Category name from the model plaza; empty for uncategorized models. */
  group?: string
  resolutions: readonly string[]
  /** Shortest and longest output, in seconds. */
  duration: readonly [number, number]
  /** The only lengths inside the range the model takes, when it is picky. */
  durations?: readonly number[]
  /** Selectable aspect ratios, 'auto' first. */
  ratios: readonly StudioRatio[]
}

/**
 * Duration range of a video model whose plugin declares none, the same as
 * seedance-2.0.
 */
export const DEFAULT_STUDIO_DURATION: readonly [number, number] = [4, 15]

export const STUDIO_RATIOS: readonly StudioRatio[] = [
  'auto',
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '9:21',
]

/**
 * Ratios of a video model that declares none: the Seedance set, without the
 * 9:21 that only some gateways take.
 */
export const DEFAULT_STUDIO_RATIOS: readonly StudioRatio[] =
  STUDIO_RATIOS.filter((ratio) => ratio !== '9:21')

export const STUDIO_MAX_COUNT = 4

/** Most reference files of each kind one request can carry. */
export const REFERENCE_LIMITS: Readonly<Record<AssetKind, number>> = {
  image: 9,
  video: 3,
  audio: 3,
}

/** Upload limits mirrored from the server (controller/video_asset.go). */
export const ASSET_MAX_BYTES: Readonly<Record<AssetKind, number>> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
}

export const ASSET_ACCEPT: Readonly<Record<AssetKind, string>> = {
  image: 'image/jpeg,image/png,image/webp',
  video: 'video/mp4,video/quicktime',
  audio: 'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a',
}

/** Days an uploaded reference file stays available. */
export const ASSET_RETENTION_DAYS = 7

/**
 * Prompt tokens that point at a reference, numbered per kind in upload order:
 * "@图片1" is the first image. The model reads these names, so they stay the
 * same in every interface language.
 */
export const REFERENCE_TOKEN_NAMES: Readonly<Record<AssetKind, string>> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

export const DEFAULT_DRAFT: StudioDraft = {
  mode: 'reference',
  model: 'seedance-2.0',
  prompt: '',
  ratio: 'auto',
  resolution: '720p',
  seconds: 5,
  count: 1,
  references: [],
}

export interface StudioImageModel extends StudioModelAvailability {
  name: string
  /** Name shown in menus; requests still send `name`. */
  label?: string
  /** Category name from the model plaza; empty for uncategorized models. */
  group?: string
}

/** Output sizes offered for image generation, as width x height. */
export const STUDIO_IMAGE_SIZES: readonly { value: string; ratio: string }[] = [
  { value: '2048x2048', ratio: '1:1' },
  { value: '2304x1728', ratio: '4:3' },
  { value: '1728x2304', ratio: '3:4' },
  { value: '2560x1440', ratio: '16:9' },
  { value: '1440x2560', ratio: '9:16' },
  { value: '1024x1024', ratio: '1:1' },
]

export const DEFAULT_IMAGE_SIZE = '2048x2048'

/** Most images one image request may ask for. */
export const STUDIO_MAX_IMAGE_COUNT = 4

/** localStorage key of the images generated in this browser. */
export const STUDIO_IMAGE_WORKS_KEY = 'video-studio:image-works'

/** Most generated images remembered in this browser. */
export const STUDIO_IMAGE_WORKS_LIMIT = 60

/** Query key of the user's latest video tasks. */
export const STUDIO_WORKS_QUERY_KEY = ['video-studio', 'works'] as const
export const STUDIO_BALANCE_QUERY_KEY = ['video-studio', 'balance'] as const
