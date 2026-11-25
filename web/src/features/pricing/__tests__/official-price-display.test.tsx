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
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ModelDetailsContent,
  type ModelDetailsContentProps,
} from '../components/model-details'
import type { VipPriceContext } from '../lib/vip-price'
import type { PricingModel } from '../types'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: (props: { to: string; children: ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))

vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const tokenModel: PricingModel = {
  id: 1,
  model_name: 'chat-x',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 4,
  enable_groups: ['default'],
}

function renderDetails(
  model: PricingModel,
  overrides: Partial<ModelDetailsContentProps> = {}
) {
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
        {...overrides}
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

it('shows no throughput, latency or success rate above the pricing', () => {
  renderDetails(tokenModel)

  expect(screen.getByText('Pricing')).toBeVisible()
  expect(screen.queryByText('TPS')).not.toBeInTheDocument()
  expect(screen.queryByText('Average latency')).not.toBeInTheDocument()
  expect(screen.queryByText('Success rate')).not.toBeInTheDocument()
})

describe('image model details', () => {
  const imageModel: PricingModel = {
    id: 2,
    model_name: 'image-2.6',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    billing_mode: 'tiered_expr',
    billing_expr:
      'u("resolution") == "1K" ? tier("1K", u("image_count") * 0.04) : tier("4K", u("image_count") * 0.09)',
    billing_usage_schema: {
      image_count: { type: 'number', unit: 'count' },
      resolution: { enum: ['1K', '4K'] },
    },
    supported_endpoint_types: ['image-generation'],
    enable_groups: ['default', 'vip'],
  }
  const fixedPriceModel: PricingModel = {
    id: 3,
    model_name: 'gpt-image',
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 0,
    model_price: 0.04,
    supported_endpoint_types: ['image-generation'],
    enable_groups: ['default', 'vip'],
  }
  const visitorVip: VipPriceContext = {
    pairs: [
      { baseGroup: 'default', vipGroup: 'vip', baseRatio: 2, vipRatio: 1.8 },
    ],
    viewerVipGroup: 'vip',
    isVip: false,
  }
  const bodyRows = () =>
    within(screen.getByRole('region', { name: 'Price per image' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent)
      )

  it('lists the standard and VIP price of every resolution', () => {
    renderDetails(imageModel, { vip: visitorVip })

    expect(bodyRows()).toEqual([
      ['1K', '$0.08', '$0.072', 'Save 10%'],
      ['4K', '$0.18', '$0.162', 'Save 10%'],
    ])
    expect(
      screen.getByRole('link', { name: 'Join VIP to get this price' })
    ).toHaveAttribute('href', '/vip')
    expect(screen.queryByText('Pricing by Group')).not.toBeInTheDocument()
  })

  it('shows one standard and VIP price for a fixed-price image model', () => {
    renderDetails(fixedPriceModel, { vip: visitorVip })

    expect(bodyRows()).toEqual([['$0.08', '$0.072', 'Save 10%']])
    expect(
      screen.getByRole('columnheader', { name: 'Standard price / request' })
    ).toBeVisible()
  })

  it('shows only the standard price when the model has no VIP price', () => {
    renderDetails(imageModel)

    expect(bodyRows()).toEqual([
      ['1K', '$0.08'],
      ['4K', '$0.18'],
    ])
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('never lists a VIP group as a standard group for a VIP viewer', () => {
    renderDetails(imageModel, {
      vip: { ...visitorVip, isVip: true },
      groupRatio: { vip: 1.8 },
      usableGroup: { vip: { desc: '', ratio: 1.8 } },
    })

    expect(bodyRows()).toEqual([
      ['1K', '$0.08', '$0.072', 'Save 10%'],
      ['4K', '$0.18', '$0.162', 'Save 10%'],
    ])
    expect(screen.getByText('Your price')).toBeInTheDocument()
  })

  it('gives every other group its own price and no VIP price', () => {
    renderDetails(
      { ...imageModel, enable_groups: ['default', 'vip', 'partner'] },
      {
        vip: visitorVip,
        groupRatio: { default: 2, partner: 3 },
        usableGroup: {
          default: { desc: '', ratio: 2 },
          partner: { desc: '', ratio: 3 },
        },
      }
    )

    const region = screen.getByRole('region', { name: 'Price per image' })
    expect(within(region).getByText('partner')).toBeVisible()
    const partner = within(region).getAllByRole('table')[1]
    expect(within(partner).getByText('$0.12')).toBeVisible()
    expect(within(partner).queryByText('VIP price / image')).toBeNull()
  })
})
