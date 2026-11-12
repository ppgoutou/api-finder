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
import { getCurrencyDisplay } from '@/lib/currency'

import type { BillingUsageSchema, PricingModel } from '../types'
import { splitBillingExprAndRequestRules } from './billing-expr'
import { getTaskEnumFields, getTaskNumberFields } from './task-expr'
import { getTaskPricingDisplayTiers } from './task-matrix-display'

/**
 * Reference video tokens per output second, by output resolution:
 * width x height x 24 / 1024.
 */
export const VIDEO_TOKENS_PER_SECOND: Readonly<Record<string, number>> = {
  '480p': 10044,
  '720p': 21600,
  '1080p': 48600,
  '4k': 194400,
}

/**
 * Video tokens per output second of one option. A plugin that publishes a
 * plain-order example for the option (label `… · <n>s`, every other enum fact
 * `none`) carries its supplier's own conversion; otherwise the reference table
 * applies.
 */
export function videoTokensPerSecond(
  model: Pick<PricingModel, 'billing_usage_examples'>,
  optionField: string,
  option: string
): number | undefined {
  for (const example of model.billing_usage_examples ?? []) {
    const facts = example.facts
    if (facts[optionField] !== option || typeof facts.tokens !== 'number') {
      continue
    }
    const plain = Object.entries(facts).every(
      ([field, value]) =>
        field === optionField || typeof value === 'number' || value === 'none'
    )
    const seconds = Number(/(\d+)\s*s\b/.exec(example.label)?.[1])
    if (plain && seconds > 0) return facts.tokens / seconds
  }
  return VIDEO_TOKENS_PER_SECOND[option]
}

/** Video prices are shown rounded to two decimal places. */
export const VIDEO_PRICE_FRACTION_DIGITS = 2

/** Output duration range, in seconds, the model's task plugin declares. */
export function getModelDurationRange(
  model: Pick<PricingModel, 'model_limits'>
): readonly [number, number] | undefined {
  const limits = model.model_limits
  if (!limits?.minDuration || !limits.maxDuration) return undefined
  return [limits.minDuration, limits.maxDuration]
}

export type VideoPricingRow = {
  option: string
  /** USD per output second, before group and recharge adjustments. */
  secondPrice: number
  /** USD per million reference-order tokens, when reference orders are priced. */
  referencePricePerMillion?: number
  /** USD per output second of an order with a reference video, when priced so. */
  referenceSecondPrice?: number
  tokensPerSecond?: number
  /** USD per video of any length, for models billed per video. */
  videoPrice?: number
  /** USD per reference video second, charged on top of the output seconds. */
  inputVideoSecondPrice?: number
  /** USD per input image beyond the free ones, charged on top. */
  inputImagePrice?: number
  /** Input images charged nothing. */
  freeInputImages?: number
}

export type VideoPricing = {
  optionField: string
  hasReferencePricing: boolean
  durationRange?: readonly [number, number]
  rows: VideoPricingRow[]
}

/** Reference media a video model prices on top of its output seconds. */
export const INPUT_VIDEO_SECONDS_FIELD = 'input_video_seconds'
export const INPUT_IMAGES_FIELD = 'input_images'

/** Seconds reserved for reference videos while their real length is unknown. */
export const RESERVED_REFERENCE_VIDEO_SECONDS = 15

/** Usage enum whose non-`none` value marks an order with a reference video. */
const REFERENCE_SWITCH_FIELD = 'video_input'

export type VideoSchemaFields = {
  secondsField: string
  referenceField?: string
  referenceSwitchField?: string
  optionField: string
}

export function getVideoSchemaFields(
  schema: BillingUsageSchema | null | undefined
): VideoSchemaFields | null {
  const numberFields = getTaskNumberFields(schema).filter(
    (entry) =>
      entry[0] !== INPUT_VIDEO_SECONDS_FIELD && entry[0] !== INPUT_IMAGES_FIELD
  )
  const enumFields = getTaskEnumFields(schema)
  const seconds = numberFields.filter((entry) => entry[1].unit === 'second')
  const tokens = numberFields.filter((entry) => entry[1].unit === 'token')
  if (seconds.length !== 1 || tokens.length > 1) return null
  if (seconds.length + tokens.length !== numberFields.length) return null
  // A second enum must be the reference video switch; any other is unknown
  // pricing that a resolution row cannot label.
  const switches =
    enumFields.length > 1
      ? enumFields.filter(
          (entry) =>
            entry[0] === REFERENCE_SWITCH_FIELD &&
            entry[1].enum?.length === 2 &&
            entry[1].enum.includes('none')
        )
      : []
  const optionFields = enumFields.filter((entry) => !switches.includes(entry))
  if (optionFields.length !== 1 || switches.length > 1) return null
  if (switches.length > 0 && tokens.length > 0) return null
  return {
    secondsField: seconds[0][0],
    referenceField: tokens[0]?.[0],
    referenceSwitchField: switches[0]?.[0],
    optionField: optionFields[0][0],
  }
}

/**
 * A video schema meters output seconds (optionally plus reference-order
 * tokens) and selects the price by exactly one enum, such as resolution,
 * optionally with the `video_input` enum that switches on reference pricing.
 */
export function isVideoPricingSchema(
  schema: BillingUsageSchema | null | undefined
): boolean {
  return getVideoSchemaFields(schema) !== null
}

/**
 * Per-option prices of a video model in schema enum order. Returns null unless
 * every option has its own plain unit prices, so per-request charges, request
 * rules and partial matrices keep the generic pricing display.
 */
export function getVideoPricing(model: PricingModel): VideoPricing | null {
  if (model.billing_mode !== 'tiered_expr' || !model.billing_expr) return null
  return videoPricingFromExpr(model, model.billing_expr)
}

/**
 * The vendor's published price in the same per-option layout as the charged
 * price. It is display-only: group ratios never apply to it.
 */
export function getOfficialVideoPricing(
  model: PricingModel
): VideoPricing | null {
  if (model.official_price_expr?.trim()) {
    return videoPricingFromExpr(model, model.official_price_expr)
  }
  const table = model.official_price
  const schema = model.billing_usage_schema
  const optionField = getVideoOptionField(schema)
  if (table?.kind !== 'video' || !schema || !optionField) return null
  // Interfaces showing CNY show the vendor's CNY list price where one is set,
  // as the USD amount that displays as it.
  const { meta } = getCurrencyDisplay()
  const cnyRate =
    meta.kind === 'currency' &&
    meta.currencyCode === 'CNY' &&
    meta.exchangeRate > 0
      ? meta.exchangeRate
      : 0
  const amount = (usd: number, cny: number | undefined) =>
    cnyRate && cny ? cny / cnyRate : usd
  // A category table lists every option of its models; each model shows the
  // rows of the options it supports, in its own order.
  const rows = (schema[optionField]?.enum ?? []).flatMap(
    (option): VideoPricingRow[] => {
      const row = table.rows.find((item) => item.option === option)
      if (!row) return []
      return [
        {
          option,
          secondPrice: amount(row.second, row.second_cny),
          ...(row.reference_second
            ? {
                referenceSecondPrice: amount(
                  row.reference_second,
                  row.reference_second_cny
                ),
              }
            : {}),
        },
      ]
    }
  )
  if (rows.length === 0) return null
  return {
    optionField,
    hasReferencePricing: rows.some(
      (row) => row.referenceSecondPrice !== undefined
    ),
    durationRange: getModelDurationRange(model),
    rows,
  }
}

/**
 * The enum, such as resolution, a video model's per-second price is shown by:
 * the option of a per-second schema, or the resolution of a model billed by
 * video tokens. Undefined for schemas the page does not show per second.
 */
export function getVideoOptionField(
  schema: BillingUsageSchema | null | undefined
): string | undefined {
  const fields = getVideoSchemaFields(schema)
  if (fields) return fields.optionField
  const numberFields = getTaskNumberFields(schema)
  if (numberFields.length !== 1 || numberFields[0][1].unit !== 'token') {
    return undefined
  }
  return getTaskEnumFields(schema).find((entry) =>
    entry[1].enum?.every((value) => VIDEO_TOKENS_PER_SECOND[value])
  )?.[0]
}

function videoPricingFromExpr(
  model: PricingModel,
  expression: string
): VideoPricing | null {
  const schema = model.billing_usage_schema
  const fields = getVideoSchemaFields(schema)
  if (!schema || !fields) return null
  const split = splitBillingExprAndRequestRules(expression)
  if (split.requestRuleExpr?.trim()) return null

  const pricedFields = [
    fields.secondsField,
    fields.referenceField,
    INPUT_VIDEO_SECONDS_FIELD,
    INPUT_IMAGES_FIELD,
  ]
  const options = schema[fields.optionField]?.enum ?? []
  const rowsByOption = new Map<string, VideoPricingRow>()
  const referenceSecondPrices = new Map<string, number>()
  for (const tier of getTaskPricingDisplayTiers(split.billingExpr, schema)) {
    // A model with a single option, such as a 720p-only line, has tiers that
    // never test that option.
    const option =
      tier.conditions.find(
        (condition) => condition.field === fields.optionField
      )?.value ?? (options.length === 1 ? options[0] : undefined)
    const switchValue = tier.conditions.find(
      (condition) => condition.field === fields.referenceSwitchField
    )?.value
    const isReferenceTier = switchValue !== undefined && switchValue !== 'none'
    const seenPrices = isReferenceTier ? referenceSecondPrices : rowsByOption
    if (
      option === undefined ||
      tier.conditions.some(
        (condition) =>
          condition.field !== fields.optionField &&
          condition.field !== fields.referenceSwitchField
      ) ||
      tier.constant !== 0 ||
      seenPrices.has(option) ||
      Object.keys(tier.unitPrices).some(
        (field) => !pricedFields.includes(field)
      )
    ) {
      return null
    }
    if (isReferenceTier) {
      referenceSecondPrices.set(
        option,
        tier.unitPrices[fields.secondsField] ?? 0
      )
      continue
    }
    const referencePricePerMillion = fields.referenceField
      ? tier.unitPrices[fields.referenceField]
      : undefined
    rowsByOption.set(option, {
      option,
      secondPrice: tier.unitPrices[fields.secondsField] ?? 0,
      referencePricePerMillion,
      tokensPerSecond: videoTokensPerSecond(model, fields.optionField, option),
      ...(tier.unitPrices[INPUT_VIDEO_SECONDS_FIELD]
        ? { inputVideoSecondPrice: tier.unitPrices[INPUT_VIDEO_SECONDS_FIELD] }
        : {}),
      ...(tier.unitPrices[INPUT_IMAGES_FIELD]
        ? {
            inputImagePrice: tier.unitPrices[INPUT_IMAGES_FIELD],
            freeInputImages: tier.freeUnits?.[INPUT_IMAGES_FIELD] ?? 0,
          }
        : {}),
    })
  }

  const rows = options.flatMap((option) => {
    const row = rowsByOption.get(option)
    if (!row) return []
    const referenceSecondPrice = referenceSecondPrices.get(option)
    return [
      referenceSecondPrice === undefined
        ? row
        : { ...row, referenceSecondPrice },
    ]
  })
  if (rows.length === 0 || rows.length !== rowsByOption.size) return null
  if (
    referenceSecondPrices.size > 0 &&
    (referenceSecondPrices.size !== rows.length ||
      rows.some((row) => row.referenceSecondPrice === undefined))
  ) {
    return null
  }

  return {
    optionField: fields.optionField,
    hasReferencePricing: rows.some(
      (row) =>
        row.referencePricePerMillion !== undefined ||
        row.referenceSecondPrice !== undefined
    ),
    durationRange: getModelDurationRange(model),
    rows,
  }
}

/**
 * Per-option prices of a video model billed per video: one count field priced
 * by exactly one enum, such as resolution. Returns null for any other schema,
 * per-request charges or request rules.
 */
export function getPerVideoPricing(model: PricingModel): VideoPricing | null {
  if (model.billing_mode !== 'tiered_expr' || !model.billing_expr) return null
  const schema = model.billing_usage_schema
  const numberFields = getTaskNumberFields(schema)
  const enumFields = getTaskEnumFields(schema)
  if (
    !schema ||
    enumFields.length !== 1 ||
    numberFields.length !== 1 ||
    numberFields[0][1].unit !== 'count'
  ) {
    return null
  }
  const split = splitBillingExprAndRequestRules(model.billing_expr)
  if (split.requestRuleExpr?.trim()) return null

  const countField = numberFields[0][0]
  const optionField = enumFields[0][0]
  const options = enumFields[0][1].enum ?? []
  const rowsByOption = new Map<string, VideoPricingRow>()
  for (const tier of getTaskPricingDisplayTiers(split.billingExpr, schema)) {
    const option =
      tier.conditions.length === 0 && options.length === 1
        ? options[0]
        : tier.conditions[0]?.value
    if (
      option === undefined ||
      tier.conditions.length > 1 ||
      (tier.conditions.length === 1 &&
        tier.conditions[0].field !== optionField) ||
      tier.constant !== 0 ||
      rowsByOption.has(option) ||
      Object.keys(tier.unitPrices).some((field) => field !== countField)
    ) {
      return null
    }
    rowsByOption.set(option, {
      option,
      secondPrice: 0,
      videoPrice: tier.unitPrices[countField] ?? 0,
    })
  }

  const rows = options.flatMap((option) => {
    const row = rowsByOption.get(option)
    return row ? [row] : []
  })
  if (rows.length === 0 || rows.length !== rowsByOption.size) return null

  return {
    optionField,
    hasReferencePricing: false,
    durationRange: getModelDurationRange(model),
    rows,
  }
}

/**
 * Per-second prices of a video model billed by video tokens, for orders without
 * a reference video: each resolution's token price times its reference tokens
 * per second. Returns null unless one token field is priced by a resolution
 * enum and, optionally, other enums whose `none` value marks plain orders.
 */
export function getTokenVideoPricing(model: PricingModel): VideoPricing | null {
  if (model.billing_mode !== 'tiered_expr' || !model.billing_expr) return null
  const schema = model.billing_usage_schema
  const numberFields = getTaskNumberFields(schema)
  if (
    !schema ||
    numberFields.length !== 1 ||
    numberFields[0][1].unit !== 'token'
  ) {
    return null
  }
  const tokensField = numberFields[0][0]
  const enumFields = getTaskEnumFields(schema)
  const optionEntry = enumFields.find((entry) =>
    entry[1].enum?.every((value) => VIDEO_TOKENS_PER_SECOND[value])
  )
  if (
    !optionEntry ||
    enumFields.some(
      (entry) => entry !== optionEntry && !entry[1].enum?.includes('none')
    )
  ) {
    return null
  }
  const split = splitBillingExprAndRequestRules(model.billing_expr)
  if (split.requestRuleExpr?.trim()) return null

  const optionField = optionEntry[0]
  const options = optionEntry[1].enum ?? []
  const rowsByOption = new Map<string, VideoPricingRow>()
  let hasReferencePricing = false
  for (const tier of getTaskPricingDisplayTiers(split.billingExpr, schema)) {
    if (
      tier.constant !== 0 ||
      Object.keys(tier.unitPrices).some((field) => field !== tokensField)
    ) {
      return null
    }
    if (
      tier.conditions.some(
        (condition) =>
          condition.field !== optionField && condition.value !== 'none'
      )
    ) {
      hasReferencePricing = true
      continue
    }
    const option =
      tier.conditions.find((condition) => condition.field === optionField)
        ?.value ?? (options.length === 1 ? options[0] : undefined)
    if (option === undefined || rowsByOption.has(option)) return null
    const tokensPerSecond =
      videoTokensPerSecond(model, optionField, option) ?? 0
    rowsByOption.set(option, {
      option,
      secondPrice:
        ((tier.unitPrices[tokensField] ?? 0) * tokensPerSecond) / 1_000_000,
      tokensPerSecond,
    })
  }

  const rows = options.flatMap((option) => {
    const row = rowsByOption.get(option)
    return row ? [row] : []
  })
  if (rows.length !== options.length) return null

  return {
    optionField,
    hasReferencePricing,
    durationRange: getModelDurationRange(model),
    rows,
  }
}

export type ReferenceOrderExample = {
  option: string
  referenceSeconds: number
  outputSeconds: number
  billedReferenceSeconds: number
  tokensPerSecond: number
  tokens: number
  /** USD per million tokens, before group and recharge adjustments. */
  pricePerMillion: number
  /** USD for the whole order, before group and recharge adjustments. */
  cost: number
}

/**
 * Worked reference-order example: references shorter than 2/3 of the output
 * count as 2/3 of it, rounded up to a whole second. Prefers the requested
 * option and falls back to the first row that has a reference price.
 */
export function getReferenceOrderExample(
  pricing: VideoPricing,
  referenceSeconds: number,
  outputSeconds: number,
  preferredOption: string
): ReferenceOrderExample | null {
  const priced = pricing.rows.filter(
    (row) =>
      row.referencePricePerMillion !== undefined &&
      row.tokensPerSecond !== undefined
  )
  const row =
    priced.find((candidate) => candidate.option === preferredOption) ??
    priced[0]
  if (
    !row ||
    row.referencePricePerMillion === undefined ||
    !row.tokensPerSecond
  ) {
    return null
  }
  const billedReferenceSeconds = Math.max(
    referenceSeconds,
    Math.ceil((outputSeconds * 2) / 3)
  )
  const tokens = (outputSeconds + billedReferenceSeconds) * row.tokensPerSecond
  return {
    option: row.option,
    referenceSeconds,
    outputSeconds,
    billedReferenceSeconds,
    tokensPerSecond: row.tokensPerSecond,
    tokens,
    pricePerMillion: row.referencePricePerMillion,
    cost: (tokens * row.referencePricePerMillion) / 1_000_000,
  }
}
