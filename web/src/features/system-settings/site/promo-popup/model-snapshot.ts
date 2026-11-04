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
import type { TFunction } from 'i18next'

import {
  formatTaskUsageUnitPrice,
  getDynamicPricingTiers,
} from '@/features/pricing/lib/dynamic-price'
import { getDisplayGroupRatio } from '@/features/pricing/lib/model-helpers'
import { formatPrice, formatRequestPrice } from '@/features/pricing/lib/price'
import {
  getOfficialVideoPricing,
  getPerVideoPricing,
  getTokenVideoPricing,
  getVideoPricing,
  VIDEO_PRICE_FRACTION_DIGITS,
} from '@/features/pricing/lib/video-pricing'
import type { PricingModel } from '@/features/pricing/types'
import { selectLanguageBlock } from '@/lib/language-blocks'

/** Longest description a card stores (controller/promo_popup.go). */
const MAX_DESCRIPTION_LENGTH = 160

export type PromoModelPrice = {
  /** Shown in the price picker, such as `720p`. */
  option: string
  salePrice: string
  originalPrice: string
  unit: string
}

type PriceContext = {
  priceRate: number
  usdExchangeRate: number
  t: TFunction
}

function shortenDescription(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_DESCRIPTION_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`
}

/** The model's description in English and Chinese, short enough for a card. */
export function getPromoModelDescriptions(model: PricingModel) {
  const description = model.description_blocks ?? model.description ?? ''
  return {
    description: shortenDescription(selectLanguageBlock(description, 'en')),
    descriptionZh: shortenDescription(selectLanguageBlock(description, 'zh')),
  }
}

/**
 * What the model sells for, one row per price option. Sale prices always
 * include the group ratio, so the base price never reaches a card; the
 * original price is the published official price and is empty without one.
 */
export function getPromoModelPrices(
  model: PricingModel,
  context: PriceContext
): PromoModelPrice[] {
  const t = context.t
  const ratio = getDisplayGroupRatio(model)
  const format = (value: number) =>
    formatTaskUsageUnitPrice(value, {
      tokenUnit: 'M',
      showRechargePrice: false,
      priceRate: context.priceRate,
      usdExchangeRate: context.usdExchangeRate,
      fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
    })

  const perSecond = getVideoPricing(model) ?? getTokenVideoPricing(model)
  if (perSecond) {
    const official = getOfficialVideoPricing(model)?.rows ?? []
    return perSecond.rows.map((row) => {
      const officialPrice = official.find(
        (item) => item.option === row.option
      )?.secondPrice
      return {
        option: row.option,
        salePrice: format(row.secondPrice * ratio),
        originalPrice: officialPrice ? format(officialPrice) : '',
        unit: `${t('/second')} · ${row.option}`,
      }
    })
  }

  const perVideo = getPerVideoPricing(model)
  if (perVideo) {
    return perVideo.rows.map((row) => ({
      option: row.option,
      salePrice: format((row.videoPrice ?? 0) * ratio),
      originalPrice: '',
      unit: `${t('/video')} · ${row.option}`,
    }))
  }

  const fixedTiers = getDynamicPricingTiers(model).flatMap((tier) =>
    'fixedPrice' in tier && typeof tier.fixedPrice === 'number' ? [tier] : []
  )
  if (fixedTiers.length > 0) {
    return fixedTiers.map((tier) => ({
      option: tier.label,
      salePrice: format((tier.fixedPrice ?? 0) * ratio),
      originalPrice: '',
      unit: tier.imageCount ? t('/image') : t('/request'),
    }))
  }
  if (model.billing_mode === 'tiered_expr') return []

  if (model.quota_type === 1) {
    const price = formatRequestPrice(
      model,
      false,
      context.priceRate,
      context.usdExchangeRate
    )
    return [
      { option: '', salePrice: price, originalPrice: '', unit: t('/request') },
    ]
  }
  const price = formatPrice(
    model,
    'input',
    'M',
    false,
    context.priceRate,
    context.usdExchangeRate
  )
  return [
    { option: '', salePrice: price, originalPrice: '', unit: t('/1M tokens') },
  ]
}
