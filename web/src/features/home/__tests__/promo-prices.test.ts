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

import type { PricingModel } from '@/features/pricing/types'

import { emptyPromoCard, type PromoCard } from '../lib/promo-popup'
import { applyLivePromoPrices } from '../lib/promo-prices'

const CONTEXT = {
  priceRate: 1,
  usdExchangeRate: 1,
  t: ((key: string) => key) as unknown as TFunction,
}

const VIDEO_MODEL: PricingModel = {
  id: 1,
  model_name: 'video',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  group_ratio: { default: 2 },
  billing_mode: 'tiered_expr',
  billing_expr:
    'u("resolution") == "480p" ? tier("480p", u("seconds") * 1) : tier("720p", u("seconds") * 3)',
  billing_usage_schema: {
    seconds: { type: 'number', unit: 'second' },
    resolution: { enum: ['480p', '720p'] },
  },
}

function listCard(deal: Partial<PromoCard['deals'][number]>): PromoCard {
  const card = emptyPromoCard('list')
  return {
    ...card,
    deals: [
      {
        ...card.deals[0],
        modelName: 'video',
        salePrice: 'stored',
        originalPrice: 'entered',
        unit: 'stored unit',
        autoPrice: true,
        priceOption: '720p',
        ...deal,
      },
    ],
  }
}

describe('live promo prices', () => {
  it('shows the current selling price of the followed option', () => {
    const [card] = applyLivePromoPrices([listCard({})], [VIDEO_MODEL], CONTEXT)
    expect(card.deals[0].salePrice).toMatch(/6(\.00)?$/)
    expect(card.deals[0].unit).toBe('/second · 720p')
  })

  it('keeps the entered original price when the model publishes none', () => {
    const [card] = applyLivePromoPrices([listCard({})], [VIDEO_MODEL], CONTEXT)
    expect(card.deals[0].originalPrice).toBe('entered')
  })

  it('leaves a line that does not follow its model unchanged', () => {
    const [card] = applyLivePromoPrices(
      [listCard({ autoPrice: false })],
      [VIDEO_MODEL],
      CONTEXT
    )
    expect(card.deals[0].salePrice).toBe('stored')
  })

  it('falls back to the stored price when the model or option is gone', () => {
    const missingModel = applyLivePromoPrices([listCard({})], [], CONTEXT)
    const missingOption = applyLivePromoPrices(
      [listCard({ priceOption: '1080p' })],
      [VIDEO_MODEL],
      CONTEXT
    )
    expect(missingModel[0].deals[0].salePrice).toBe('stored')
    expect(missingOption[0].deals[0].salePrice).toBe('stored')
  })
})
