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
import { describe, expect, test } from 'vitest'

import {
  getOfficialVideoPricing,
  getPerVideoPricing,
  getReferenceOrderExample,
  getTokenVideoPricing,
  getVideoPricing,
  isVideoPricingSchema,
} from '../lib/video-pricing'
import type { BillingUsageSchema, PricingModel } from '../types'

const VIDEO_SCHEMA: BillingUsageSchema = {
  seconds: { type: 'number', unit: 'second' },
  reference_video_tokens: { type: 'number', unit: 'token' },
  resolution: { enum: ['480p', '720p', '1080p'] },
}

function videoModel(
  billingExpr: string,
  overrides: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: 1,
    model_name: 'seedance-2.5',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    billing_mode: 'tiered_expr',
    billing_expr: billingExpr,
    billing_usage_schema: VIDEO_SCHEMA,
    model_limits: { minDuration: 4, maxDuration: 30 },
    ...overrides,
  }
}

const SEEDANCE_25_EXPR =
  'u("resolution") == "480p" ? tier("480p", u("reference_video_tokens") * 40 / 1000000 + u("seconds") * 0.6) : ' +
  'u("resolution") == "720p" ? tier("720p", u("reference_video_tokens") * 42 / 1000000 + u("seconds") * 1.5) : ' +
  'tier("1080p", u("reference_video_tokens") * 46 / 1000000 + u("seconds") * 3.7)'

describe('video pricing', () => {
  test('lists per-second and per-million reference prices per resolution in schema order', () => {
    const pricing = getVideoPricing(videoModel(SEEDANCE_25_EXPR))

    expect(pricing?.rows).toEqual([
      {
        option: '480p',
        secondPrice: 0.6,
        referencePricePerMillion: 40,
        tokensPerSecond: 10044,
      },
      {
        option: '720p',
        secondPrice: 1.5,
        referencePricePerMillion: 42,
        tokensPerSecond: 21600,
      },
      {
        option: '1080p',
        secondPrice: 3.7,
        referencePricePerMillion: 46,
        tokensPerSecond: 48600,
      },
    ])
    expect(pricing?.hasReferencePricing).toBe(true)
    expect(pricing?.durationRange).toEqual([4, 30])
  })

  test('omits the duration range for models whose plugin declares none', () => {
    const pricing = getVideoPricing(
      videoModel(SEEDANCE_25_EXPR, {
        model_name: 'unknown-video',
        model_limits: { ratios: ['16:9'] },
      })
    )

    expect(pricing?.durationRange).toBeUndefined()
  })

  test('keeps the generic display when an option adds a per-request charge', () => {
    const pricing = getVideoPricing(
      videoModel(
        'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.6 + 0.1) : tier("720p", u("seconds") * 1.5)'
      )
    )

    expect(pricing).toBeNull()
  })

  test('keeps the generic display when request rules adjust the price', () => {
    const pricing = getVideoPricing(
      videoModel(
        `(${SEEDANCE_25_EXPR}) * (header("x-priority") == "high" ? 2 : 1)`
      )
    )

    expect(pricing).toBeNull()
  })

  test('recognizes only one-enum schemas metered in seconds with an optional token field', () => {
    expect(isVideoPricingSchema(VIDEO_SCHEMA)).toBe(true)
    expect(
      isVideoPricingSchema({
        seconds: { type: 'number', unit: 'second' },
        resolution: { enum: ['480p'] },
      })
    ).toBe(true)
    expect(
      isVideoPricingSchema({
        seconds: { type: 'number', unit: 'second' },
        resolution: { enum: ['480p'] },
        mode: { enum: ['std', 'pro'] },
      })
    ).toBe(false)
    expect(
      isVideoPricingSchema({
        tokens: { type: 'number', unit: 'token' },
        resolution: { enum: ['480p'] },
      })
    ).toBe(false)
  })

  test('bills a short reference video as 2/3 of the output, rounded up', () => {
    const pricing = getVideoPricing(videoModel(SEEDANCE_25_EXPR))
    if (!pricing) throw new Error('expected video pricing')

    const example = getReferenceOrderExample(pricing, 5, 15, '720p')

    expect(example).toMatchObject({
      option: '720p',
      billedReferenceSeconds: 10,
      tokens: 540000,
      pricePerMillion: 42,
    })
    expect(example?.cost).toBeCloseTo(22.68)
  })

  test('bills a long reference video by its own length', () => {
    const pricing = getVideoPricing(videoModel(SEEDANCE_25_EXPR))
    if (!pricing) throw new Error('expected video pricing')

    const example = getReferenceOrderExample(pricing, 12, 15, '720p')

    expect(example?.billedReferenceSeconds).toBe(12)
    expect(example?.tokens).toBe(27 * 21600)
  })

  test('prices the only option of a single-resolution model from one unconditional tier', () => {
    const pricing = getVideoPricing(
      videoModel('tier("720p", u("seconds") * 0.27)', {
        billing_usage_schema: {
          seconds: { type: 'number', unit: 'second' },
          resolution: { enum: ['720p'] },
        },
      })
    )

    expect(pricing?.rows).toEqual([
      { option: '720p', secondPrice: 0.27, tokensPerSecond: 21600 },
    ])
    expect(pricing?.hasReferencePricing).toBe(false)
  })

  test('keeps the generic display for an unconditional tier when several options exist', () => {
    expect(
      getVideoPricing(videoModel('tier("base", u("seconds") * 0.27)'))
    ).toBeNull()
  })

  test('reads the official price from its own expression and ignores the charged one', () => {
    const model = videoModel(SEEDANCE_25_EXPR, {
      official_price_expr: SEEDANCE_25_EXPR.replaceAll('* 0.6)', '* 0.9)'),
    })

    expect(getOfficialVideoPricing(model)?.rows[0].secondPrice).toBe(0.9)
    expect(getVideoPricing(model)?.rows[0].secondPrice).toBe(0.6)
    expect(
      getOfficialVideoPricing({ ...model, official_price_expr: ' ' })
    ).toBeNull()
  })
})

describe('per-second video pricing with a reference video switch', () => {
  const SWITCH_SCHEMA: BillingUsageSchema = {
    seconds: { type: 'number', unit: 'second' },
    video_input: { enum: ['none', 'video'] },
    resolution: { enum: ['480p', '720p', '1080p'] },
  }
  const SWITCH_EXPR =
    'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("seconds") * 0.5) : ' +
    'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 0.65) : ' +
    'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("seconds") * 0.8) : ' +
    'u("resolution") == "720p" && u("video_input") == "video" ? tier("720p·video", u("seconds") * 1.05) : ' +
    'u("resolution") == "1080p" && u("video_input") == "none" ? tier("1080p·none", u("seconds") * 1.45) : ' +
    'tier("1080p·video", u("seconds") * 1.9)'

  function switchModel(expression: string): PricingModel {
    return videoModel(expression, { billing_usage_schema: SWITCH_SCHEMA })
  }

  test('lists the plain and reference price per second of each resolution', () => {
    const pricing = getVideoPricing(switchModel(SWITCH_EXPR))

    expect(pricing?.optionField).toBe('resolution')
    expect(pricing?.hasReferencePricing).toBe(true)
    expect(
      pricing?.rows.map((row) => [
        row.option,
        row.secondPrice,
        row.referenceSecondPrice,
      ])
    ).toEqual([
      ['480p', 0.5, 0.65],
      ['720p', 0.8, 1.05],
      ['1080p', 1.45, 1.9],
    ])
    expect(pricing?.rows[0].referencePricePerMillion).toBeUndefined()
  })

  test('recognizes the switch only when its values are none and one other', () => {
    expect(isVideoPricingSchema(SWITCH_SCHEMA)).toBe(true)
    expect(
      isVideoPricingSchema({
        ...SWITCH_SCHEMA,
        video_input: { enum: ['none', 'video', 'audio'] },
      })
    ).toBe(false)
    expect(
      isVideoPricingSchema({
        ...SWITCH_SCHEMA,
        reference_video_tokens: { type: 'number', unit: 'token' },
      })
    ).toBe(false)
  })

  test('reads a single-resolution model from its reference switch alone', () => {
    const pricing = getVideoPricing(
      videoModel(
        'u("video_input") == "video" ? tier("video", u("seconds") * 1.05) : tier("none", u("seconds") * 0.8)',
        {
          billing_usage_schema: {
            ...SWITCH_SCHEMA,
            resolution: { enum: ['720p'] },
          },
        }
      )
    )

    expect(pricing?.rows).toHaveLength(1)
    expect(pricing?.rows[0]).toMatchObject({
      option: '720p',
      secondPrice: 0.8,
      referenceSecondPrice: 1.05,
    })
  })

  test('keeps the generic display when a resolution has no reference price', () => {
    const expression =
      'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("seconds") * 0.5) : ' +
      'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 0.65) : ' +
      'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("seconds") * 0.8) : ' +
      'tier("1080p·none", u("seconds") * 1.45)'

    expect(getVideoPricing(switchModel(expression))).toBeNull()
  })

  test('keeps the generic display when a resolution has only a reference price', () => {
    const expression =
      'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("seconds") * 0.5) : ' +
      'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 0.65) : ' +
      'tier("720p·video", u("seconds") * 1.05)'

    expect(getVideoPricing(switchModel(expression))).toBeNull()
  })
})

describe('per-video pricing', () => {
  const PER_VIDEO_SCHEMA: BillingUsageSchema = {
    resolution: { enum: ['720p'] },
    videos: { type: 'number', unit: 'count' },
  }

  test('reads the flat price of a single-resolution model billed per video', () => {
    const pricing = getPerVideoPricing(
      videoModel('tier("base", u("videos") * 1.28)', {
        model_name: 'seedance-2.5-G2-V',
        billing_usage_schema: PER_VIDEO_SCHEMA,
      })
    )

    expect(pricing).toEqual({
      optionField: 'resolution',
      hasReferencePricing: false,
      durationRange: [4, 30],
      rows: [{ option: '720p', secondPrice: 0, videoPrice: 1.28 }],
    })
  })

  test('returns null for per-second models and per-video models with a fixed charge', () => {
    expect(getPerVideoPricing(videoModel(SEEDANCE_25_EXPR))).toBeNull()
    expect(
      getPerVideoPricing(
        videoModel('tier("base", u("videos") * 1.28 + 0.5)', {
          billing_usage_schema: PER_VIDEO_SCHEMA,
        })
      )
    ).toBeNull()
  })

  const TOKEN_SCHEMA: BillingUsageSchema = {
    resolution: { enum: ['480p', '720p'] },
    tokens: { type: 'number', unit: 'token' },
    video_input: { enum: ['none', 'video'] },
  }

  test('derives per-second prices of token-billed models from plain orders', () => {
    const pricing = getTokenVideoPricing(
      videoModel(
        'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("tokens") * 9.984 / 1000000) : ' +
          'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("tokens") * 16.692 / 1000000) : ' +
          'u("resolution") == "720p" && u("video_input") == "video" ? tier("720p·video", u("tokens") * 9.984 / 1000000) : ' +
          'tier("720p·none", u("tokens") * 16 / 1000000)',
        { model_name: 'seedance-2-5-NSFW', billing_usage_schema: TOKEN_SCHEMA }
      )
    )

    expect(pricing?.hasReferencePricing).toBe(true)
    expect(pricing?.durationRange).toEqual([4, 30])
    expect(
      pricing?.rows.map((row) => [row.option, row.tokensPerSecond])
    ).toEqual([
      ['480p', 10044],
      ['720p', 21600],
    ])
    expect(pricing?.rows[0].secondPrice).toBeCloseTo(0.167654, 6)
    expect(pricing?.rows[1].secondPrice).toBeCloseTo(0.3456, 6)
  })

  test('takes tokens per second from the plugin examples when it publishes them', () => {
    const pricing = getTokenVideoPricing(
      videoModel(
        'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("tokens") * 9.984 / 1000000) : ' +
          'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("tokens") * 16.692 / 1000000) : ' +
          'u("resolution") == "720p" && u("video_input") == "video" ? tier("720p·video", u("tokens") * 9.984 / 1000000) : ' +
          'tier("720p·none", u("tokens") * 16 / 1000000)',
        {
          model_name: 'A-seedance-2.5-P',
          billing_usage_schema: TOKEN_SCHEMA,
          billing_usage_examples: [
            {
              label: '480p · 5s',
              facts: { tokens: 48038, video_input: 'none', resolution: '480p' },
            },
            {
              label: '480p · 5s · ref video',
              facts: {
                tokens: 81664,
                video_input: 'video',
                resolution: '480p',
              },
            },
          ],
        }
      )
    )

    expect(
      pricing?.rows.map((row) => [row.option, row.tokensPerSecond])
    ).toEqual([
      ['480p', 9607.6],
      ['720p', 21600],
    ])
    expect(pricing?.rows[0].secondPrice).toBeCloseTo(0.16037, 6)
  })

  test('reads a single-resolution token model and rejects per-second schemas', () => {
    const pricing = getTokenVideoPricing(
      videoModel(
        'u("video_input") == "video" ? tier("720p·video", u("tokens") * 5 / 1000000) : tier("720p·none", u("tokens") * 8 / 1000000)',
        {
          billing_usage_schema: {
            ...TOKEN_SCHEMA,
            resolution: { enum: ['720p'] },
          },
        }
      )
    )
    expect(pricing?.rows).toEqual([
      { option: '720p', secondPrice: 0.1728, tokensPerSecond: 21600 },
    ])
    expect(getTokenVideoPricing(videoModel(SEEDANCE_25_EXPR))).toBeNull()
  })
})
