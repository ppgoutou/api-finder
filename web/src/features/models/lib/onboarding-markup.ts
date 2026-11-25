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
import type { ModelPricingEntry } from '@/features/model-pricing/api'
import type { ParsedTaskTier } from '@/features/pricing/lib/billing-expr'
import { getTaskPricingDisplayTiers } from '@/features/pricing/lib/task-matrix-display'
import { taskTierConditions } from '@/features/pricing/lib/task-price-display'
import {
  getOfficialVideoPricing,
  IMAGE_COUNT_FIELD,
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

import type { OnboardingMarkup, TierMarkup } from '../types'

/**
 * One price tier of a model, in USD per second of video or per generated
 * image, or the fixed price of a model, in USD per request (per image).
 */
export type MarkupRow = {
  /** The tier name in the expression, which keys its markup. */
  tier: string
  /** Absent for a fixed price. */
  source?: ParsedTaskTier
  /** What the prices of the row are per. */
  unit: 'second' | 'image'
  field: string
  /** Set for a token-priced tier; its per-second prices assume this rate. */
  tokensPerSecond?: number
  /** Supplier price per unit, before the group ratio. */
  supply: number
  /**
   * A reference-video token tier: its tokens cover the reference video as
   * well as the output, so its per-second price applies to both.
   */
  reference: boolean
}

/**
 * The rows of an expression that a markup can raise: each tier prices exactly
 * one usage field, in seconds, in tokens at a known resolution, or in
 * generated images. Other expressions, and expressions that mix seconds with
 * images, return no rows.
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
        unit: 'second',
        field,
        supply: price,
        reference: false,
      })
      continue
    }
    if (unit === 'count' && field === IMAGE_COUNT_FIELD) {
      rows.push({
        tier: tier.label,
        source: tier,
        unit: 'image',
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
      unit: 'second',
      field,
      tokensPerSecond,
      supply: (price * tokensPerSecond) / 1_000_000,
      reference: referenceTier(tier),
    })
  }
  return rows.every((row) => row.unit === rows[0].unit) ? rows : []
}

/**
 * What a row applies to: its tier's conditions, else its tier name. The only
 * row of a price per image applies to every image.
 */
export function markupRowCondition(
  row: MarkupRow,
  onlyRow: boolean,
  schema: BillingUsageSchema | undefined,
  language: string,
  t: (key: string) => string
): string {
  const conditions = row.source
    ? taskTierConditions(row.source, schema, language, t)
    : ''
  if (conditions) return conditions
  return row.unit === 'image' && onlyRow ? t('Per image') : row.tier
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
  return [
    {
      tier: FIXED_PRICE_ROW,
      unit: 'image',
      field: '',
      supply,
      reference: false,
    },
  ]
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
 * The per-unit adjustment a batch operation sets on a tier, rounded to 4
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

/**
 * One tier before and after taking the supplier's latest price, in USD per
 * second, image or request. A side is absent when that price lacks the tier.
 */
export type PriceComparisonRow = {
  row: MarkupRow
  currentSupply?: number
  currentFinal?: number
  latestSupply?: number
  latestFinal?: number
}

/**
 * The supply price and the default-group final price of every tier, now and
 * with the supplier's latest price. The saved adjustments stay as they are.
 * Prices without per-second, per-image or fixed rows, or without a tier in
 * common, return none.
 */
export function comparePriceRows(
  entry: ModelPricingEntry,
  markup: OnboardingMarkup | undefined,
  latest: Record<string, unknown>,
  priceFactor: number
): PriceComparisonRow[] {
  const examples =
    entry.usage_examples ?? entry.plugin_variants?.[0]?.usage_examples
  const rowsOf = (
    pricing: Record<string, unknown>,
    base: OnboardingMarkup | undefined
  ): MarkupRow[] => {
    const configured = pricing['billing_setting.billing_expr']
    const expression =
      base?.base_expr ??
      (typeof configured === 'string' ? configured : undefined)
    const tiers = markupRows(expression, entry.usage_schema, examples)
    return tiers.length > 0 ? tiers : fixedPriceRows(pricing, base?.base_price)
  }
  const latestRows = rowsOf(latest, undefined)
  if (latestRows.length === 0) return []
  const currentRows = new Map(
    rowsOf(entry.configured, markup).map((row) => [row.tier, row])
  )
  // A rewritten local price can name every tier differently: nothing lines up.
  if (
    currentRows.size > 0 &&
    !latestRows.some((row) => currentRows.has(row.tier))
  ) {
    return []
  }
  const final = (row: MarkupRow): number =>
    row.supply * priceFactor +
    ((row.source
      ? markup?.tiers?.[row.tier]?.per_second
      : markup?.per_request) ?? 0)
  const rows: PriceComparisonRow[] = latestRows.map((row) => {
    const current = currentRows.get(row.tier)
    currentRows.delete(row.tier)
    return {
      row,
      currentSupply: current?.supply,
      currentFinal: current ? final(current) : undefined,
      latestSupply: row.supply,
      latestFinal: final(row),
    }
  })
  for (const row of currentRows.values()) {
    rows.push({ row, currentSupply: row.supply, currentFinal: final(row) })
  }
  return rows
}
