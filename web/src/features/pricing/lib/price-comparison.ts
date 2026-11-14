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
import type { PricingModel } from '../types'
import { splitBillingExprAndRequestRules } from './billing-expr'
import { getTaskEnumFields, getTaskNumberFields } from './task-expr'
import { getTaskPricingDisplayTiers } from './task-matrix-display'
import {
  getOfficialVideoPricing,
  getVideoPricing,
  VIDEO_TOKENS_PER_SECOND,
  videoTokensPerSecond,
  type VideoPricing,
} from './video-pricing'

/** One price per (resolution, reference video) pair, in USD before group ratios. */
export type ComparisonPrice = {
  /** USD per output second. */
  second?: number
  /** USD per million video tokens. */
  perMillion?: number
  /** Whether the reference video seconds are billed too, as video tokens. */
  billsReferenceTokens: boolean
}

export type PriceComparisonRow = {
  key: string
  option: string
  withVideo: boolean
  tokensPerSecond?: number
  ours?: ComparisonPrice
  official?: ComparisonPrice
}

export type PriceComparison = {
  optionField: string
  rows: PriceComparisonRow[]
}

const REFERENCE_SWITCH_FIELD = 'video_input'

function isPlainSwitchValue(value: string | undefined): boolean {
  return value === undefined || value === 'none' || value === 'false'
}

/**
 * Token prices of a model billed by video tokens, keyed `<option>|<0|1>` by
 * whether the order has a reference video. Null for any other schema.
 */
function tokenBilledPrices(
  model: PricingModel,
  expression: string | null | undefined
): { optionField: string; prices: Map<string, number> } | null {
  const schema = model.billing_usage_schema
  const numberFields = getTaskNumberFields(schema)
  if (
    !schema ||
    !expression?.trim() ||
    numberFields.length !== 1 ||
    numberFields[0][1].unit !== 'token'
  ) {
    return null
  }
  const tokensField = numberFields[0][0]
  const optionEntry = getTaskEnumFields(schema).find((entry) =>
    entry[1].enum?.every((value) => VIDEO_TOKENS_PER_SECOND[value])
  )
  if (!optionEntry) return null
  const split = splitBillingExprAndRequestRules(expression)
  if (split.requestRuleExpr?.trim()) return null
  const optionField = optionEntry[0]
  const options = optionEntry[1].enum ?? []
  const prices = new Map<string, number>()
  for (const tier of getTaskPricingDisplayTiers(split.billingExpr, schema)) {
    if (
      tier.constant !== 0 ||
      Object.keys(tier.unitPrices).some((field) => field !== tokensField)
    ) {
      return null
    }
    const option =
      tier.conditions.find((condition) => condition.field === optionField)
        ?.value ?? (options.length === 1 ? options[0] : undefined)
    if (option === undefined || !options.includes(option)) continue
    if (
      tier.conditions.some(
        (condition) =>
          condition.field !== optionField &&
          condition.field !== REFERENCE_SWITCH_FIELD &&
          !isPlainSwitchValue(condition.value)
      )
    ) {
      continue
    }
    const switchValue = tier.conditions.find(
      (condition) => condition.field === REFERENCE_SWITCH_FIELD
    )?.value
    const key = `${option}|${isPlainSwitchValue(switchValue) ? 0 : 1}`
    if (!prices.has(key)) prices.set(key, tier.unitPrices[tokensField] ?? 0)
  }
  return prices.size > 0 ? { optionField, prices } : null
}

function fromPerMillion(
  perMillion: number,
  tokensPerSecond: number | undefined
): ComparisonPrice {
  return {
    perMillion,
    second: tokensPerSecond ? (perMillion * tokensPerSecond) / 1e6 : undefined,
    billsReferenceTokens: true,
  }
}

function fromSecond(
  second: number,
  tokensPerSecond: number | undefined,
  billsReferenceTokens: boolean
): ComparisonPrice {
  return {
    second,
    perMillion: tokensPerSecond ? (second / tokensPerSecond) * 1e6 : undefined,
    billsReferenceTokens,
  }
}

/** Plain and reference-video prices of one per-option table, keyed like tokenBilledPrices. */
function secondTablePrices(
  pricing: VideoPricing,
  tokensPerSecondOf: (option: string) => number | undefined,
  referenceTokensBilled: boolean
): Map<string, ComparisonPrice> {
  const prices = new Map<string, ComparisonPrice>()
  for (const row of pricing.rows) {
    if (row.videoPrice !== undefined) continue
    const tps = tokensPerSecondOf(row.option)
    prices.set(`${row.option}|0`, fromSecond(row.secondPrice, tps, false))
    if (row.referencePricePerMillion !== undefined) {
      prices.set(
        `${row.option}|1`,
        fromPerMillion(row.referencePricePerMillion, tps)
      )
    } else if (row.referenceSecondPrice !== undefined) {
      prices.set(
        `${row.option}|1`,
        fromSecond(row.referenceSecondPrice, tps, referenceTokensBilled)
      )
    }
  }
  return prices
}

/**
 * The site's price beside the vendor's published price for every resolution,
 * with and without a reference video, in USD before group and recharge
 * adjustments. Null unless the model is a video model with an official price.
 */
export function getPriceComparison(
  model: PricingModel
): PriceComparison | null {
  const officialPricing = getOfficialVideoPricing(model)
  if (!officialPricing) return null
  const optionField = officialPricing.optionField
  const tokensPerSecondOf = (option: string) =>
    videoTokensPerSecond(model, optionField, option)

  // A model billed by video tokens bills the reference seconds too; the
  // vendor's table lists its prices per output second.
  const tokenBilled = tokenBilledPrices(model, model.billing_expr)
  let ours: Map<string, ComparisonPrice>
  if (tokenBilled) {
    ours = new Map(
      [...tokenBilled.prices].map(([key, perMillion]) => [
        key,
        fromPerMillion(perMillion, tokensPerSecondOf(key.split('|')[0])),
      ])
    )
  } else {
    const secondPricing = getVideoPricing(model)
    if (!secondPricing || secondPricing.optionField !== optionField) {
      return null
    }
    ours = secondTablePrices(secondPricing, tokensPerSecondOf, false)
  }
  // Vendors bill a reference video's seconds as video tokens too, so an
  // official with-video price always covers the reference seconds.
  const official = secondTablePrices(officialPricing, tokensPerSecondOf, true)

  const options =
    model.billing_usage_schema?.[optionField]?.enum ??
    officialPricing.rows.map((row) => row.option)
  const rows: PriceComparisonRow[] = []
  for (const option of options) {
    for (const withVideo of [false, true]) {
      const key = `${option}|${withVideo ? 1 : 0}`
      const ourPrice = ours.get(key)
      if (!ourPrice) continue
      rows.push({
        key,
        option,
        withVideo,
        tokensPerSecond: tokensPerSecondOf(option),
        ours: ourPrice,
        official: official.get(key),
      })
    }
  }
  return rows.length > 0 ? { optionField, rows } : null
}

/** Our price as a fraction of the official one, or undefined when either is missing. */
export function priceRatio(
  ours: number | undefined,
  official: number | undefined
): number | undefined {
  if (ours === undefined || official === undefined || official <= 0) {
    return undefined
  }
  return ours / official
}

/**
 * USD cost of an order with `outputSeconds` of video and, for a reference
 * row, `referenceSeconds` of reference video.
 */
export function comparisonOrderCost(
  price: ComparisonPrice | undefined,
  tokensPerSecond: number | undefined,
  outputSeconds: number,
  referenceSeconds: number
): number | undefined {
  if (!price) return undefined
  if (price.billsReferenceTokens && referenceSeconds > 0) {
    if (price.perMillion === undefined || !tokensPerSecond) return undefined
    return (
      ((outputSeconds + referenceSeconds) * tokensPerSecond * price.perMillion) /
      1e6
    )
  }
  if (price.second === undefined) return undefined
  return price.second * outputSeconds
}

/** Seconds of the order a row's discount is measured on when the two sides bill differently. */
export const COMPARISON_ORDER_SECONDS = 5

/**
 * Our price over the official one for a row. Rows whose sides bill a
 * reference video differently (output seconds only against output plus
 * reference tokens) compare a whole 5 s output + 5 s reference order instead
 * of unit prices.
 */
export function rowPriceRatio(
  row: PriceComparisonRow,
  unit: 'second' | 'perMillion',
  groupRatio: number
): number | undefined {
  if (
    row.withVideo &&
    row.ours &&
    row.official &&
    row.ours.billsReferenceTokens !== row.official.billsReferenceTokens
  ) {
    const ours = comparisonOrderCost(
      row.ours,
      row.tokensPerSecond,
      COMPARISON_ORDER_SECONDS,
      COMPARISON_ORDER_SECONDS
    )
    return priceRatio(
      ours === undefined ? undefined : ours * groupRatio,
      comparisonOrderCost(
        row.official,
        row.tokensPerSecond,
        COMPARISON_ORDER_SECONDS,
        COMPARISON_ORDER_SECONDS
      )
    )
  }
  const ours = row.ours?.[unit]
  return priceRatio(
    ours === undefined ? undefined : ours * groupRatio,
    row.official?.[unit]
  )
}

/** Whether a usage fact marks an order made from a reference video. */
export function isReferenceVideoFact(field: string, value: unknown): boolean {
  if (field === REFERENCE_SWITCH_FIELD) {
    return value === true || (typeof value === 'string' && !isPlainSwitchValue(value))
  }
  return field === 'input_video_seconds' && typeof value === 'number' && value > 0
}
