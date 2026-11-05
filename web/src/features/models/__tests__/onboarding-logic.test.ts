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

import type { ModelPricingEntry } from '@/features/model-pricing/api'

import {
  assignModelCategory,
  hasEffectivePricing,
  undeclaredUsageKeys,
  joinDescriptions,
  matchesOnboardingFilter,
  officialMetadataValues,
  onboardingStatus,
} from '../lib/onboarding'
import type { OnboardingModel, Vendor } from '../types'

const channel = { id: 1, name: 'alpha', type: 1, group: 'default', status: 1 }

function item(overrides: Partial<OnboardingModel>): OnboardingModel {
  return {
    model_name: 'gpt-new',
    pending_channels: [],
    removed_channels: [],
    channels: [channel],
    metadata_id: 1,
    ...overrides,
  }
}

describe('onboarding status', () => {
  it('keeps a fully configured model out of the to-do list', () => {
    const status = onboardingStatus(
      item({}),
      new Set(['gpt-new']),
      new Map([['gpt-new', 'Chat']])
    )

    expect(status.category).toBe('Chat')
    expect(matchesOnboardingFilter(status, 'todo')).toBe(false)
    expect(matchesOnboardingFilter(status, 'all')).toBe(true)
  })

  it('keeps an ignored model only under ignored and all whatever work it has', () => {
    const status = onboardingStatus(
      item({
        ignored: true,
        channels: [],
        pending_channels: [channel],
        removed_channels: [channel],
        metadata_id: 0,
      }),
      new Set(),
      new Map(),
      new Set(['gpt-new'])
    )

    expect(matchesOnboardingFilter(status, 'ignored')).toBe(true)
    expect(matchesOnboardingFilter(status, 'all')).toBe(true)
    expect(matchesOnboardingFilter(status, 'todo')).toBe(false)
    expect(matchesOnboardingFilter(status, 'pending')).toBe(false)
    expect(matchesOnboardingFilter(status, 'removed')).toBe(false)
    expect(matchesOnboardingFilter(status, 'priced')).toBe(false)
  })

  it('leaves a model that is not ignored out of the ignored filter', () => {
    const status = onboardingStatus(item({}), new Set(), new Map())

    expect(matchesOnboardingFilter(status, 'ignored')).toBe(false)
  })

  it('lists a model offered upstream but on no channel under to-do and new upstream', () => {
    const status = onboardingStatus(
      item({ pending_channels: [channel], channels: [], metadata_id: 0 }),
      new Set(),
      new Map()
    )

    expect(status).toMatchObject({
      pending: true,
      onChannel: false,
      hasMetadata: false,
      hasPrice: false,
    })
    expect(matchesOnboardingFilter(status, 'todo')).toBe(true)
    expect(matchesOnboardingFilter(status, 'pending')).toBe(true)
  })

  it('treats a matching metadata rule as metadata and unknown pricing as not blocking', () => {
    const status = onboardingStatus(
      item({ metadata_id: 0, metadata_rule: 'gpt-' }),
      undefined,
      new Map()
    )

    expect(status.hasMetadata).toBe(true)
    expect(status.hasPrice).toBeUndefined()
    expect(matchesOnboardingFilter(status, 'todo')).toBe(false)
  })

  it('lists a model its upstream delisted under to-do and delisted upstream', () => {
    const status = onboardingStatus(
      item({ removed_channels: [channel] }),
      new Set(['gpt-new']),
      new Map()
    )

    expect(status.removed).toBe(true)
    expect(matchesOnboardingFilter(status, 'todo')).toBe(true)
    expect(matchesOnboardingFilter(status, 'removed')).toBe(true)
    expect(matchesOnboardingFilter(status, 'pending')).toBe(false)
  })
})

describe('undeclaredUsageKeys', () => {
  const expression =
    'u("video_input") == "video" ? tier("a", u("tokens") * 2) : tier("b", u("tokens") * 3)'

  it('lists each usage field the schema lacks once', () => {
    expect(undeclaredUsageKeys(expression, { seconds: {} })).toEqual([
      'video_input',
      'tokens',
    ])
  })

  it('finds nothing when the schema declares every field', () => {
    expect(
      undeclaredUsageKeys(expression, { tokens: {}, video_input: {} })
    ).toEqual([])
  })

  it('skips models without a schema or an expression', () => {
    expect(undeclaredUsageKeys(expression, undefined)).toEqual([])
    expect(undeclaredUsageKeys(undefined, { tokens: {} })).toEqual([])
  })
})

describe('hasEffectivePricing', () => {
  const entry = (effective: ModelPricingEntry['effective']) =>
    ({ effective }) as ModelPricingEntry

  it('ignores the display-only official price and empty plugin maps', () => {
    expect(
      hasEffectivePricing(
        entry({
          'billing_setting.official_price_expr': 'p * 1',
          'billing_setting.plugin_billing_expr': {},
        })
      )
    ).toBe(false)
  })

  it('counts a model ratio as a price', () => {
    expect(hasEffectivePricing(entry({ ModelRatio: 0.5 }))).toBe(true)
  })
})

describe('assignModelCategory', () => {
  const categories = [
    {
      id: 'a',
      name: 'A',
      description: '',
      models: ['m1', 'x'],
      badges: { x: ['hot' as const] },
    },
    { id: 'b', name: 'B', description: '', models: ['m2'] },
  ]

  it('moves the model out of its old category, badges included, and appends it to the new one', () => {
    expect(assignModelCategory(categories, 'x', 'b', ['new'])).toEqual([
      {
        id: 'a',
        name: 'A',
        description: '',
        models: ['m1'],
        badges: undefined,
      },
      {
        id: 'b',
        name: 'B',
        description: '',
        models: ['m2', 'x'],
        badges: { x: ['new'] },
      },
    ])
  })

  it('keeps the position and replaces badges when the category stays the same', () => {
    const [first] = assignModelCategory(categories, 'x', 'a', [])

    expect(first.models).toEqual(['m1', 'x'])
    expect(first.badges).toBeUndefined()
  })

  it('removes the model from every category when no category is chosen', () => {
    const next = assignModelCategory(categories, 'x', null, [])

    expect(next.flatMap((category) => category.models)).not.toContain('x')
  })
})

describe('official metadata', () => {
  it('writes language blocks when the descriptions differ', () => {
    expect(
      joinDescriptions([
        { locale: 'zh', text: '中文介绍' },
        { locale: 'en', text: 'English intro' },
      ])
    ).toBe('<!-- lang:zh -->\n中文介绍\n<!-- lang:en -->\nEnglish intro')
  })

  it('keeps one plain description when only one language has text or both match', () => {
    expect(
      joinDescriptions([
        { locale: 'zh', text: 'Same' },
        { locale: 'en', text: 'Same' },
      ])
    ).toBe('Same')
    expect(
      joinDescriptions([
        { locale: 'zh', text: '' },
        { locale: 'en', text: 'Only English' },
      ])
    ).toBe('Only English')
  })

  it('maps the vendor by name and drops a vendor this site lacks', () => {
    const vendors = [{ id: 7, name: 'OpenAI' } as Vendor]
    const upstream = {
      description: '',
      icon: 'OpenAI',
      tags: 'chat, vision',
      vendor: 'openai',
      endpoints: '',
      name_rule: 0,
      status: 1,
    }

    expect(officialMetadataValues(upstream, 'desc', vendors)).toEqual({
      description: 'desc',
      icon: 'OpenAI',
      tags: ['chat', 'vision'],
      vendorId: 7,
    })
    expect(
      officialMetadataValues({ ...upstream, vendor: 'Unknown' }, '', vendors)
        .vendorId
    ).toBeUndefined()
  })
})
