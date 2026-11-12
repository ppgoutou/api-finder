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
import i18next from 'i18next'
import { afterEach, describe, expect, test } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import {
  categoryOfficialLayout,
  getOfficialTokenPricing,
  officialDraftError,
  officialDraftFromExpr,
  officialDraftFromTable,
  officialExprFromDraft,
  officialPriceLayout,
  officialTableFromDraft,
  type OfficialPriceLayout,
  type VideoOfficialDraft,
} from '../lib/official-price'
import { getOfficialVideoPricing } from '../lib/video-pricing'
import type { BillingUsageSchema, PricingModel } from '../types'

const VIDEO_SCHEMA: BillingUsageSchema = {
  seconds: { type: 'number', unit: 'second' },
  reference_video_tokens: { type: 'number', unit: 'token' },
  input_images: { type: 'number', unit: 'count' },
  resolution: { enum: ['480p', '720p'] },
}

const SWITCH_SCHEMA: BillingUsageSchema = {
  seconds: { type: 'number', unit: 'second' },
  resolution: { enum: ['480p', '720p'] },
  video_input: { enum: ['none', 'video'] },
}

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'm',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

function videoRow(
  second: string,
  extra: Partial<VideoOfficialDraft['rows'][string]> = {}
) {
  return {
    second,
    referenceSecond: '',
    secondCny: '',
    referenceSecondCny: '',
    referenceMillion: '',
    inputVideoSecond: '',
    inputImage: '',
    freeImages: '',
    ...extra,
  }
}

function layoutOf(overrides: Partial<PricingModel>): OfficialPriceLayout {
  const layout = officialPriceLayout(model(overrides))
  if (!layout) throw new Error('expected a layout')
  return layout
}

describe('official price layout', () => {
  test('a video schema is edited per resolution and a token model per 1M tokens', () => {
    expect(layoutOf({ billing_usage_schema: VIDEO_SCHEMA }).kind).toBe('video')
    expect(layoutOf({ cache_ratio: 0.1 })).toEqual({
      kind: 'token',
      cache: true,
    })
  })

  test('per-request and other task models have no official price layout', () => {
    expect(
      officialPriceLayout(model({ quota_type: 1, model_price: 0.1 }))
    ).toBeNull()
    expect(
      officialPriceLayout(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("request", fixed(0.01))',
        })
      )
    ).toBeNull()
    expect(
      officialPriceLayout(
        model({
          billing_usage_schema: {
            image_count: { type: 'number', unit: 'count' },
          },
        })
      )
    ).toBeNull()
  })

  test('a category of mixed video and token models lists the models that do not fit', () => {
    const result = categoryOfficialLayout([
      model({ model_name: 'video', billing_usage_schema: VIDEO_SCHEMA }),
      model({ model_name: 'chat' }),
    ])

    expect(result.layout).toBeNull()
    expect(result.conflicts).toEqual(['chat'])
  })

  test('a category of token models shows cache prices when any model has them', () => {
    const result = categoryOfficialLayout([
      model({ model_name: 'a' }),
      model({ model_name: 'b', create_cache_ratio: 1.25 }),
    ])

    expect(result.layout).toEqual({ kind: 'token', cache: true })
  })
})

describe('official price expressions', () => {
  test('a token draft round-trips through its expression', () => {
    const layout = layoutOf({ cache_ratio: 0.1 })
    const expression = officialExprFromDraft(layout, {
      kind: 'token',
      input: '2',
      output: '8',
      cacheRead: '0.5',
      cacheWrite: '',
    })

    expect(expression).toBe('tier("base", p * 2 + c * 8 + cr * 0.5)')
    expect(officialDraftFromExpr(layout, expression)).toEqual({
      kind: 'token',
      input: '2',
      output: '8',
      cacheRead: '0.5',
      cacheWrite: '',
    })
    expect(
      getOfficialTokenPricing(
        model({ cache_ratio: 0.1, official_price_expr: expression })
      )
    ).toEqual({ input: 2, output: 8, cacheRead: 0.5 })
  })

  test('a video draft is shown by the pricing page as the same per-second table', () => {
    const layout = layoutOf({ billing_usage_schema: VIDEO_SCHEMA })
    const draft: VideoOfficialDraft = {
      kind: 'video',
      rows: {
        '480p': videoRow('0.5', {
          referenceMillion: '40',
          inputImage: '0.1',
          freeImages: '1',
        }),
        '720p': videoRow('1.2', {
          referenceMillion: '42',
          inputImage: '0.1',
          freeImages: '1',
        }),
      },
    }
    const expression = officialExprFromDraft(layout, draft)

    const pricing = getOfficialVideoPricing(
      model({
        billing_usage_schema: VIDEO_SCHEMA,
        official_price_expr: expression,
      })
    )
    expect(
      pricing?.rows.map((row) => [
        row.option,
        row.secondPrice,
        row.referencePricePerMillion,
        row.inputImagePrice,
        row.freeInputImages,
      ])
    ).toEqual([
      ['480p', 0.5, 40, 0.1, 1],
      ['720p', 1.2, 42, 0.1, 1],
    ])
    expect(officialDraftFromExpr(layout, expression)).toEqual(draft)
  })

  test('reference video prices become switch tiers the page reads back', () => {
    const layout = layoutOf({ billing_usage_schema: SWITCH_SCHEMA })
    const draft: VideoOfficialDraft = {
      kind: 'video',
      rows: {
        '480p': videoRow('0.5', { referenceSecond: '0.65' }),
        '720p': videoRow('0.8', { referenceSecond: '1.05' }),
      },
    }
    const expression = officialExprFromDraft(layout, draft)

    const pricing = getOfficialVideoPricing(
      model({
        billing_usage_schema: SWITCH_SCHEMA,
        official_price_expr: expression,
      })
    )
    expect(
      pricing?.rows.map((row) => [
        row.option,
        row.secondPrice,
        row.referenceSecondPrice,
      ])
    ).toEqual([
      ['480p', 0.5, 0.65],
      ['720p', 0.8, 1.05],
    ])
    expect(officialDraftFromExpr(layout, expression)).toEqual(draft)
  })

  test('an empty draft saves as no official price', () => {
    const layout = layoutOf({ billing_usage_schema: VIDEO_SCHEMA })
    const draft = officialDraftFromExpr(layout, '')
    if (!draft) throw new Error('expected a draft')

    expect(officialExprFromDraft(layout, draft)).toBe('')
    expect(officialDraftError(draft)).toBeNull()
  })

  test('a video draft needs every per-second price and all or no reference prices', () => {
    expect(
      officialDraftError({
        kind: 'video',
        rows: { '480p': videoRow('0.5'), '720p': videoRow('') },
      })
    ).toBe('missing-second')
    expect(
      officialDraftError({
        kind: 'video',
        rows: {
          '480p': videoRow('0.5', { referenceSecond: '0.6' }),
          '720p': videoRow('0.8'),
        },
      })
    ).toBe('missing-reference')
  })

  test('an expression the form cannot show returns no draft', () => {
    expect(
      officialDraftFromExpr(layoutOf({}), 'tier("request", fixed(0.01))')
    ).toBeNull()
    expect(
      officialDraftFromExpr(
        layoutOf({}),
        'len > 200000 ? tier("long", p * 6 + c * 22) : tier("base", p * 3 + c * 15)'
      )
    ).toBeNull()
  })
})

afterEach(async () => {
  await i18next.changeLanguage('en')
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('category official price table', () => {
  const TOKEN_VIDEO_SCHEMA: BillingUsageSchema = {
    tokens: { type: 'number', unit: 'token' },
    resolution: { enum: ['720p', '4k'] },
    video_input: { enum: ['none', 'video'] },
  }

  test('per-second and token-billed video lines share one table over all their resolutions', () => {
    const result = categoryOfficialLayout([
      model({
        model_name: 'g',
        billing_usage_schema: {
          seconds: { type: 'number', unit: 'second' },
          resolution: { enum: ['480p', '720p'] },
        },
      }),
      model({ model_name: 'e', billing_usage_schema: TOKEN_VIDEO_SCHEMA }),
    ])

    expect(result.conflicts).toEqual([])
    expect(result.layout?.kind === 'video' && result.layout.options).toEqual([
      '480p',
      '720p',
      '4k',
    ])
    expect(
      result.layout?.kind === 'video' && result.layout.referenceSwitchValue
    ).toBe('video')
  })

  test('a table keeps only the filled resolutions and round-trips through the form', () => {
    const result = categoryOfficialLayout([
      model({ billing_usage_schema: TOKEN_VIDEO_SCHEMA }),
    ])
    const layout = result.layout
    if (!layout) throw new Error('expected a layout')
    const draft: VideoOfficialDraft = {
      kind: 'video',
      rows: {
        '720p': videoRow('1', { referenceSecond: '1.2' }),
        '4k': videoRow(''),
      },
    }

    const table = officialTableFromDraft(draft)

    expect(table).toEqual({
      kind: 'video',
      rows: [{ option: '720p', second: 1, reference_second: 1.2 }],
    })
    expect(officialDraftError(draft, { allowBlankRows: true })).toBeNull()
    if (!table) throw new Error('expected a table')
    expect(officialDraftFromTable(layout, table)).toEqual(draft)
  })

  test('a model shows the table rows of the resolutions it supports', () => {
    const pricing = getOfficialVideoPricing(
      model({
        billing_usage_schema: TOKEN_VIDEO_SCHEMA,
        official_price: {
          kind: 'video',
          rows: [
            { option: '480p', second: 0.5 },
            { option: '4k', second: 3, reference_second: 3.5 },
            { option: '720p', second: 1 },
          ],
        },
      })
    )

    expect(pricing?.optionField).toBe('resolution')
    expect(
      pricing?.rows.map((row) => [
        row.option,
        row.secondPrice,
        row.referenceSecondPrice,
      ])
    ).toEqual([
      ['720p', 1, undefined],
      ['4k', 3, 3.5],
    ])
  })

  test('the CNY list price round-trips and shows in place of the USD price only in Chinese', async () => {
    const layout = categoryOfficialLayout([
      model({ billing_usage_schema: TOKEN_VIDEO_SCHEMA }),
    ]).layout
    if (!layout) throw new Error('expected a layout')
    const draft: VideoOfficialDraft = {
      kind: 'video',
      rows: {
        '720p': videoRow('0.15', {
          referenceSecond: '0.09',
          secondCny: '0.99',
          referenceSecondCny: '0.6',
        }),
        '4k': videoRow('0.78'),
      },
    }
    const table = officialTableFromDraft(draft)
    expect(table).toEqual({
      kind: 'video',
      rows: [
        {
          option: '720p',
          second: 0.15,
          reference_second: 0.09,
          second_cny: 0.99,
          reference_second_cny: 0.6,
        },
        { option: '4k', second: 0.78 },
      ],
    })
    if (!table) throw new Error('expected a table')
    expect(officialDraftFromTable(layout, table)).toEqual(draft)

    const shown = model({
      billing_usage_schema: TOKEN_VIDEO_SCHEMA,
      official_price: table,
    })
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'USD',
        usdExchangeRate: 7,
      },
    })
    const prices = () =>
      getOfficialVideoPricing(shown)?.rows.map((row) => [
        row.option,
        Number(row.secondPrice.toFixed(6)),
        row.referenceSecondPrice && Number(row.referenceSecondPrice.toFixed(6)),
      ])

    await i18next.changeLanguage('en')
    expect(prices()).toEqual([
      ['720p', 0.15, 0.09],
      ['4k', 0.78, undefined],
    ])
    // A Chinese interface shows CNY: 0.99 / 7 USD displays as ¥0.99, and a
    // row without a CNY price falls back to its USD price.
    await i18next.changeLanguage('zhCN')
    expect(prices()).toEqual([
      ['720p', Number((0.99 / 7).toFixed(6)), Number((0.6 / 7).toFixed(6))],
      ['4k', 0.78, undefined],
    ])
  })

  test('a model official price expression takes precedence over the inherited table', () => {
    const pricing = getOfficialVideoPricing(
      model({
        billing_usage_schema: SWITCH_SCHEMA,
        official_price_expr:
          'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p", u("seconds") * 0.4) : u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 0.5) : u("resolution") == "720p" && u("video_input") == "none" ? tier("720p", u("seconds") * 0.6) : tier("720p·video", u("seconds") * 0.7)',
        official_price: {
          kind: 'video',
          rows: [{ option: '480p', second: 9 }],
        },
      })
    )

    expect(pricing?.rows.map((row) => row.secondPrice)).toEqual([0.4, 0.6])
  })

  test('a token table shows as per-1M-token prices', () => {
    expect(
      getOfficialTokenPricing(
        model({ official_price: { kind: 'token', input: 2, output: 8 } })
      )
    ).toEqual({ input: 2, output: 8 })
  })
})
