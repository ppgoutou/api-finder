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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'
import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { LandingPricing } from '../components/landing-pricing'

function secondModel(
  name: string,
  prices: Record<string, number>
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
    model_limits: { minDuration: 4, maxDuration: 15 },
  }
}

const TOKEN_25: PricingModel = {
  id: 2,
  model_name: 'A-seedance-2.5-P',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['half'],
  billing_mode: 'tiered_expr',
  // 480p is 10044 tokens per second: $0.10 per second before the group ratio.
  billing_expr: 'tier("480p", u("tokens") * 9.95619275189 / 1000000)',
  billing_usage_schema: {
    tokens: { type: 'number', unit: 'token' },
    resolution: { enum: ['480p'] },
  },
}

const PER_VIDEO_25: PricingModel = {
  id: 3,
  model_name: 'D-sd2.5',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['half'],
  billing_mode: 'tiered_expr',
  billing_expr: 'tier("720p", u("videos") * 3)',
  billing_usage_schema: {
    videos: { type: 'number', unit: 'count' },
    resolution: { enum: ['720p'] },
  },
}

function renderPricing(
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LandingPricing />
    </QueryClientProvider>
  )
}

async function tableRows(): Promise<string[][]> {
  const rows = await screen.findAllByRole('row')
  return rows.map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent ?? '')
  )
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('LandingPricing', () => {
  it('shows the cheapest live price of each series per resolution, without its variant categories', async () => {
    renderPricing(
      [
        secondModel('E-seedance-2.0', { '480p': 0.2, '720p': 0.4 }),
        secondModel('G-seedance-2.0-fast', { '480p': 0.1 }),
        TOKEN_25,
      ],
      [
        { name: 'Seedance 2.0', models: ['E-seedance-2.0'] },
        { name: 'Seedance 2.0 fast', models: ['G-seedance-2.0-fast'] },
        { name: 'Seedance 2.5', models: ['A-seedance-2.5-P'] },
      ]
    )

    expect(await tableRows()).toEqual([
      ['Resolution', 'Seedance 2.0', 'Seedance 2.5'],
      ['480p', '$0.1', '≈$0.05'],
      ['720p', '$0.2', '—'],
    ])
  })

  it('lists clip lengths and per-video prices under the table', async () => {
    renderPricing(
      [secondModel('E-seedance-2.5', { '480p': 0.2 }), PER_VIDEO_25],
      [{ name: 'Seedance 2.5', models: ['E-seedance-2.5', 'D-sd2.5'] }]
    )

    expect(
      await screen.findByText(/Seedance 2\.5: 4–15s per clip/)
    ).toHaveTextContent('Seedance 2.5 · $1.5 / video')
  })

  it('shows per-second billing copy instead of a table when no series is priced', async () => {
    renderPricing([], [])

    expect(
      await screen.findByText('Billed by generated seconds')
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
