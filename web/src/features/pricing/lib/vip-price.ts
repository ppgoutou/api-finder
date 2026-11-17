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
import { FILTER_ALL } from '../constants'
import type { PricingModel } from '../types'

/** VIP prices on the cards: VIP prices keep this many decimals. */
export const VIP_VIDEO_PRICE_FRACTION_DIGITS = 3

/** What the pricing page knows about VIP pricing for the viewer. */
export interface VipPriceContext {
  /** Group VIP users bill in. */
  group: string
  /** VIP group ratio, scaled like the page's other group ratios. */
  displayRatio: number
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
 * The standard and VIP group ratios for one model card. The standard ratio is
 * the cheapest non-VIP group the model offers the viewer, or the group the
 * viewer filtered by. Returns null when the model has no VIP group or VIP is
 * not cheaper.
 */
export function getCardVipRatios(
  model: PricingModel,
  selectedGroup: string | undefined,
  vip: VipPriceContext | undefined
): CardVipRatios | null {
  if (!vip || !(vip.displayRatio > 0)) return null
  const groups = Array.isArray(model.enable_groups) ? model.enable_groups : []
  if (!groups.includes(vip.group)) return null
  const ratios = model.group_ratio ?? {}
  // The page's own VIP ratio shares the prices' scale: administrators read
  // base prices with raw ratios, everyone else published ones. The membership
  // ratio is always published, so it only stands in when the page has none,
  // as for visitors who cannot use the VIP group.
  const pageVipRatio = ratios[vip.group]
  const vipRatio =
    typeof pageVipRatio === 'number' &&
    Number.isFinite(pageVipRatio) &&
    pageVipRatio > 0
      ? pageVipRatio
      : vip.displayRatio

  let standardRatio = Number.POSITIVE_INFINITY
  const filtered =
    selectedGroup !== undefined &&
    selectedGroup !== FILTER_ALL &&
    selectedGroup !== vip.group &&
    groups.includes(selectedGroup)
  for (const group of filtered ? [selectedGroup] : groups) {
    const ratio = ratios[group]
    if (group === vip.group || typeof ratio !== 'number') continue
    if (Number.isFinite(ratio) && ratio > 0) {
      standardRatio = Math.min(standardRatio, ratio)
    }
  }
  if (!Number.isFinite(standardRatio) || vipRatio >= standardRatio) {
    return null
  }
  const savingPercent = Math.round((1 - vipRatio / standardRatio) * 100)
  if (savingPercent <= 0) return null
  return {
    standardRatio,
    vipRatio,
    savingPercent,
    isVip: vip.isVip,
  }
}
