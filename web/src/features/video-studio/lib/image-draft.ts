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
import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime'
import { modelDisplayName } from '@/features/pricing/lib/model-helpers'
import { IMAGE_COUNT_FIELD } from '@/features/pricing/lib/video-pricing'
import type { PricingModel } from '@/features/pricing/types'

import {
  REFERENCE_LIMITS,
  type StudioImageModel,
  type StudioImagePluginOptions,
} from '../constants'
import type { ImageGenerationRequest, StudioAsset } from '../types'
import { studioModelAvailability } from './draft'

/** Image output tokens per pixel, as image models report them. */
const PIXELS_PER_IMAGE_TOKEN = 256

export interface ImageDraft {
  model: string
  prompt: string
  /** Width x height, or a size tier of a plugin model; empty for neither. */
  size: string
  /** Aspect ratio of a plugin model. */
  ratio?: string
  count: number
  references: StudioAsset[]
}

/** Options of an image model served by a task plugin, or undefined. */
function pluginImageOptions(
  model: PricingModel
): StudioImagePluginOptions | undefined {
  const schema = model.billing_usage_schema
  if (!schema?.[IMAGE_COUNT_FIELD]) return undefined
  return {
    resolutions: schema.resolution?.enum ?? [],
    ratios: model.model_limits?.ratios ?? [],
    maxReferences: model.model_limits?.maxReferenceImages ?? 0,
  }
}

/** Models of the public pricing list that serve image generation. */
export function studioImageModelsFromPricing(
  models: readonly PricingModel[]
): StudioImageModel[] {
  return models.flatMap((model) => {
    if (!model.supported_endpoint_types?.includes('image-generation')) return []
    const plugin = pluginImageOptions(model)
    return [
      {
        name: model.model_name,
        label: modelDisplayName(model),
        ...studioModelAvailability(model),
        ...(plugin ? { plugin } : {}),
      },
    ]
  })
}

/** Width times height of a "2048x2048" size, or 0 when malformed. */
function sizePixels(size: string): number {
  const [width, height] = size.split('x').map(Number)
  return width > 0 && height > 0 ? width * height : 0
}

/**
 * USD charge of the draft before group and recharge adjustments, from the
 * model's billing expression: usage facts for a model served by a task plugin,
 * else output tokens derived from the image size.
 * Null when the model has no expression or it cannot be evaluated.
 */
export function estimateImageCostUSD(
  model: PricingModel,
  size: string,
  count: number
): number | null {
  if (model.billing_mode !== 'tiered_expr' || !model.billing_expr) return null
  const plugin = pluginImageOptions(model)
  if (plugin) {
    const usage: Record<string, number | string> = { [IMAGE_COUNT_FIELD]: 1 }
    if (plugin.resolutions.length > 0) usage.resolution = size
    const result = evaluateBillingExpression(model.billing_expr, { usage })
    // Task usage prices are per unit, so the cost is already in USD.
    return result.status === 'success' ? result.cost * count : null
  }
  const tokensPerImage = sizePixels(size) / PIXELS_PER_IMAGE_TOKEN
  const result = evaluateBillingExpression(model.billing_expr, {
    imageCount: count,
    tokens: { c: tokensPerImage * count },
  })
  if (result.status !== 'success') return null
  // The runtime scales every price, fixed ones included, per million.
  return result.cost / 1_000_000
}

/** Reason the image draft cannot be submitted, as an i18n key, or null. */
export function validateImageDraft(
  draft: ImageDraft,
  plugin?: StudioImagePluginOptions
): string | null {
  if (!draft.prompt.trim()) return 'Describe the image you want'
  if (draft.references.some((asset) => asset.status === 'uploading')) {
    return 'Wait for the uploads to finish'
  }
  if (
    draft.references.some((asset) => asset.status !== 'ready' || !asset.url)
  ) {
    return 'Remove the files that failed to upload'
  }
  const maxReferences = plugin?.maxReferences ?? REFERENCE_LIMITS.image
  if (draft.references.length > maxReferences) {
    return 'Too many reference files'
  }
  return null
}

/** Output shape a plugin model takes, closest to what the user picked. */
export function fitPluginImageShape(
  plugin: StudioImagePluginOptions,
  size: string,
  ratio: string
): { size: string; ratio: string } {
  const defaultRatio = plugin.ratios.includes('1:1')
    ? '1:1'
    : (plugin.ratios[0] ?? '')
  return {
    size: plugin.resolutions.includes(size)
      ? size
      : (plugin.resolutions[0] ?? ''),
    ratio: plugin.ratios.includes(ratio) ? ratio : defaultRatio,
  }
}

/** How a generated image's shape is remembered, such as "2K 16:9". */
export function imageShapeLabel(request: ImageGenerationRequest): string {
  return [request.size, request.aspect_ratio].filter(Boolean).join(' ')
}

/**
 * Requests that generate the draft's images: plugin models draw one image per
 * request, the others take the count in a single request.
 */
export function buildImageRequests(
  draft: ImageDraft,
  plugin?: StudioImagePluginOptions
): ImageGenerationRequest[] {
  const request = buildImageRequest(draft)
  if (!plugin) return [request]
  return Array.from({ length: draft.count }, () => ({ ...request, n: 1 }))
}

export function buildImageRequest(draft: ImageDraft): ImageGenerationRequest {
  const images = draft.references.flatMap((asset) =>
    asset.url ? [asset.url] : []
  )
  return {
    model: draft.model,
    prompt: draft.prompt.trim(),
    ...(draft.size ? { size: draft.size } : {}),
    ...(draft.ratio ? { aspect_ratio: draft.ratio } : {}),
    n: draft.count,
    response_format: 'url',
    ...(images.length > 0 ? { image: images } : {}),
  }
}
