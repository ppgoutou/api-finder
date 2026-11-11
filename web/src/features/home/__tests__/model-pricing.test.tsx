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
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'
import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ModelPricing } from '../components/sections/model-pricing'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

function secondModel(
  name: string,
  prices: Record<string, number>,
  limits?: PricingModel['model_limits']
): PricingModel {
  const options = Object.keys(prices)
  const expr = options
    .map((option, index) =>
      index === options.length - 1
        ? `tier("${option}", u("seconds") * ${prices[option]})`
        : `u("resolution") == "${option}" ? tier("${option}", u("seconds") * ${prices[option]}) : `
    )
    .join('')
  return {
    id: 1,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['half'],
    billing_mode: 'tiered_expr',
    billing_expr: expr,
    billing_usage_schema: {
      seconds: { type: 'number', unit: 'second' },
      resolution: { enum: options },
    },
    model_limits: limits,
  }
}

const TOKEN_MINI: PricingModel = {
  id: 2,
  model_name: 'A-seedance-2.0-mini-P',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['half'],
  billing_mode: 'tiered_expr',
  // 480p is 10044 tokens per second: $0.10 and $0.06 per second.
  billing_expr:
    'u("resolution") == "480p" ? tier("480p", u("tokens") * 9.95619275189 / 1000000) : ' +
    'tier("720p", u("tokens") * 2.77777777778 / 1000000)',
  billing_usage_schema: {
    tokens: { type: 'number', unit: 'token' },
    resolution: { enum: ['480p', '720p'] },
  },
}

const PER_VIDEO: PricingModel = {
  id: 3,
  model_name: 'D-sd2.5',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['half'],
  billing_mode: 'tiered_expr',
  billing_expr:
    'u("resolution") == "480p" ? tier("480p", u("videos") * 2) : ' +
    'tier("720p", u("videos") * 3)',
  billing_usage_schema: {
    videos: { type: 'number', unit: 'count' },
    resolution: { enum: ['480p', '720p'] },
  },
}

function mockPricingApi(
  models: PricingModel[],
  categories: { name: string; models: string[] }[]
) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          data: models,
          vendors: [],
          categories: categories.map((category, index) => ({
            id: `cat-${index}`,
            ...category,
          })),
          group_ratio: { half: 0.5 },
          usable_group: {},
          supported_endpoint: {},
          auto_groups: [],
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
}

function renderPricing() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ModelPricing />
    </QueryClientProvider>
  )
}

async function seriesRows(name: string): Promise<(string | null)[][]> {
  const card = (await screen.findByRole('heading', { level: 3, name })).closest(
    'article'
  ) as HTMLElement
  return within(card)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    )
}

beforeEach(() => {
  // The cards sit in an embla carousel, which needs these browser APIs.
  const Observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('ResizeObserver', Observer)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
  )
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  // Unmount the carousel before its browser API stubs go away.
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('home model pricing', () => {
  it('prices a series only from its own category against its official price, listing variant categories by name', async () => {
    mockPricingApi(
      [
        secondModel(
          'E-seedance-2.0',
          { '480p': 0.2, '720p': 0.4, '4k': 1 },
          { minDuration: 4, maxDuration: 15, ratios: ['16:9', '9:16'] }
        ),
        {
          ...secondModel(
            'G-seedance-2.0',
            { '480p': 0.3, '720p': 0.3 },
            { minDuration: 5, maxDuration: 12, ratios: ['16:9', '1:1'] }
          ),
          // Display-only, so the half group ratio never applies to it.
          official_price_expr:
            'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.4) : ' +
            'tier("720p", u("seconds") * 0.5)',
        },
        secondModel('G-seedance-2.0-fast', { '480p': 0.1, '720p': 0.1 }),
        secondModel('E-seedance-2.0-mini', { '480p': 0.05 }),
      ],
      [
        { name: 'Seedance 2.0', models: ['E-seedance-2.0', 'G-seedance-2.0'] },
        { name: 'Seedance 2.0 fast', models: ['G-seedance-2.0-fast'] },
        { name: 'Seedance 2.0 Mini', models: ['E-seedance-2.0-mini'] },
        { name: 'Seedance 2.0 -NSFW', models: [] },
      ]
    )
    renderPricing()

    expect(await seriesRows('Seedance 2.0')).toEqual([
      ['480p', '$0.1', '$0.4', '75% off'],
      ['720p', '$0.15', '$0.5', '70% off'],
      ['4K', '$0.5', '—', '—'],
    ])
    const card = screen
      .getByRole('heading', { level: 3, name: 'Seedance 2.0' })
      .closest('article') as HTMLElement
    expect(
      within(card).getByText('Also in the series: fast · Mini')
    ).toBeVisible()
    expect(within(card).getByText('75% off official prices')).toBeVisible()
    expect(within(card).getByText('480p–4K')).toBeVisible()
    expect(within(card).getByText('4–15 seconds')).toBeVisible()
    expect(within(card).getByText('3 ratios')).toBeVisible()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  })

  it('shows every priced video category as its own card in category order, merging resolutions spelled in either case and hiding official price columns when none is configured', async () => {
    mockPricingApi(
      [
        secondModel('E-MiniMax-H3', { '2K': 0.4, '768P': 0.2 }),
        secondModel('H-MiniMax-H3-Fast', { '768p': 0.3, '1080p': 0.3 }),
        secondModel('G-seedance-2.5', { '480p': 0.2 }),
        secondModel('flux', { '1k': 1 }),
      ],
      [
        { name: 'MiniMax-H3', models: ['E-MiniMax-H3', 'H-MiniMax-H3-Fast'] },
        { name: 'Seedance 2.5', models: ['G-seedance-2.5'] },
        { name: 'Wan 3.0', models: [] },
        { name: 'Seedream', models: ['missing-model'] },
      ]
    )
    renderPricing()

    expect(await seriesRows('MiniMax-H3')).toEqual([
      ['768p', '$0.1'],
      ['1080p', '$0.15'],
      ['2K', '$0.2'],
    ])
    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['MiniMax-H3', 'Seedance 2.5'])
  })

  it('puts every series in one carousel row and gives all cards the official price columns when any series has one', async () => {
    mockPricingApi(
      [
        {
          ...secondModel('E-seedance-2.0', { '480p': 0.2 }),
          official_price_expr: 'tier("480p", u("seconds") * 0.4)',
        },
        secondModel('G-seedance-2.5', { '480p': 0.2 }),
        secondModel('W-wan-3.0', { '720p': 0.2 }),
        secondModel('E-MiniMax-H3', { '768P': 0.2 }),
      ],
      [
        { name: 'Seedance 2.0', models: ['E-seedance-2.0'] },
        { name: 'Seedance 2.5', models: ['G-seedance-2.5'] },
        { name: 'Wan 3.0', models: ['W-wan-3.0'] },
        { name: 'MiniMax-H3', models: ['E-MiniMax-H3'] },
      ]
    )
    renderPricing()

    expect(await seriesRows('MiniMax-H3')).toEqual([['768p', '$0.1', '—', '—']])
    const carousel = screen.getByRole('region', { name: 'Models and pricing' })
    expect(within(carousel).getAllByRole('group')).toHaveLength(4)
    expect(within(carousel).getAllByRole('heading', { level: 3 })).toHaveLength(
      4
    )
  })

  it('keeps the exact price when a token-billed model displays the same price', async () => {
    mockPricingApi(
      [
        secondModel('E-seedance-2.0-mini', { '480p': 0.1, '720p': 0.2 }),
        TOKEN_MINI,
      ],
      [
        {
          name: 'Seedance 2.0 Mini',
          models: ['E-seedance-2.0-mini', 'A-seedance-2.0-mini-P'],
        },
      ]
    )
    renderPricing()

    expect(await seriesRows('Seedance 2.0 Mini')).toEqual([
      ['480p', '$0.05'],
      ['720p', '≈$0.03'],
    ])
  })

  it('shows the cheapest per-video price below the per-second table', async () => {
    mockPricingApi(
      [secondModel('G-seedance-2.5', { '480p': 0.2 }), PER_VIDEO],
      [{ name: 'Seedance 2.5', models: ['G-seedance-2.5', 'D-sd2.5'] }]
    )
    renderPricing()

    expect(await seriesRows('Seedance 2.5')).toEqual([['480p', '$0.1']])
    const card = screen
      .getByRole('heading', { level: 3, name: 'Seedance 2.5' })
      .closest('article') as HTMLElement
    expect(within(card).getByText(/Per video/)).toHaveTextContent(
      'Per video $1 / video · D-sd2.5'
    )
  })

  it('leaves an unavailable model out of the series prices', async () => {
    mockPricingApi(
      [
        secondModel('G-seedance-2.5', { '480p': 0.2 }),
        { ...secondModel('D-sd2.5-G3-1', { '480p': 0.1 }), unavailable: true },
      ],
      [{ name: 'Seedance 2.5', models: ['G-seedance-2.5', 'D-sd2.5-G3-1'] }]
    )
    renderPricing()

    expect(await seriesRows('Seedance 2.5')).toEqual([['480p', '$0.1']])
  })

  it('links to the model square when no series has a priced model', async () => {
    mockPricingApi(
      [secondModel('other', { '480p': 1 })],
      [{ name: 'Seedream', models: ['other'] }]
    )
    renderPricing()

    expect(
      await screen.findByRole('link', {
        name: /See prices in the model square/,
      })
    ).toHaveAttribute('href', '/pricing')
    expect(screen.queryByRole('table')).toBeNull()
  })
})
