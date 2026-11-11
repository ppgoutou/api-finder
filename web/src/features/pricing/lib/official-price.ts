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
import type {
  BillingUsageSchema,
  OfficialPriceTable,
  PricingModel,
} from '../types'
import { hasTaskUsageSchema } from './dynamic-price'
import { isTokenBasedModel } from './model-helpers'
import { getTaskEnumFields, TASK_TOKEN_PRICE_SCALE } from './task-expr'
import {
  exprUsesExtraVars,
  generateExprFromVisualConfig,
  tryParseVisualConfig,
} from './tier-expr'
import {
  getOfficialVideoPricing,
  getVideoOptionField,
  getVideoSchemaFields,
  VIDEO_TOKENS_PER_SECOND,
  INPUT_IMAGES_FIELD,
  INPUT_VIDEO_SECONDS_FIELD,
  type VideoSchemaFields,
} from './video-pricing'

/*
 * The official price is display-only. It is edited in the layout the pricing
 * page shows it in: per output second by resolution for video models, per 1M
 * tokens for token models. Every amount here is USD before any group ratio.
 */

export type TokenOfficialLayout = {
  kind: 'token'
  /** The model shows cache prices, so the official price can list them too. */
  cache: boolean
}

export type VideoOfficialLayout = {
  kind: 'video'
  schema: BillingUsageSchema
  fields: VideoSchemaFields
  /** Values of the option field, such as resolutions, in schema order. */
  options: string[]
  /** Value of the reference switch that marks an order with a reference video. */
  referenceSwitchValue?: string
  inputVideoSeconds: boolean
  inputImages: boolean
}

export type OfficialPriceLayout = TokenOfficialLayout | VideoOfficialLayout

export type TokenOfficialDraft = {
  kind: 'token'
  input: string
  output: string
  cacheRead: string
  cacheWrite: string
}

export type VideoOfficialDraftRow = {
  second: string
  referenceSecond: string
  referenceMillion: string
  inputVideoSecond: string
  inputImage: string
  freeImages: string
}

export type VideoOfficialDraft = {
  kind: 'video'
  rows: Record<string, VideoOfficialDraftRow>
}

export type OfficialPriceDraft = TokenOfficialDraft | VideoOfficialDraft

export type OfficialPriceDraftError = 'missing-second' | 'missing-reference'

function videoLayout(
  schema: BillingUsageSchema | null | undefined
): VideoOfficialLayout | null {
  const fields = getVideoSchemaFields(schema)
  if (!schema || !fields) return null
  const switchValue = fields.referenceSwitchField
    ? schema[fields.referenceSwitchField]?.enum?.find(
        (value) => value !== 'none'
      )
    : undefined
  return {
    kind: 'video',
    schema,
    fields,
    options: schema[fields.optionField]?.enum ?? [],
    ...(switchValue ? { referenceSwitchValue: switchValue } : {}),
    inputVideoSeconds: schema[INPUT_VIDEO_SECONDS_FIELD]?.type === 'number',
    inputImages: schema[INPUT_IMAGES_FIELD]?.type === 'number',
  }
}

/**
 * The official price layout of a model, following how the pricing page shows
 * its price; null for models shown per request or by other task usage.
 */
export function officialPriceLayout(
  model: PricingModel
): OfficialPriceLayout | null {
  if (hasTaskUsageSchema(model)) return videoLayout(model.billing_usage_schema)
  if (!isTokenBasedModel(model)) return null
  const expression =
    model.billing_mode === 'tiered_expr' ? (model.billing_expr ?? '') : ''
  if (expression.includes('fixed(')) return null
  return {
    kind: 'token',
    cache:
      model.cache_ratio != null ||
      model.create_cache_ratio != null ||
      (expression !== '' && exprUsesExtraVars(expression)),
  }
}

export type CategoryOfficialLayout =
  | { layout: OfficialPriceLayout; conflicts: [] }
  | { layout: null; conflicts: string[] }

/**
 * One layout for every model of a category, following how the pricing page
 * shows their prices. Video models, billed per second or by video tokens, share
 * one per-second table over every option of the category; token models share
 * one per-1M-token price. Models shown any other way are returned as conflicts.
 */
export function categoryOfficialLayout(
  models: PricingModel[]
): CategoryOfficialLayout {
  const options: string[] = []
  let reference = false
  const video: string[] = []
  const token: string[] = []
  const other: string[] = []
  let cache = false
  for (const model of models) {
    const schema = model.billing_usage_schema
    const optionField = getVideoOptionField(schema)
    if (hasTaskUsageSchema(model) && schema && optionField) {
      video.push(model.model_name)
      for (const option of schema[optionField]?.enum ?? []) {
        if (!options.includes(option)) options.push(option)
      }
      reference ||= getTaskEnumFields(schema).some(
        (entry) => entry[0] !== optionField && entry[1].enum?.includes('none')
      )
      continue
    }
    const layout = officialPriceLayout(model)
    if (layout?.kind === 'token') {
      token.push(model.model_name)
      cache ||= layout.cache
      continue
    }
    other.push(model.model_name)
  }
  if (other.length > 0 || (video.length > 0 && token.length > 0)) {
    const minority = video.length >= token.length ? token : video
    return { layout: null, conflicts: [...other, ...minority] }
  }
  if (token.length > 0) {
    return { layout: { kind: 'token', cache }, conflicts: [] }
  }
  const known = Object.keys(VIDEO_TOKENS_PER_SECOND)
  if (options.every((option) => known.includes(option))) {
    options.sort((left, right) => known.indexOf(left) - known.indexOf(right))
  }
  const layout = videoLayout({
    seconds: { type: 'number', unit: 'second' },
    resolution: { enum: options },
    ...(reference ? { video_input: { enum: ['none', 'video'] } } : {}),
  })
  if (!layout) return { layout: null, conflicts: [] }
  return { layout, conflicts: [] }
}

export function emptyOfficialDraft(
  layout: OfficialPriceLayout
): OfficialPriceDraft {
  if (layout.kind === 'token') {
    return {
      kind: 'token',
      input: '',
      output: '',
      cacheRead: '',
      cacheWrite: '',
    }
  }
  return {
    kind: 'video',
    rows: Object.fromEntries(
      layout.options.map((option) => [
        option,
        {
          second: '',
          referenceSecond: '',
          referenceMillion: '',
          inputVideoSecond: '',
          inputImage: '',
          freeImages: '',
        },
      ])
    ),
  }
}

function amountText(value: number | undefined): string {
  return value === undefined || value === 0 ? '' : String(value)
}

/** Token official prices per 1M tokens, or null when the expression is not one. */
export function parseTokenOfficialPrice(
  expression: string | null | undefined
): TokenOfficialDraft | null {
  const config = tryParseVisualConfig(expression?.trim())
  const tier = config?.tiers[0]
  if (!config || config.tiers.length !== 1 || !tier) return null
  if (tier.conditions.length > 0 || tier.billing_unit === 'request') return null
  const unsupported = [
    tier.cache_create_1h_unit_cost,
    tier.image_unit_cost,
    tier.image_output_unit_cost,
    tier.audio_input_unit_cost,
    tier.audio_output_unit_cost,
    tier.image_cache_unit_cost,
  ]
  if (unsupported.some((value) => Number(value) > 0)) return null
  return {
    kind: 'token',
    input: amountText(tier.input_unit_cost),
    output: amountText(tier.output_unit_cost),
    cacheRead: amountText(tier.cache_read_unit_cost),
    cacheWrite: amountText(tier.cache_create_unit_cost),
  }
}

/**
 * The form values of a saved official price, or null when the expression
 * cannot be shown in the form of this layout.
 */
export function officialDraftFromExpr(
  layout: OfficialPriceLayout,
  expression: string | null | undefined
): OfficialPriceDraft | null {
  if (!expression?.trim()) return emptyOfficialDraft(layout)
  if (layout.kind === 'token') return parseTokenOfficialPrice(expression)
  const pricing = getOfficialVideoPricing({
    billing_usage_schema: layout.schema,
    official_price_expr: expression,
  } as PricingModel)
  if (!pricing) return null
  const draft = emptyOfficialDraft(layout) as VideoOfficialDraft
  for (const row of pricing.rows) {
    if (!draft.rows[row.option]) return null
    draft.rows[row.option] = {
      second: amountText(row.secondPrice),
      referenceSecond: amountText(row.referenceSecondPrice),
      referenceMillion: amountText(row.referencePricePerMillion),
      inputVideoSecond: amountText(row.inputVideoSecondPrice),
      inputImage: amountText(row.inputImagePrice),
      freeImages: amountText(row.freeInputImages),
    }
  }
  return draft
}

function filled(value: string): boolean {
  return value.trim() !== '' && Number(value) > 0
}

export function isOfficialDraftEmpty(draft: OfficialPriceDraft): boolean {
  if (draft.kind === 'token') {
    return ![draft.input, draft.output, draft.cacheRead, draft.cacheWrite].some(
      filled
    )
  }
  return Object.values(draft.rows).every((row) =>
    Object.values(row).every((value) => !filled(value))
  )
}

/**
 * Why the draft cannot be saved yet; null when it can. A model's price needs
 * every option; a category table may leave options out, and those rows are
 * simply not shown.
 */
export function officialDraftError(
  draft: OfficialPriceDraft,
  options: { allowBlankRows?: boolean } = {}
): OfficialPriceDraftError | null {
  if (draft.kind === 'token' || isOfficialDraftEmpty(draft)) return null
  const rows = Object.values(draft.rows)
  if (options.allowBlankRows) {
    const partial = rows.some(
      (row) =>
        !filled(row.second) && Object.values(row).some((value) => filled(value))
    )
    return partial ? 'missing-second' : null
  }
  if (rows.some((row) => !filled(row.second))) return 'missing-second'
  const referenced = rows.filter((row) => filled(row.referenceSecond))
  if (referenced.length > 0 && referenced.length !== rows.length) {
    return 'missing-reference'
  }
  return null
}

/** The form values of an official price table in this layout. */
export function officialDraftFromTable(
  layout: OfficialPriceLayout,
  table: OfficialPriceTable
): OfficialPriceDraft | null {
  if (layout.kind === 'token') {
    if (table.kind !== 'token') return null
    return {
      kind: 'token',
      input: amountText(table.input),
      output: amountText(table.output),
      cacheRead: amountText(table.cache_read),
      cacheWrite: amountText(table.cache_write),
    }
  }
  if (table.kind !== 'video') return null
  const draft = emptyOfficialDraft(layout) as VideoOfficialDraft
  for (const row of table.rows) {
    const current = draft.rows[row.option]
    if (!current) continue
    draft.rows[row.option] = {
      ...current,
      second: amountText(row.second),
      referenceSecond: amountText(row.reference_second),
    }
  }
  return draft
}

/** The official price table to save; null when the draft holds no price. */
export function officialTableFromDraft(
  draft: OfficialPriceDraft
): OfficialPriceTable | null {
  if (isOfficialDraftEmpty(draft)) return null
  if (draft.kind === 'token') {
    if (!filled(draft.input) && !filled(draft.output)) return null
    return {
      kind: 'token',
      input: Number(draft.input) || 0,
      output: Number(draft.output) || 0,
      ...(filled(draft.cacheRead)
        ? { cache_read: Number(draft.cacheRead) }
        : {}),
      ...(filled(draft.cacheWrite)
        ? { cache_write: Number(draft.cacheWrite) }
        : {}),
    }
  }
  const rows = Object.entries(draft.rows).flatMap(([option, row]) =>
    filled(row.second)
      ? [
          {
            option,
            second: Number(row.second),
            ...(filled(row.referenceSecond)
              ? { reference_second: Number(row.referenceSecond) }
              : {}),
          },
        ]
      : []
  )
  return rows.length > 0 ? { kind: 'video', rows } : null
}

function price(value: string): string {
  return String(Number(value) || 0)
}

function usage(field: string): string {
  return `u(${JSON.stringify(field)})`
}

function videoTierBody(
  layout: VideoOfficialLayout,
  row: VideoOfficialDraftRow
): string {
  const parts = [`${usage(layout.fields.secondsField)} * ${price(row.second)}`]
  if (layout.fields.referenceField && filled(row.referenceMillion)) {
    parts.push(
      `${usage(layout.fields.referenceField)} * ${price(row.referenceMillion)} / ${TASK_TOKEN_PRICE_SCALE}`
    )
  }
  if (layout.inputVideoSeconds && filled(row.inputVideoSecond)) {
    parts.push(
      `${usage(INPUT_VIDEO_SECONDS_FIELD)} * ${price(row.inputVideoSecond)}`
    )
  }
  if (layout.inputImages && filled(row.inputImage)) {
    const free = Math.max(0, Math.floor(Number(row.freeImages) || 0))
    const quantity =
      free > 0
        ? `max(${usage(INPUT_IMAGES_FIELD)} - ${free}, 0)`
        : usage(INPUT_IMAGES_FIELD)
    parts.push(`${quantity} * ${price(row.inputImage)}`)
  }
  return parts.join(' + ')
}

function videoOfficialExpr(
  layout: VideoOfficialLayout,
  draft: VideoOfficialDraft
): string {
  const optionField = layout.fields.optionField
  const switchField = layout.fields.referenceSwitchField
  const withReference =
    Boolean(switchField && layout.referenceSwitchValue) &&
    Object.values(draft.rows).some((row) => filled(row.referenceSecond))
  const tiers: { label: string; condition: string; body: string }[] = []
  for (const option of layout.options) {
    const row = draft.rows[option]
    if (!row) continue
    const optionCondition = `${usage(optionField)} == ${JSON.stringify(option)}`
    if (withReference && switchField && layout.referenceSwitchValue) {
      tiers.push({
        label: option,
        condition: `${optionCondition} && ${usage(switchField)} == "none"`,
        body: videoTierBody(layout, row),
      })
      tiers.push({
        label: `${option}·${layout.referenceSwitchValue}`,
        condition: `${optionCondition} && ${usage(switchField)} == ${JSON.stringify(layout.referenceSwitchValue)}`,
        body: `${usage(layout.fields.secondsField)} * ${price(row.referenceSecond)}`,
      })
      continue
    }
    tiers.push({
      label: option,
      condition: optionCondition,
      body: videoTierBody(layout, row),
    })
  }
  return tiers
    .map((tier, index) => {
      const call = `tier(${JSON.stringify(tier.label)}, ${tier.body})`
      // The last tier is the fallback; the page names its option from the
      // one combination the earlier tiers leave over.
      return index === tiers.length - 1 ? call : `${tier.condition} ? ${call}`
    })
    .join(' : ')
}

/** The expression to save; empty when the draft holds no price, to remove it. */
export function officialExprFromDraft(
  layout: OfficialPriceLayout,
  draft: OfficialPriceDraft
): string {
  if (isOfficialDraftEmpty(draft)) return ''
  if (layout.kind === 'video' && draft.kind === 'video') {
    return videoOfficialExpr(layout, draft)
  }
  if (draft.kind !== 'token') return ''
  return generateExprFromVisualConfig({
    tiers: [
      {
        label: 'base',
        conditions: [],
        input_unit_cost: Number(draft.input) || 0,
        output_unit_cost: Number(draft.output) || 0,
        cache_mode: 'generic',
        cache_read_unit_cost: Number(draft.cacheRead) || 0,
        cache_create_unit_cost: Number(draft.cacheWrite) || 0,
      },
    ],
  })
}

export type TokenOfficialPricing = {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** The official per-1M-token prices a token model shows, or null. */
export function getOfficialTokenPricing(
  model: PricingModel
): TokenOfficialPricing | null {
  if (officialPriceLayout(model)?.kind !== 'token') return null
  let draft: OfficialPriceDraft | null = null
  if (model.official_price_expr?.trim()) {
    draft = parseTokenOfficialPrice(model.official_price_expr)
  } else if (model.official_price) {
    draft = officialDraftFromTable(
      { kind: 'token', cache: true },
      model.official_price
    )
  }
  if (draft?.kind !== 'token' || isOfficialDraftEmpty(draft)) return null
  return {
    input: Number(draft.input) || 0,
    output: Number(draft.output) || 0,
    ...(filled(draft.cacheRead) ? { cacheRead: Number(draft.cacheRead) } : {}),
    ...(filled(draft.cacheWrite)
      ? { cacheWrite: Number(draft.cacheWrite) }
      : {}),
  }
}
