import { groupModelsByCategory } from '@/features/pricing/lib/categories'
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
import {
  getPerVideoPricing,
  getTokenVideoPricing,
  getVideoPricing,
} from '@/features/pricing/lib/video-pricing'
import type { PricingCategory, PricingModel } from '@/features/pricing/types'

import {
  DEFAULT_STUDIO_DURATION,
  REFERENCE_LIMITS,
  REFERENCE_TOKEN_NAMES,
  STUDIO_RATIOS,
  type StudioModel,
  type StudioModelAvailability,
} from '../constants'
import type {
  AssetKind,
  StudioAsset,
  StudioDraft,
  StudioRatio,
  VideoTaskRequest,
} from '../types'

/**
 * Models of the public pricing list that the canvas can submit: video models
 * priced per output second, per video or per video token by resolution, in
 * pricing list order.
 */
export function studioModelsFromPricing(
  models: readonly PricingModel[]
): StudioModel[] {
  return models.flatMap((model) => {
    const pricing =
      getVideoPricing(model) ??
      getPerVideoPricing(model) ??
      getTokenVideoPricing(model)
    if (!pricing || pricing.optionField !== 'resolution') return []
    const declaredRatios = model.model_limits?.ratios ?? []
    const durations = model.model_limits?.durations
    return [
      {
        name: model.model_name,
        ...studioModelAvailability(model),
        resolutions: pricing.rows.map((row) => row.option),
        duration: pricing.durationRange ?? DEFAULT_STUDIO_DURATION,
        ...(durations?.length ? { durations } : {}),
        ratios: declaredRatios.length
          ? STUDIO_RATIOS.filter(
              (ratio) => ratio === 'auto' || declaredRatios.includes(ratio)
            )
          : STUDIO_RATIOS,
      },
    ]
  })
}

/** Whether a pricing model is listed but refusing new requests. */
export function studioModelAvailability(
  model: PricingModel
): StudioModelAvailability {
  if (!model.unavailable) return {}
  return {
    unavailable: true,
    unavailableReason: model.unavailable_reason?.trim() || undefined,
  }
}

/**
 * Model to offer in place of an unavailable one: the first available model
 * of the same category, else the first available model.
 */
export function replacementModel<
  T extends StudioModelAvailability & { name: string; group?: string },
>(models: readonly T[], current: T): T | undefined {
  const available = models.filter((model) => !model.unavailable)
  return (
    available.find((model) => model.group === current.group) ?? available[0]
  )
}

/**
 * Studio models in the model plaza's order: by administrator category, each
 * tagged with its category name, then the uncategorized ones by name. The
 * pricing list's own order is not stable between requests, so it is never
 * used as is.
 */
export function inPlazaOrder<T extends { name: string; group?: string }>(
  models: readonly PricingModel[],
  categories: readonly PricingCategory[],
  toStudioModels: (models: readonly PricingModel[]) => T[]
): T[] {
  const byName = [...models].sort((a, b) =>
    a.model_name.localeCompare(b.model_name)
  )
  const sections = groupModelsByCategory(byName, [...categories])
  if (sections.length === 0) return toStudioModels(byName)
  return sections.flatMap((section) =>
    toStudioModels(section.models).map((model) => ({
      ...model,
      group: section.name,
    }))
  )
}

/**
 * The named model, else the first available one, else the first one;
 * undefined when there are none.
 */
export function findStudioModel<
  T extends StudioModelAvailability & { name: string },
>(models: readonly T[], name: string): T | undefined {
  return (
    models.find((model) => model.name === name) ??
    models.find((model) => !model.unavailable) ??
    models[0]
  )
}

/** Prompt token of a reference, such as "图片2" for the second image. */
export function referenceToken(kind: AssetKind, index: number): string {
  return `${REFERENCE_TOKEN_NAMES[kind]}${index + 1}`
}

/** Each reference with its prompt token, numbered per kind. */
export function labelReferences(
  references: StudioAsset[]
): { asset: StudioAsset; token: string }[] {
  const seen: Record<AssetKind, number> = { image: 0, video: 0, audio: 0 }
  return references.map((asset) => {
    const token = referenceToken(asset.kind, seen[asset.kind])
    seen[asset.kind] += 1
    return { asset, token }
  })
}

/**
 * Prompt text after a reference is removed: its "@" mentions disappear and
 * later references of the same kind move down one number, so every remaining
 * mention still points at the same file.
 */
export function removeReferenceFromPrompt(
  prompt: string,
  kind: AssetKind,
  removedIndex: number
): string {
  const name = REFERENCE_TOKEN_NAMES[kind]
  const pattern = new RegExp(`@${name}(\\d+)`, 'g')
  return prompt.replace(pattern, (match, digits: string) => {
    const index = Number(digits) - 1
    if (index === removedIndex) return ''
    if (index > removedIndex) return `@${referenceToken(kind, index - 1)}`
    return match
  })
}

/**
 * The length closest to seconds that the model takes, inside its range and,
 * for a model that lists its lengths, one of them (the shorter on a tie).
 */
export function fitStudioSeconds(model: StudioModel, seconds: number): number {
  const [shortest, longest] = model.duration
  const clamped = Math.min(Math.max(seconds, shortest), longest)
  if (!model.durations?.length) return clamped
  return model.durations.reduce((best, value) =>
    Math.abs(value - clamped) < Math.abs(best - clamped) ? value : best
  )
}

/**
 * Keeps model, ratio, resolution and duration inside what the available
 * models support. Leaves the draft unchanged while there are no models.
 */
export function fitDraftToModel(
  draft: StudioDraft,
  models: readonly StudioModel[]
): StudioDraft {
  const model = findStudioModel(models, draft.model)
  if (!model) return draft
  const ratio: StudioRatio = model.ratios.includes(draft.ratio)
    ? draft.ratio
    : 'auto'
  return {
    ...draft,
    model: model.name,
    ratio,
    resolution: model.resolutions.includes(draft.resolution)
      ? draft.resolution
      : (model.resolutions.at(-1) ?? draft.resolution),
    seconds: fitStudioSeconds(model, draft.seconds),
  }
}

let nextRestoredId = 0

/**
 * Already uploaded files as ready assets, so a past request can go back on
 * the canvas. They show the public URL; once it expires the submission
 * fails and the user uploads the file again.
 */
export function restoredAssets(
  kind: AssetKind,
  urls: readonly string[]
): StudioAsset[] {
  return urls.map((url) => {
    nextRestoredId += 1
    const fileName = decodeURIComponent(
      url.split(/[?#]/)[0].split('/').pop() || url
    )
    return {
      id: `restored-${nextRestoredId}`,
      kind,
      fileName,
      previewUrl: url,
      status: 'ready',
      progress: 100,
      url,
    }
  })
}

/** The draft a submitted video request came from, to edit it again. */
export function draftFromVideoRequest(
  request: VideoTaskRequest
): Partial<StudioDraft> {
  const ratio = STUDIO_RATIOS.find((value) => value === request.ratio) ?? 'auto'
  const draft: Partial<StudioDraft> = {
    model: request.model,
    prompt: request.prompt,
    ratio,
    resolution: request.resolution,
    seconds: request.seconds,
    count: 1,
  }
  if (request.first_image_url) {
    const [firstFrame] = restoredAssets('image', [request.first_image_url])
    const [lastFrame] = restoredAssets(
      'image',
      request.last_image_url ? [request.last_image_url] : []
    )
    return { ...draft, mode: 'frames', firstFrame, lastFrame, references: [] }
  }
  return {
    ...draft,
    mode: 'reference',
    references: [
      ...restoredAssets('image', request.images ?? []),
      ...restoredAssets('video', request.videos ?? []),
      ...restoredAssets('audio', request.audios ?? []),
    ],
  }
}

export function countReferences(
  references: StudioAsset[]
): Record<AssetKind, number> {
  const counts: Record<AssetKind, number> = { image: 0, video: 0, audio: 0 }
  for (const asset of references) counts[asset.kind] += 1
  return counts
}

/** i18n key of the reason the draft cannot be submitted, or null. */
export function validateDraft(draft: StudioDraft): string | null {
  if (!draft.prompt.trim()) return 'Describe the video you want'
  const assets =
    draft.mode === 'frames'
      ? [draft.firstFrame, draft.lastFrame].flatMap((asset) =>
          asset ? [asset] : []
        )
      : draft.references
  if (assets.some((asset) => asset.status === 'uploading')) {
    return 'Wait for the uploads to finish'
  }
  if (assets.some((asset) => asset.status !== 'ready' || !asset.url)) {
    return 'Remove the files that failed to upload'
  }
  if (draft.mode === 'frames') {
    return draft.firstFrame ? null : 'Add a first frame image'
  }
  const counts = countReferences(draft.references)
  for (const kind of Object.keys(counts) as AssetKind[]) {
    if (counts[kind] > REFERENCE_LIMITS[kind]) {
      return 'Too many reference files'
    }
  }
  if (counts.audio > 0 && counts.image + counts.video === 0) {
    return 'Audio needs an image or video reference too'
  }
  return null
}

/** Body of POST /pg/videos for a valid draft already fitted to its model. */
export function buildVideoRequest(fitted: StudioDraft): VideoTaskRequest {
  const body: VideoTaskRequest = {
    model: fitted.model,
    prompt: fitted.prompt.trim(),
    seconds: fitted.seconds,
    resolution: fitted.resolution,
  }
  if (fitted.ratio !== 'auto') body.ratio = fitted.ratio

  if (fitted.mode === 'frames') {
    if (fitted.firstFrame?.url) body.first_image_url = fitted.firstFrame.url
    if (fitted.lastFrame?.url) body.last_image_url = fitted.lastFrame.url
    return body
  }
  const urlsOf = (kind: AssetKind) =>
    fitted.references.flatMap((asset) =>
      asset.kind === kind && asset.url ? [asset.url] : []
    )
  const images = urlsOf('image')
  const videos = urlsOf('video')
  const audios = urlsOf('audio')
  if (images.length) body.images = images
  if (videos.length) body.videos = videos
  if (audios.length) body.audios = audios
  return body
}

export interface PriceRow {
  /** USD per output second. */
  secondPrice: number
  /** USD per million tokens when the request carries a reference video. */
  referencePricePerMillion?: number
  /** USD per output second when the request carries a reference video. */
  referenceSecondPrice?: number
  tokensPerSecond?: number
  /** USD per video of any length, for models billed per video. */
  videoPrice?: number
}

/**
 * Estimated charge in USD before the group discount. Requests with a
 * reference video are billed by tokens on output seconds plus reference
 * seconds, at least 2/3 of the output rounded up, which is how the server
 * settles them while the reference length is unknown. Models with a per-second
 * reference price bill those requests by output seconds alone.
 */
export function estimateDraftCostUSD(
  row: PriceRow,
  seconds: number,
  count: number,
  hasReferenceVideo: boolean
): number {
  if (row.videoPrice !== undefined) return row.videoPrice * count
  if (hasReferenceVideo && row.referenceSecondPrice !== undefined) {
    return row.referenceSecondPrice * seconds * count
  }
  if (
    hasReferenceVideo &&
    row.referencePricePerMillion !== undefined &&
    row.tokensPerSecond
  ) {
    const billedSeconds = seconds + Math.ceil((seconds * 2) / 3)
    const tokens = billedSeconds * row.tokensPerSecond
    return ((tokens * row.referencePricePerMillion) / 1_000_000) * count
  }
  return row.secondPrice * seconds * count
}
