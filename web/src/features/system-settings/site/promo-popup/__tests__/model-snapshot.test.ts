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
import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'

import { getPromoModelPrices } from '@/features/home/lib/promo-prices'
import type { PricingModel } from '@/features/pricing/types'

import { getPromoModelDescriptions } from '../model-snapshot'

const t = ((key: string) => key) as unknown as TFunction
const CONTEXT = { priceRate: 1, usdExchangeRate: 1, t }

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    group_ratio: { default: 2 },
    billing_mode: 'tiered_expr',
    ...overrides,
  }
}

const VIDEO = {
  billing_expr:
    'u("resolution") == "480p" ? tier("480p", u("seconds") * 1) : tier("720p", u("seconds") * 3)',
  billing_usage_schema: {
    seconds: { type: 'number' as const, unit: 'second' as const },
    resolution: { enum: ['480p', '720p'] },
  },
}

describe('promo model prices', () => {
  it('uses the selling price with the group ratio, never the base price', () => {
    const rows = getPromoModelPrices(model(VIDEO), CONTEXT)

    expect(rows.map((row) => row.option)).toEqual(['480p', '720p'])
    expect(rows[0].salePrice).toContain('2')
    expect(rows[1].salePrice).toContain('6')
    expect(rows[0].unit).toBe('/second · 480p')
  })

  it('leaves the original price empty without a published official price', () => {
    const [row] = getPromoModelPrices(model(VIDEO), CONTEXT)
    expect(row.originalPrice).toBe('')
  })

  it('uses the published official price, without the group ratio, as original', () => {
    const [row] = getPromoModelPrices(
      model({
        ...VIDEO,
        official_price_expr:
          'u("resolution") == "480p" ? tier("480p", u("seconds") * 5) : tier("720p", u("seconds") * 7)',
      }),
      CONTEXT
    )
    expect(row.originalPrice).toContain('5')
    expect(row.originalPrice).not.toContain('10')
  })

  it('reads a per-image price with the group ratio', () => {
    const rows = getPromoModelPrices(
      model({ billing_expr: 'tier("image", fixed(4)) * image_count' }),
      CONTEXT
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].salePrice).toContain('8')
    expect(rows[0].unit).toBe('/image')
  })

  it('reports no price for a billing expression it cannot read', () => {
    expect(
      getPromoModelPrices(model({ billing_expr: 'not an expression' }), CONTEXT)
    ).toEqual([])
  })
})

describe('promo model descriptions', () => {
  it('picks the English and Chinese blocks', () => {
    expect(
      getPromoModelDescriptions(
        model({
          description: '<!-- lang:zh -->\n中文说明\n<!-- lang:en -->\nEnglish',
        })
      )
    ).toEqual({ description: 'English', descriptionZh: '中文说明' })
  })

  it('shortens a long description to what a card can store', () => {
    const { description } = getPromoModelDescriptions(
      model({ description: 'x'.repeat(200) })
    )
    expect(description).toHaveLength(160)
    expect(description.endsWith('…')).toBe(true)
  })
})
