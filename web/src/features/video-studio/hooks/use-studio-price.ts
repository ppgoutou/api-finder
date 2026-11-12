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
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { formatTaskUsageUnitPrice } from '@/features/pricing/lib/dynamic-price'
import { getDisplayGroupRatio } from '@/features/pricing/lib/model-helpers'
import {
  getPerVideoPricing,
  getTokenVideoPricing,
  getVideoPricing,
  VIDEO_PRICE_FRACTION_DIGITS,
} from '@/features/pricing/lib/video-pricing'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  estimateDraftCostUSD,
  estimateVideoCostByExpressionUSD,
} from '../lib/draft'
import { estimateImageCostUSD } from '../lib/image-draft'
import type { StudioDraft } from '../types'

/** Estimated charge of a studio request, after the viewer's group discount. */
export interface StudioPrice {
  /** Formatted in the site currency, for display. */
  label: string
  /** The same charge in USD, comparable with the wallet balance. */
  costUSD: number
}

/**
 * Estimated charge of the draft in the site currency, after the viewer's group
 * discount, or null while prices are loading or the model has no video price.
 */
export function useStudioPrice(draft: StudioDraft): StudioPrice | null {
  const pricing = usePricingData()
  // Prices are formatted in the site currency; re-render when it changes.
  useSystemConfigStore((state) => state.config.currency)

  const model = pricing.models.find(
    (candidate) => candidate.model_name === draft.model
  )
  const videoPricing = model
    ? (getVideoPricing(model) ??
      getPerVideoPricing(model) ??
      getTokenVideoPricing(model))
    : null
  const row = videoPricing?.rows.find(
    (candidate) => candidate.option === draft.resolution
  )
  if (!model) return null

  const hasReferenceVideo =
    draft.mode === 'reference' &&
    draft.references.some((asset) => asset.kind === 'video')
  const inputImages =
    draft.mode === 'reference'
      ? draft.references.filter((asset) => asset.kind === 'image').length
      : [draft.firstFrame, draft.lastFrame].filter(Boolean).length
  // A price the pricing page cannot lay out as a table is run as an expression.
  const costUSD = row
    ? estimateDraftCostUSD(
        row,
        draft.seconds,
        draft.count,
        hasReferenceVideo,
        inputImages
      )
    : estimateVideoCostByExpressionUSD(model, {
        resolution: draft.resolution,
        seconds: draft.seconds,
        count: draft.count,
        hasReferenceVideo,
        inputImages,
      })
  if (costUSD === null) return null
  const groupRatio = getDisplayGroupRatio(model)
  return {
    label: formatTaskUsageUnitPrice(costUSD, {
      tokenUnit: 'M',
      showRechargePrice: false,
      priceRate: pricing.priceRate,
      usdExchangeRate: pricing.usdExchangeRate,
      groupRatioMultiplier: groupRatio,
      fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
    }),
    costUSD: costUSD * groupRatio,
  }
}

/**
 * Estimated charge of an image request in the site currency, after the
 * viewer's group discount, or null while prices are loading or the model's
 * price cannot be evaluated.
 */
export function useStudioImagePrice(
  modelName: string,
  size: string,
  count: number
): StudioPrice | null {
  const pricing = usePricingData()
  useSystemConfigStore((state) => state.config.currency)

  const model = pricing.models.find(
    (candidate) => candidate.model_name === modelName
  )
  const costUSD = model ? estimateImageCostUSD(model, size, count) : null
  if (!model || costUSD === null) return null
  const groupRatio = getDisplayGroupRatio(model)
  return {
    label: formatTaskUsageUnitPrice(costUSD, {
      tokenUnit: 'M',
      showRechargePrice: false,
      priceRate: pricing.priceRate,
      usdExchangeRate: pricing.usdExchangeRate,
      groupRatioMultiplier: groupRatio,
      fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
    }),
    costUSD: costUSD * groupRatio,
  }
}
