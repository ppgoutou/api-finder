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
import { QUOTA_TYPE_VALUES } from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { formatTaskUsageUnitPrice } from '@/features/pricing/lib/dynamic-price'
import {
  getDisplayGroupRatio,
  isImagePricingModel,
} from '@/features/pricing/lib/model-helpers'
import {
  getModelDurationRange,
  getOfficialVideoPricing,
  getPerVideoPricing,
  getTokenVideoPricing,
  getVideoPricing,
  VIDEO_PRICE_FRACTION_DIGITS,
} from '@/features/pricing/lib/video-pricing'
import type { PricingCategory } from '@/features/pricing/types'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { getPriceDiscount, type PriceDiscount } from '../lib/video-home'

export type SeriesPriceRow = {
  /** Resolution of a per-second row; the model name of a per-image row. */
  option: string
  /**
   * Formatted lowest price per second, per video for the per-video row, or
   * per image for an image series.
   */
  price: string
  /** Model that offers the price. */
  modelName: string
  /** The price is converted from video tokens, so it is an estimate. */
  approximate: boolean
  /**
   * Admin-configured official price per second for this resolution, from
   * any model of the category; null when none is configured.
   */
  officialPrice: string | null
  /** Discount of the price against the official price, if any. */
  discount: PriceDiscount | null
}

export type VideoSeriesPricing = {
  /** Name of the model square category the prices come from. */
  name: string
  /**
   * What the rows price: generated seconds for a video series, or generated
   * images for an image series, whose rows are its models in category order.
   */
  unit: 'second' | 'image'
  /**
   * Sibling categories named after this one (for example "Mini" and "fast"
   * for Seedance 2.0 Mini and Seedance 2.0 fast); listed, never priced.
   */
  variants: string[]
  isNew: boolean
  /** Lowest per-second price for each resolution, in resolution order. */
  rows: SeriesPriceRow[]
  /** Cheapest of the rows, for the card headline. */
  lowest: SeriesPriceRow | null
  /** Cheapest option among models billed per video. */
  perVideo: SeriesPriceRow | null
  durationRange?: readonly [number, number]
  aspectRatioCount: number
}

type PriceCandidate = Omit<SeriesPriceRow, 'officialPrice' | 'discount'> & {
  value: number
}

/** Sort key of a lowercase resolution option: 480p < 768p < 1080p < 2k < 4k. */
function resolutionRank(option: string): number {
  const kilo = /^(\d+(?:\.\d+)?)k$/.exec(option)
  if (kilo) return Number(kilo[1]) * 1000
  const lines = /^(\d+)p$/.exec(option)
  if (lines) return Number(lines[1])
  return Number.POSITIVE_INFINITY
}

/**
 * The category a variant category is named after: "Seedance 2.0 fast" and
 * "Seedance 2.0 -NSFW" both belong to "Seedance 2.0". An empty category is
 * nobody's parent, so its variants still get cards of their own.
 */
function findParentCategory(
  category: PricingCategory,
  categories: PricingCategory[]
): PricingCategory | undefined {
  const name = category.name.toLowerCase()
  let parent: PricingCategory | undefined
  for (const other of categories) {
    const prefix = other.name.toLowerCase()
    const isNamedAfter =
      other.models.length > 0 &&
      name.length > prefix.length &&
      name.startsWith(prefix) &&
      /[\s-]/.test(name[prefix.length])
    // The longest matching name is the closest parent.
    if (isNamedAfter && (!parent || prefix.length > parent.name.length)) {
      parent = other
    }
  }
  return parent
}

/**
 * A lower price wins, except that an exact price keeps its place against an
 * estimate that displays the same, so token-billed models only show when
 * they are visibly cheaper.
 */
function isBetterPrice(
  candidate: PriceCandidate,
  best: PriceCandidate | undefined
): boolean {
  if (!best) return true
  if (candidate.price === best.price) {
    return best.approximate && !candidate.approximate
  }
  return candidate.value < best.value
}

/**
 * Live lowest prices of every video and image model category in the model
 * square, in
 * the category order the admin set. Each card prices only the models of its
 * own category; variant categories named after it (Seedance 2.0 fast, Seedance
 * 2.0 Mini, Seedance 2.0 -NSFW) are listed by name but never set its price.
 * An image category lists each per-image model with its price. Categories
 * with no priced model the viewer can buy are left out.
 */
export function useVideoSeriesPricing(): VideoSeriesPricing[] {
  const pricing = usePricingData()
  // Prices are formatted in the site currency; re-render when it changes.
  useSystemConfigStore((state) => state.config.currency)

  const formatPrice = (value: number) =>
    formatTaskUsageUnitPrice(value, {
      tokenUnit: 'M',
      showRechargePrice: false,
      priceRate: pricing.priceRate,
      usdExchangeRate: pricing.usdExchangeRate,
      fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
    })

  const categories = pricing.categories
  return categories.flatMap((series): VideoSeriesPricing[] => {
    if (findParentCategory(series, categories)) return []
    const modelNames = new Set(series.models)
    // An unavailable model can't be bought, so it never sets a series price.
    const models = pricing.models.filter(
      (model) => modelNames.has(model.model_name) && !model.unavailable
    )
    const variants = categories.flatMap((category) =>
      category.models.length > 0 &&
      findParentCategory(category, categories) === series
        ? [category.name.slice(series.name.length).replace(/^[\s-]+/, '')]
        : []
    )
    const isNew = Object.values(series.badges ?? {}).some((badges) =>
      badges.includes('new')
    )

    const imageRows: PriceCandidate[] = []
    for (const model of models) {
      if (
        !isImagePricingModel(model) ||
        model.quota_type !== QUOTA_TYPE_VALUES.REQUEST ||
        !(model.model_price && model.model_price > 0)
      ) {
        continue
      }
      const value = model.model_price * getDisplayGroupRatio(model)
      imageRows.push({
        option: model.model_name,
        price: formatPrice(value),
        modelName: model.model_name,
        approximate: false,
        value,
      })
    }
    // Image rows list models in the order the admin set for the category.
    imageRows.sort(
      (a, b) =>
        series.models.indexOf(a.modelName) - series.models.indexOf(b.modelName)
    )

    const bestByOption = new Map<string, PriceCandidate>()
    const officialByOption = new Map<string, number>()
    let perVideo: PriceCandidate | undefined
    let minDuration = Infinity
    let maxDuration = 0
    const aspectRatios = new Set<string>()
    for (const model of models) {
      const ratio = getDisplayGroupRatio(model)
      const exact = getVideoPricing(model)
      const secondPricing = exact ?? getTokenVideoPricing(model)
      for (const row of secondPricing?.rows ?? []) {
        // Plugins spell options differently (768p, 768P); one row per option.
        const option = row.option.toLowerCase()
        const value = row.secondPrice * ratio
        const candidate: PriceCandidate = {
          option,
          price: formatPrice(value),
          modelName: model.model_name,
          approximate: !exact,
          value,
        }
        if (isBetterPrice(candidate, bestByOption.get(option))) {
          bestByOption.set(option, candidate)
        }
      }
      for (const row of getPerVideoPricing(model)?.rows ?? []) {
        const value = (row.videoPrice ?? 0) * ratio
        const candidate: PriceCandidate = {
          option: row.option.toLowerCase(),
          price: formatPrice(value),
          modelName: model.model_name,
          approximate: false,
          value,
        }
        if (isBetterPrice(candidate, perVideo)) perVideo = candidate
      }
      // The official price is display-only, so group ratios never apply.
      for (const row of getOfficialVideoPricing(model)?.rows ?? []) {
        const option = row.option.toLowerCase()
        if (!officialByOption.has(option) && row.secondPrice > 0) {
          officialByOption.set(option, row.secondPrice)
        }
      }
      const range = getModelDurationRange(model)
      if (range) {
        minDuration = Math.min(minDuration, range[0])
        maxDuration = Math.max(maxDuration, range[1])
      }
      for (const aspectRatio of model.model_limits?.ratios ?? []) {
        aspectRatios.add(aspectRatio)
      }
    }
    if (bestByOption.size === 0 && !perVideo) {
      if (imageRows.length === 0) return []
      const cheapest = imageRows.reduce((low, row) =>
        row.value < low.value ? row : low
      )
      const toImageRow = (candidate: PriceCandidate): SeriesPriceRow => ({
        option: candidate.option,
        price: candidate.price,
        modelName: candidate.modelName,
        approximate: false,
        officialPrice: null,
        discount: null,
      })
      return [
        {
          name: series.name,
          unit: 'image',
          variants,
          isNew,
          rows: imageRows.map(toImageRow),
          lowest: toImageRow(cheapest),
          perVideo: null,
          aspectRatioCount: 0,
        },
      ]
    }

    const toRow = (candidate: PriceCandidate): SeriesPriceRow => {
      const official = officialByOption.get(candidate.option)
      return {
        option: candidate.option,
        price: candidate.price,
        modelName: candidate.modelName,
        approximate: candidate.approximate,
        officialPrice: official ? formatPrice(official) : null,
        discount: official
          ? getPriceDiscount(candidate.value / official)
          : null,
      }
    }

    const ranked = [...bestByOption.values()].sort(
      (a, b) => resolutionRank(a.option) - resolutionRank(b.option)
    )
    const lowest = ranked.reduce<PriceCandidate | undefined>(
      (low, row) => (!low || row.value < low.value ? row : low),
      undefined
    )
    return [
      {
        name: series.name,
        unit: 'second',
        variants,
        isNew,
        rows: ranked.map(toRow),
        lowest: lowest ? toRow(lowest) : null,
        perVideo: perVideo
          ? { ...toRow(perVideo), officialPrice: null, discount: null }
          : null,
        durationRange:
          maxDuration > 0 ? ([minDuration, maxDuration] as const) : undefined,
        aspectRatioCount: aspectRatios.size,
      },
    ]
  })
}
