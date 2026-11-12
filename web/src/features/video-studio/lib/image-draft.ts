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
import type { PricingModel } from '@/features/pricing/types'

import { REFERENCE_LIMITS, type StudioImageModel } from '../constants'
import type { ImageGenerationRequest, StudioAsset } from '../types'
import { studioModelAvailability } from './draft'

/** Image output tokens per pixel, as image models report them. */
const PIXELS_PER_IMAGE_TOKEN = 256

export interface ImageDraft {
  model: string
  prompt: string
  size: string
  count: number
  references: StudioAsset[]
}

/** Models of the public pricing list that serve image generation. */
export function studioImageModelsFromPricing(
  models: readonly PricingModel[]
): StudioImageModel[] {
  return models.flatMap((model) =>
    model.supported_endpoint_types?.includes('image-generation')
      ? [
          {
            name: model.model_name,
            label: modelDisplayName(model),
            ...studioModelAvailability(model),
          },
        ]
      : []
  )
}

/** Width times height of a "2048x2048" size, or 0 when malformed. */
function sizePixels(size: string): number {
  const [width, height] = size.split('x').map(Number)
  return width > 0 && height > 0 ? width * height : 0
}

/**
 * USD charge of the draft before group and recharge adjustments, from the
 * model's billing expression with output tokens derived from the image size.
 * Null when the model has no expression or it cannot be evaluated.
 */
export function estimateImageCostUSD(
  model: PricingModel,
  size: string,
  count: number
): number | null {
  if (model.billing_mode !== 'tiered_expr' || !model.billing_expr) return null
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
export function validateImageDraft(draft: ImageDraft): string | null {
  if (!draft.prompt.trim()) return 'Describe the image you want'
  if (draft.references.some((asset) => asset.status === 'uploading')) {
    return 'Wait for the uploads to finish'
  }
  if (
    draft.references.some((asset) => asset.status !== 'ready' || !asset.url)
  ) {
    return 'Remove the files that failed to upload'
  }
  if (draft.references.length > REFERENCE_LIMITS.image) {
    return 'Too many reference files'
  }
  return null
}

export function buildImageRequest(draft: ImageDraft): ImageGenerationRequest {
  const images = draft.references.flatMap((asset) =>
    asset.url ? [asset.url] : []
  )
  return {
    model: draft.model,
    prompt: draft.prompt.trim(),
    size: draft.size,
    n: draft.count,
    response_format: 'url',
    ...(images.length > 0 ? { image: images } : {}),
  }
}
