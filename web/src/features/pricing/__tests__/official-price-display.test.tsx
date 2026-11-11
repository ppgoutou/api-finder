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
import { afterEach, expect, it, vi } from 'vitest'

import { ModelDetailsContent } from '../components/model-details'
import type { PricingModel } from '../types'

vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const tokenModel: PricingModel = {
  id: 1,
  model_name: 'chat-x',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 4,
  enable_groups: ['default'],
}

function renderDetails(model: PricingModel) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ModelDetailsContent
        model={model}
        groupRatio={{ default: 2 }}
        usableGroup={{ default: { desc: '', ratio: 2 } }}
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

it('shows the official per-token price without the group ratio', () => {
  renderDetails({
    ...tokenModel,
    official_price_expr: 'tier("base", p * 2 + c * 8)',
  })

  const section = screen.getByRole('region', { name: 'Official Price' })
  expect(within(section).getByText('Input')).toBeVisible()
  expect(within(section).getByText(/\$2(\.0+)?\b/)).toBeVisible()
  expect(within(section).getByText(/\$8(\.0+)?\b/)).toBeVisible()
})

it('shows no official price section for a token model without one', () => {
  renderDetails(tokenModel)

  expect(screen.queryByRole('region', { name: 'Official Price' })).toBeNull()
})

it('shows the inherited per-second table on a line billed by video tokens', () => {
  renderDetails({
    ...tokenModel,
    model_name: 'e-line',
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("base", u("tokens") * 40 / 1000000)',
    billing_usage_schema: {
      tokens: { type: 'number', unit: 'token' },
      resolution: { enum: ['720p', '4k'] },
      video_input: { enum: ['none', 'video'] },
    },
    official_price: {
      kind: 'video',
      rows: [
        { option: '480p', second: 0.5 },
        { option: '720p', second: 1 },
      ],
    },
  })

  expect(screen.getByText('Official Price')).toBeVisible()
  expect(screen.getByText('720p')).toBeVisible()
  expect(screen.queryByText('480p')).toBeNull()
})
