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
import i18next from 'i18next'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { ModelDetailsContent } from '../components/model-details'
import {
  comparisonOrderCost,
  getPriceComparison,
  rowPriceRatio,
} from '../lib/price-comparison'
import type { PricingModel } from '../types'

vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

/** A Seedance-style line: USD per million video tokens by resolution and reference video. */
const tokenVideoModel: PricingModel = {
  id: 1,
  model_name: 'seedance-line',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
  billing_mode: 'tiered_expr',
  billing_expr:
    'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("tokens") * 5 / 1000000) : ' +
    'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("tokens") * 3 / 1000000) : ' +
    'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("tokens") * 5 / 1000000) : ' +
    'tier("720p·video", u("tokens") * 3 / 1000000)',
  billing_usage_schema: {
    resolution: { enum: ['480p', '720p'] },
    tokens: { type: 'number', unit: 'token' },
    video_input: { enum: ['none', 'video'] },
  },
  official_price: {
    kind: 'video',
    rows: [
      { option: '480p', second: 0.07, reference_second: 0.04 },
      { option: '720p', second: 0.15, reference_second: 0.09 },
    ],
  },
}

function renderDetails(model: PricingModel) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ModelDetailsContent
        model={model}
        groupRatio={{ default: 1 }}
        usableGroup={{ default: { desc: '', ratio: 1 } }}
        endpointMap={{}}
        autoGroups={[]}
        priceRate={1}
        usdExchangeRate={1}
        tokenUnit='M'
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
})

describe('getPriceComparison', () => {
  it('pairs each resolution and reference video state with its official price', () => {
    const comparison = getPriceComparison(tokenVideoModel)

    expect(comparison?.rows.map((row) => row.key)).toEqual([
      '480p|0',
      '480p|1',
      '720p|0',
      '720p|1',
    ])
    const plain480 = comparison?.rows[0]
    expect(plain480?.ours?.perMillion).toBe(5)
    expect(plain480?.ours?.second).toBeCloseTo((5 * 10044) / 1e6)
    expect(plain480?.official?.second).toBe(0.07)
    expect(plain480?.official?.perMillion).toBeCloseTo((0.07 / 10044) * 1e6)
  })

  it('converts both prices at the tokens per second the plugin reports', () => {
    const comparison = getPriceComparison({
      ...tokenVideoModel,
      billing_usage_examples: [
        {
          label: '480p · 5s',
          facts: { resolution: '480p', tokens: 48038, video_input: 'none' },
        },
      ],
    })
    const row = comparison?.rows[0]

    expect(row?.tokensPerSecond).toBeCloseTo(9607.6)
    expect(row?.official?.perMillion).toBeCloseTo((0.07 / 9607.6) * 1e6)
    // Both sides convert at the same rate, so both tables show one discount.
    const secondRatio = (row?.ours?.second ?? 0) / (row?.official?.second ?? 1)
    const tokenRatio =
      (row?.ours?.perMillion ?? 0) / (row?.official?.perMillion ?? 1)
    expect(secondRatio).toBeCloseTo(tokenRatio)
  })

  it('returns null for a video model without an official price', () => {
    expect(
      getPriceComparison({ ...tokenVideoModel, official_price: undefined })
    ).toBeNull()
  })

  it('bills the reference seconds of a token-billed order with a reference video', () => {
    const row = getPriceComparison(tokenVideoModel)?.rows[1]

    expect(
      comparisonOrderCost(row?.ours, row?.tokensPerSecond, 5, 5)
    ).toBeCloseTo((10 * 10044 * 3) / 1e6)
  })
})

describe('rowPriceRatio', () => {
  it('compares a whole order when only the official side bills the reference seconds', () => {
    // Ours: $0.13 per output second. Official: $3 per million tokens over
    // output plus reference seconds at 10000 tokens per second.
    const ratio = rowPriceRatio(
      {
        key: '480p|1',
        option: '480p',
        withVideo: true,
        tokensPerSecond: 10000,
        ours: { second: 0.13, perMillion: 13, billsReferenceTokens: false },
        official: { second: 0.03, perMillion: 3, billsReferenceTokens: true },
      },
      'second',
      1
    )

    // 5 s × $0.13 = $0.65 against 10 s × 10000 × $3 / 1M = $0.30.
    expect(ratio).toBeCloseTo(0.65 / 0.3)
  })
})

describe('price comparison overview', () => {
  // The condition labels are worded per language, so this suite reads the
  // shipped English strings.
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })
  afterAll(() => {
    i18next.removeResourceBundle('en', 'translation')
    i18next.addResourceBundle('en', 'translation', {})
  })

  it('shows per-second, per-token and example tables with the discount', () => {
    renderDetails(tokenVideoModel)

    const section = screen.getByRole('region', { name: 'Price comparison' })
    const perSecond = within(section).getByRole('region', {
      name: 'Per-second prices',
    })
    // 480p: 5 $/M × 10044 tokens/s ≈ $0.0502 against $0.07 is 28% off;
    // with a video, 3 $/M ≈ $0.0301 against $0.04 is 25% off.
    expect(within(perSecond).getAllByText('28% off')).toHaveLength(3)
    expect(within(perSecond).getByText('25% off')).toBeVisible()
    expect(
      within(section).getByRole('region', { name: 'Per-token prices' })
    ).toBeVisible()
    expect(within(section).queryByRole('region', { name: 'Price examples' })).toBeNull()
  })

  it('names both video conditions in the English header and keeps each row on one label', () => {
    renderDetails(tokenVideoModel)

    const perSecond = screen.getByRole('region', { name: 'Per-second prices' })
    const header = within(perSecond).getAllByRole('columnheader')[0]
    expect(header).toHaveTextContent('Resolution (without / with video)')
    const rows = within(perSecond).getAllByRole('row').slice(1)
    expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent('480p(without)')
    expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent('480p(with)')
  })

  it('shows every with-video label in red', () => {
    renderDetails(tokenVideoModel)

    const perSecond = screen.getByRole('region', { name: 'Per-second prices' })
    expect(within(perSecond).getAllByText('(with)')[0]).toHaveClass('text-destructive')
    expect(within(perSecond).getAllByText('(without)')[0]).not.toHaveClass('text-destructive')
    expect(within(perSecond).getByText('with video)')).toHaveClass('text-destructive')
  })

  it('restores the plugin price examples and marks the reference-video ones', () => {
    renderDetails({
      ...tokenVideoModel,
      billing_usage_examples: [
        {
          label: '720p · 5s',
          facts: { resolution: '720p', tokens: 108000, video_input: 'none' },
        },
        {
          label: '720p · 5s (+4s video)',
          facts: { resolution: '720p', tokens: 194400, video_input: 'video' },
        },
      ],
    })

    const examples = screen.getByRole('region', { name: 'Price examples' })
    // 108000 tokens × $5 / 1M = $0.54.
    expect(within(examples).getByText(/≈ \$0\.54/)).toBeVisible()
    expect(within(examples).getByText('720p · 5s')).not.toHaveClass('text-destructive')
    expect(within(examples).getByText('720p · 5s (+4s video)')).toHaveClass('text-destructive')
  })

  it('no longer shows the model type, group and endpoint block', () => {
    renderDetails(tokenVideoModel)

    expect(screen.queryByText('Endpoints')).toBeNull()
  })
})
