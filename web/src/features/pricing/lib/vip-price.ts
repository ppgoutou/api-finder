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
import type { PricingVipPriceView } from '@/stores/pricing-preferences-store'

import { FILTER_ALL } from '../constants'
import type { PricingModel } from '../types'

/** VIP prices on the cards: VIP prices keep this many decimals. */
export const VIP_VIDEO_PRICE_FRACTION_DIGITS = 3

/** Every VIP group is shown to visitors under this one name. */
export const VIP_DISPLAY_GROUP = 'vip'

/** A standard group, its VIP group, and both ratios on the page's scale. */
export interface VipGroupPair {
  baseGroup: string
  vipGroup: string
  baseRatio: number
  vipRatio: number
}

/** What the pricing page knows about VIP pricing for the viewer. */
export interface VipPriceContext {
  /** Every standard-to-VIP pair, the main pair first. */
  pairs: VipGroupPair[]
  /** The VIP group of the viewer's own pair, compared first. */
  viewerVipGroup: string
  /** Whether the viewer is VIP. */
  isVip: boolean
}

/** The two group ratios a card compares, and how much VIP saves. */
export interface CardVipRatios {
  standardRatio: number
  vipRatio: number
  savingPercent: number
  isVip: boolean
}

/**
 * The standard and VIP group ratios for one model card, from the pair the
 * model offers both groups of: the pair of the group the viewer filtered by,
 * else the viewer's own pair, else the first one. Returns null when no pair
 * fits or its VIP group is not cheaper.
 */
export function getCardVipRatios(
  model: PricingModel,
  selectedGroup: string | undefined,
  vip: VipPriceContext | undefined
): CardVipRatios | null {
  if (!vip) return null
  const groups = Array.isArray(model.enable_groups) ? model.enable_groups : []
  // A model's own group ratios replace the pair's.
  const ownRatios = model.model_group_ratio ?? {}
  const pairs = vip.pairs.map((pair) => ({
    ...pair,
    baseRatio: ownRatios[pair.baseGroup] ?? pair.baseRatio,
    vipRatio: ownRatios[pair.vipGroup] ?? pair.vipRatio,
  }))
  const offered = pairs.filter(
    (pair) =>
      groups.includes(pair.baseGroup) &&
      groups.includes(pair.vipGroup) &&
      pair.vipRatio > 0 &&
      pair.vipRatio < pair.baseRatio
  )
  let pair: VipGroupPair | undefined
  if (selectedGroup !== undefined && selectedGroup !== FILTER_ALL) {
    pair = offered.find(
      (p) => p.baseGroup === selectedGroup || p.vipGroup === selectedGroup
    )
  } else {
    pair = offered.find((p) => p.vipGroup === vip.viewerVipGroup) ?? offered[0]
  }
  if (!pair) return null
  const savingPercent = Math.round((1 - pair.vipRatio / pair.baseRatio) * 100)
  if (savingPercent <= 0) return null
  return {
    standardRatio: pair.baseRatio,
    vipRatio: pair.vipRatio,
    savingPercent,
    isVip: vip.isVip,
  }
}

/**
 * Whether a model with a VIP price shows it: the viewer's switch once they
 * used it, else VIP prices for VIP viewers only.
 */
export function showsVipPrices(
  ratios: CardVipRatios,
  view: PricingVipPriceView | null
): boolean {
  return view === null ? ratios.isVip : view === 'vip'
}
