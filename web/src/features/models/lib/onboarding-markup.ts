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
import type { ParsedTaskTier } from '@/features/pricing/lib/billing-expr'
import { getTaskPricingDisplayTiers } from '@/features/pricing/lib/task-matrix-display'
import {
  getOfficialVideoPricing,
  VIDEO_TOKENS_PER_SECOND,
  videoTokensPerSecond,
  type VideoPricing,
} from '@/features/pricing/lib/video-pricing'
import type {
  BillingUsageExample,
  BillingUsageSchema,
  PricingCategory,
  PricingModel,
} from '@/features/pricing/types'

import type { TierMarkup } from '../types'

/**
 * One price tier of a video model, in USD per second of video, or the fixed
 * price of a model, in USD per request (per image).
 */
export type MarkupRow = {
  /** The tier name in the expression, which keys its markup. */
  tier: string
  /** Absent for a fixed price. */
  source?: ParsedTaskTier
  field: string
  /** Set for a token-priced tier; its per-second prices assume this rate. */
  tokensPerSecond?: number
  /** Supplier price per second, before the group ratio. */
  supply: number
  /**
   * A reference-video token tier: its tokens cover the reference video as
   * well as the output, so its per-second price applies to both.
   */
  reference: boolean
}

/**
 * Per-second rows of a video expression that a markup can raise: each tier
 * prices exactly one usage field, in seconds or in tokens at a known
 * resolution. Other expressions return no rows.
 */
export function markupRows(
  expression: string | undefined,
  schema: BillingUsageSchema | undefined,
  examples: BillingUsageExample[] | undefined
): MarkupRow[] {
  if (!expression || !schema) return []
  const rows: MarkupRow[] = []
  const seen = new Set<string>()
  for (const tier of getTaskPricingDisplayTiers(expression, schema)) {
    const fields = Object.keys(tier.unitPrices)
    if (tier.constant !== 0 || fields.length !== 1 || seen.has(tier.label)) {
      return []
    }
    seen.add(tier.label)
    const field = fields[0]
    const price = tier.unitPrices[field]
    const unit = schema[field]?.unit
    if (unit === 'second') {
      rows.push({
        tier: tier.label,
        source: tier,
        field,
        supply: price,
        reference: false,
      })
      continue
    }
    const resolution = tier.conditions.find(
      (condition) => VIDEO_TOKENS_PER_SECOND[condition.value]
    )
    if (unit !== 'token' || !resolution) return []
    const tokensPerSecond = videoTokensPerSecond(
      { billing_usage_examples: examples },
      resolution.field,
      resolution.value
    )
    if (!tokensPerSecond) return []
    rows.push({
      tier: tier.label,
      source: tier,
      field,
      tokensPerSecond,
      supply: (price * tokensPerSecond) / 1_000_000,
      reference: referenceTier(tier),
    })
  }
  return rows
}

/** The row key of a fixed price. */
export const FIXED_PRICE_ROW = 'fixed'

/**
 * The single row of a model charged a fixed price per request (per image):
 * the stored supplier price of a marked-up model, else its configured
 * ModelPrice. Expression prices return no row.
 */
export function fixedPriceRows(
  configured: Record<string, unknown>,
  basePrice: number | undefined
): MarkupRow[] {
  let supply = basePrice
  if (!supply && configured['billing_setting.billing_mode'] !== 'tiered_expr') {
    const price = configured.ModelPrice
    supply = typeof price === 'number' ? price : undefined
  }
  if (!supply || !Number.isFinite(supply) || supply <= 0) return []
  return [{ tier: FIXED_PRICE_ROW, field: '', supply, reference: false }]
}

/**
 * The markups to send for the rows with a non-zero amount, in USD. A negative
 * amount is a discount.
 */
export function tierMarkups(
  rows: MarkupRow[],
  amounts: Record<string, number>
): Record<string, TierMarkup> {
  const markups: Record<string, TierMarkup> = {}
  for (const row of rows) {
    const perSecond = amounts[row.tier]
    if (!perSecond || !Number.isFinite(perSecond)) continue
    markups[row.tier] = {
      field: row.field,
      per_second: perSecond,
      ...(row.tokensPerSecond
        ? { tokens_per_second: row.tokensPerSecond }
        : {}),
    }
  }
  return markups
}

/** A batch price adjustment: a fixed amount or a percentage, up or down. */
export type BatchOperation =
  | 'add'
  | 'subtract'
  | 'add_percent'
  | 'subtract_percent'

/**
 * The per-second adjustment a batch operation sets on a tier, rounded to 4
 * decimals. A percentage is of the tier's group-ratio price; the value and the
 * price are in the same currency.
 */
export function batchAdjustment(
  operation: BatchOperation,
  value: number,
  ratioPrice: number
): number {
  const amount = operation.endsWith('_percent')
    ? (ratioPrice * value) / 100
    : value
  const signed = operation.startsWith('subtract') ? -amount : amount
  return Number(signed.toFixed(4)) || 0
}

/**
 * The vendor's official video price of a model, in USD per second by option:
 * the model's own official expression, else its category's official table or
 * expression, as the pricing page inherits it. Null when none applies.
 */
export function onboardingOfficialPricing(
  modelName: string,
  officialExpr: unknown,
  schema: BillingUsageSchema | undefined,
  examples: BillingUsageExample[] | undefined,
  categories: PricingCategory[]
): VideoPricing | null {
  const own = typeof officialExpr === 'string' ? officialExpr.trim() : ''
  const category = own
    ? undefined
    : categories.find(
        (item) =>
          item.models.includes(modelName) &&
          (item.official_price || item.official_price_expr?.trim())
      )
  // A category table wins over the category expression.
  const categoryExpr = category?.official_price
    ? undefined
    : category?.official_price_expr
  const model = {
    model_name: modelName,
    billing_usage_schema: schema,
    billing_usage_examples: examples,
    official_price_expr: own || categoryExpr,
    official_price: category?.official_price,
  } as PricingModel
  return getOfficialVideoPricing(model)
}

/** Whether a tier prices requests that carry a reference video. */
export function referenceTier(tier: ParsedTaskTier): boolean {
  return tier.conditions.some(
    (condition) =>
      condition.field === 'video_input' &&
      condition.value !== 'none' &&
      condition.value !== 'false'
  )
}

/**
 * The official price of one row, in USD per second: the plain or
 * reference-order price of the row's option. Undefined when the official price
 * does not cover the row, or when a reference row is priced per output second
 * (see referenceTier).
 */
export function officialSecondPrice(
  row: MarkupRow,
  official: VideoPricing | null
): number | undefined {
  if (!official || !row.source) return undefined
  const option =
    row.source.conditions.find(
      (condition) => condition.field === official.optionField
    )?.value ??
    (official.rows.length === 1 ? official.rows[0].option : undefined)
  const match = official.rows.find((item) => item.option === option)
  if (!match) return undefined
  if (!referenceTier(row.source)) {
    return match.secondPrice > 0 ? match.secondPrice : undefined
  }
  // A tier priced per second bills output seconds only, while the official
  // reference price also bills the reference video's seconds: the two do not
  // compare per second.
  if (!row.tokensPerSecond) return undefined
  if (match.referenceSecondPrice) return match.referenceSecondPrice
  if (!match.referencePricePerMillion) return undefined
  return (match.referencePricePerMillion * row.tokensPerSecond) / 1_000_000
}
