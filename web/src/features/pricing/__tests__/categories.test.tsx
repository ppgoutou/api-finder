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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { usePricingData } from '../hooks/use-pricing-data'
import {
  comparisonForModels,
  filterByCategory,
  groupModelsByCategory,
  modelBadgesByName,
  UNCATEGORIZED_CATEGORY,
} from '../lib/categories'
import type { PricingCategory, PricingModel } from '../types'

function model(name: string): PricingModel {
  return {
    id: name.length,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['user'],
  }
}

const models = ['seedance-2.0', 'sd-2.0-线路1', 'seedance-2.5', 'wan3.0'].map(
  model
)
const categories: PricingCategory[] = [
  { id: 'sd25', name: 'Seedance 2.5', models: ['seedance-2.5'] },
  {
    id: 'sd20',
    name: 'Seedance 2.0',
    description: 'Seedance 2.0 lines',
    models: ['sd-2.0-线路1', 'removed-model', 'seedance-2.0'],
  },
  { id: 'empty', name: 'Empty', models: ['removed-model'] },
]

const names = (items: PricingModel[]) => items.map((item) => item.model_name)

describe('pricing categories', () => {
  it('returns no sections when no category is configured', () => {
    expect(groupModelsByCategory(models, [])).toEqual([])
  })

  it('orders sections and their models as configured and ends with the uncategorized models', () => {
    const sections = groupModelsByCategory(models, categories)

    expect(sections.map((section) => section.id)).toEqual([
      'sd25',
      'sd20',
      UNCATEGORIZED_CATEGORY,
    ])
    expect(names(sections[1].models)).toEqual(['sd-2.0-线路1', 'seedance-2.0'])
    expect(sections[1].description).toBe('Seedance 2.0 lines')
    expect(names(sections[2].models)).toEqual(['wan3.0'])
  })

  it('drops a section whose models are all filtered out', () => {
    const sections = groupModelsByCategory([model('wan3.0')], categories)

    expect(sections.map((section) => section.id)).toEqual([
      UNCATEGORIZED_CATEGORY,
    ])
  })

  it('omits the uncategorized section when every model has a category', () => {
    const sections = groupModelsByCategory(models.slice(0, 3), categories)

    expect(sections.map((section) => section.id)).toEqual(['sd25', 'sd20'])
  })

  it('filters to one category, to the uncategorized models, or keeps all for an unknown id', () => {
    expect(names(filterByCategory(models, 'sd20', categories))).toEqual([
      'seedance-2.0',
      'sd-2.0-线路1',
    ])
    expect(
      names(filterByCategory(models, UNCATEGORIZED_CATEGORY, categories))
    ).toEqual(['wan3.0'])
    expect(filterByCategory(models, 'deleted', categories)).toHaveLength(4)
  })

  it('collects card badges across categories in the fixed badge order and skips empty or unknown ones', () => {
    const badged = modelBadgesByName([
      {
        id: 'a',
        name: 'A',
        models: ['seedance-2.0', 'wan3.0'],
        badges: { 'seedance-2.0': ['new', 'recommended'], 'wan3.0': [] },
      },
      {
        id: 'b',
        name: 'B',
        models: ['seedance-2.5'],
        badges: {
          'seedance-2.5': ['free' as never, 'hot'],
        },
      },
    ])

    expect([...badged]).toEqual([
      ['seedance-2.0', ['recommended', 'new']],
      ['seedance-2.5', ['hot']],
    ])
  })

  describe('category descriptions', () => {
    afterEach(async () => {
      vi.restoreAllMocks()
      await i18next.changeLanguage('en')
    })

    it.each([
      ['en', 'Seedance 2.0 video models'],
      ['zhCN', '字节跳动 Seedance 2.0 视频模型'],
      ['zhTW', '字節跳動 Seedance 2.0 影片模型'],
      ['fr', 'Seedance 2.0 video models'],
    ])(
      'shows the %s block of a multi-language category description and comparison',
      async (language, expected) => {
        await i18next.changeLanguage(language)
        vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
          if (url !== '/api/pricing') return { data: { success: true } }
          return {
            data: {
              success: true,
              data: [],
              vendors: [],
              group_ratio: {},
              usable_group: {},
              supported_endpoint: {},
              auto_groups: [],
              categories: [
                {
                  id: 'sd20',
                  name: 'Seedance 2.0',
                  models: ['seedance-2.0'],
                  description:
                    '<!-- lang:zh -->\n字节跳动 Seedance 2.0 视频模型\n' +
                    '<!-- lang:zh-TW -->\n字節跳動 Seedance 2.0 影片模型\n' +
                    '<!-- lang:en -->\nSeedance 2.0 video models',
                  comparison:
                    '<!-- lang:zh -->\n字节跳动 Seedance 2.0 视频模型\n' +
                    '<!-- lang:zh-TW -->\n字節跳動 Seedance 2.0 影片模型\n' +
                    '<!-- lang:en -->\nSeedance 2.0 video models',
                },
              ],
            },
          }
        })
        const queryClient = new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
        const wrapper = (props: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        )

        const { result } = renderHook(() => usePricingData(), { wrapper })

        await waitFor(() =>
          expect(result.current.categories[0]?.description).toBe(expected)
        )
        expect(result.current.categories[0]?.comparison).toBe(expected)
      }
    )
  })

  describe('comparisonForModels', () => {
    const comparison = [
      '- **Doubao Seedance 2.0（官方 · 国内线路）**：最稳定；支持 4K。',
      '- **Dreamina Seedance 2.0（官方 · 海外线路）**：走海外线路，',
      '  价格贵约 8%。',
      '- **Seedance 2.0 (F)**：按秒计费。',
      '- **Seedance 2.0 (D)**：带参考视频要加价，',
      '每个素材都要在提示词里引用。',
      '',
      '均为 4–15 秒。',
    ].join('\n')
    const doubao = {
      model_name: 'doubao-seedance-2-0',
      display_name: 'Doubao Seedance 2.0',
    }
    const fast = {
      model_name: 'seedance-2.0-f',
      display_name: 'Seedance 2.0 (F)',
    }

    it('keeps only the entries of the models the visitor can see', () => {
      expect(comparisonForModels(comparison, [doubao, fast])).toBe(
        [
          '- **Doubao Seedance 2.0（官方 · 国内线路）**：最稳定；支持 4K。',
          '- **Seedance 2.0 (F)**：按秒计费。',
          '',
          '均为 4–15 秒。',
        ].join('\n')
      )
    })

    it('matches a model name when the model has no display name', () => {
      const text =
        '- **seedance-2.0-f**: fast\n- **seedance-2.0-d**: dev\n- **sd-pro**: pro'
      expect(
        comparisonForModels(text, [
          { model_name: 'seedance-2.0-f' },
          { model_name: 'SD-Pro' },
        ])
      ).toBe('- **seedance-2.0-f**: fast\n- **sd-pro**: pro')
    })

    it('drops a half-width note and matches a short label', () => {
      const text = [
        '- **Doubao Mini (official · China route)**: stable.',
        '- **Dreamina Mini (official · overseas route)**: overseas.',
        '- **Mini (F)**: cheaper.',
        '- **Mini (D)**: dev.',
      ].join('\n')
      expect(
        comparisonForModels(text, [
          {
            model_name: 'doubao-mini',
            display_name: 'Doubao Seedance 2.0 Mini',
          },
          { model_name: 'mini-yh', display_name: 'Seedance 2.0 Mini (F)' },
        ])
      ).toBe(
        '- **Doubao Mini (official · China route)**: stable.\n- **Mini (F)**: cheaper.'
      )
    })

    it('shows nothing when fewer than two named models remain', () => {
      expect(comparisonForModels(comparison, [fast])).toBe('')
    })

    it('keeps text that names no model', () => {
      const text = 'Doubao is the most stable.\n\n- faster\n- cheaper'
      expect(comparisonForModels(text, [fast])).toBe(text)
    })
  })
})
