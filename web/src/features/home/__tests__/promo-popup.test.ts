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
import { describe, expect, it } from 'vitest'

import {
  EMPTY_PROMO_ANNOUNCEMENT,
  EMPTY_PROMO_POPUP,
  emptyPromoCard,
  getPromoDescriptionSize,
  getPromoPriceRatio,
  parsePromoPopup,
  type PromoCard,
  selectPromoAnnouncement,
  selectPromoCards,
  serializePromoPopup,
} from '../lib/promo-popup'

function modelCard(overrides: Partial<PromoCard> = {}): PromoCard {
  return {
    ...emptyPromoCard('model'),
    modelName: 'Seedance 2.5',
    salePrice: '¥0.10',
    ...overrides,
  }
}

describe('promo popup settings', () => {
  it.each(['', '   ', '{not json', '42', 'null'])(
    'reads %j as a disabled popup',
    (raw) => {
      expect(parsePromoPopup(raw)).toEqual(EMPTY_PROMO_POPUP)
    }
  )

  it('drops stored cards of an unknown kind', () => {
    const stored = JSON.stringify({
      enabled: true,
      cards: [{ kind: 'banner' }, { kind: 'list', deals: [] }],
    })
    expect(parsePromoPopup(stored).cards.map((card) => card.kind)).toEqual([
      'list',
    ])
  })

  it('stores only the fields of the card kind and reads them back', () => {
    const card: PromoCard = {
      ...emptyPromoCard('recharge'),
      modelName: 'left over from another kind',
      tiers: [{ pay: '¥100', bonus: '¥10' }],
    }
    const raw = serializePromoPopup({
      ...EMPTY_PROMO_POPUP,
      enabled: true,
      cards: [card],
    })

    expect(JSON.parse(raw).cards[0]).not.toHaveProperty('model_name')
    expect(parsePromoPopup(raw).cards[0].tiers).toEqual(card.tiers)
  })
})

describe('promo popup daily limit', () => {
  it.each([
    [undefined, 1],
    [3, 3],
    [20, 20],
    [0, 1],
    [21, 1],
    [1.5, 1],
    ['3', 1],
  ])('reads a stored limit of %j as %i', (stored, expected) => {
    const raw = JSON.stringify({ enabled: true, daily_limit: stored })
    expect(parsePromoPopup(raw).dailyLimit).toBe(expected)
  })

  it('keeps a changed limit even without cards', () => {
    const raw = serializePromoPopup({ ...EMPTY_PROMO_POPUP, dailyLimit: 3 })
    expect(parsePromoPopup(raw).dailyLimit).toBe(3)
  })

  it('stores nothing for untouched settings', () => {
    expect(serializePromoPopup(EMPTY_PROMO_POPUP)).toBe('')
  })
})

describe('promo card selection', () => {
  const today = '2026-11-04'

  it('shows nothing while the popup is disabled', () => {
    expect(
      selectPromoCards(
        { ...EMPTY_PROMO_POPUP, enabled: false, cards: [modelCard()] },
        'en',
        today
      )
    ).toEqual([])
  })

  it.each([
    ['', 1],
    ['2026-11-04', 1],
    ['2026-11-03', 0],
  ])('with last day %j keeps %i cards on the day', (endsAt, expected) => {
    expect(
      selectPromoCards(
        { ...EMPTY_PROMO_POPUP, enabled: true, cards: [modelCard({ endsAt })] },
        'en',
        today
      )
    ).toHaveLength(expected)
  })

  it('hides a card without its required content', () => {
    expect(
      selectPromoCards(
        {
          ...EMPTY_PROMO_POPUP,
          enabled: true,
          cards: [modelCard({ salePrice: '' })],
        },
        'en',
        today
      )
    ).toEqual([])
  })

  it.each([
    ['zh-CN', '特价'],
    ['zh-TW', '特价'],
    ['fr', 'Sale'],
  ])('in %s uses the title %s', (language, title) => {
    const [card] = selectPromoCards(
      {
        ...EMPTY_PROMO_POPUP,
        enabled: true,
        cards: [modelCard({ title: 'Sale', titleZh: '特价' })],
      },
      language,
      today
    )
    expect(card.title).toBe(title)
  })
})

describe('promo announcement bar', () => {
  const announcement = {
    enabled: true,
    text: 'Seedance 2.5 is live',
    textZh: 'Seedance 2.5 已上线',
    href: '/pricing',
  }

  it('stores the announcement alone and reads it back', () => {
    const stored = serializePromoPopup({ ...EMPTY_PROMO_POPUP, announcement })
    expect(parsePromoPopup(stored).announcement).toEqual(announcement)
  })

  it('stores nothing when neither the popup nor the bar is set', () => {
    expect(
      serializePromoPopup({
        ...EMPTY_PROMO_POPUP,
        announcement: EMPTY_PROMO_ANNOUNCEMENT,
      })
    ).toBe('')
  })

  it.each([
    ['zh-CN', 'Seedance 2.5 已上线'],
    ['zh-TW', 'Seedance 2.5 已上线'],
    ['ja', 'Seedance 2.5 is live'],
  ])('in %s shows %s with its link', (language, text) => {
    expect(selectPromoAnnouncement(announcement, language)).toEqual({
      text,
      href: '/pricing',
    })
  })

  it('falls back to the default text when the Chinese text is empty', () => {
    expect(
      selectPromoAnnouncement({ ...announcement, textZh: ' ' }, 'zh-CN')?.text
    ).toBe('Seedance 2.5 is live')
  })

  it('shows nothing while the bar is off', () => {
    expect(
      selectPromoAnnouncement({ ...announcement, enabled: false }, 'en')
    ).toBeNull()
  })

  it('shows nothing when the language has no text', () => {
    expect(
      selectPromoAnnouncement({ ...announcement, text: '', textZh: '' }, 'en')
    ).toBeNull()
  })
})

describe('promo price ratio', () => {
  it('reads amounts out of display text', () => {
    expect(getPromoPriceRatio('¥0.10', '¥0.20')).toBe(0.5)
    expect(getPromoPriceRatio('$1,000', '$2,000')).toBe(0.5)
  })

  it.each([
    ['¥0.20', '¥0.10'],
    ['¥0.20', '¥0.20'],
    ['¥0.10', ''],
    ['free', '¥0.20'],
  ])('reports no saving for %s against %s', (sale, original) => {
    expect(getPromoPriceRatio(sale, original)).toBeNull()
  })

  it('reports no saving when the prices are written in different currencies', () => {
    expect(getPromoPriceRatio('$0.06', '¥0.99')).toBeNull()
  })

  it('compares an unmarked original price with a marked sale price', () => {
    expect(getPromoPriceRatio('$0.10', '0.20')).toBe(0.5)
  })
})

describe('promo description size', () => {
  it('uses large type for a few short lines', () => {
    expect(
      getPromoDescriptionSize(
        '✅ 储值到帐后立即生效，不用申请\n✅ 优惠适用于全部模型和分组\n✅ 储值金额全额到账，可随时使用'
      )
    ).toBe('large')
  })

  it('steps down to medium for a paragraph', () => {
    expect(getPromoDescriptionSize('赠送额度'.repeat(25))).toBe('medium')
  })

  it('keeps long copy small so it fits the card', () => {
    expect(getPromoDescriptionSize('赠送额度'.repeat(40))).toBe('small')
  })

  it('counts Latin letters narrower than CJK characters', () => {
    expect(getPromoDescriptionSize('a'.repeat(120))).toBe('large')
    expect(getPromoDescriptionSize('赠'.repeat(120))).toBe('medium')
  })
})
