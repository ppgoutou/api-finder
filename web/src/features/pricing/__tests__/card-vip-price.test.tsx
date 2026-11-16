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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ModelCard } from '../components/model-card'
import { getCardVipRatios, type VipPriceContext } from '../lib/vip-price'
import type { PricingModel } from '../types'

function videoModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 1,
    model_name: 'seedance-2.0',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    billing_mode: 'tiered_expr',
    billing_expr:
      'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.04) : tier("720p", u("seconds") * 0.09)',
    billing_usage_schema: {
      resolution: { enum: ['480p', '720p'] },
      seconds: { type: 'number', unit: 'second' },
    },
    enable_groups: ['default', 'vip'],
    group_ratio: { default: 1 },
    ...overrides,
  }
}

const visitorVip: VipPriceContext = {
  group: 'vip',
  displayRatio: 0.9,
  isVip: false,
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})
afterEach(() => {
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('card VIP price', () => {
  it('shows a standard user the VIP price with three decimals under the current price', () => {
    render(
      <ModelCard model={videoModel()} vip={visitorVip} onClick={vi.fn()} />
    )

    expect(screen.getAllByText('$0.04').length).toBeGreaterThan(0)
    expect(screen.getByText('$0.036')).toBeInTheDocument()
    expect(screen.getByText('Save 10%')).toBeInTheDocument()
  })

  it('shows a VIP user the VIP price as the headline and strikes the standard price', () => {
    render(
      <ModelCard
        model={videoModel({ group_ratio: { default: 1, vip: 0.9 } })}
        vip={{ ...visitorVip, isVip: true }}
        onClick={vi.fn()}
      />
    )

    expect(screen.getAllByText('$0.036').length).toBeGreaterThan(0)
    expect(screen.getByText('$0.081')).toBeInTheDocument()
    expect(screen.getByText('$0.04').tagName).toBe('S')
    expect(screen.getByText('You save 10%')).toBeInTheDocument()
  })

  it('adds the VIP price to a per-request model', () => {
    render(
      <ModelCard
        model={videoModel({
          quota_type: 1,
          model_price: 0.05,
          billing_mode: undefined,
          billing_expr: undefined,
          billing_usage_schema: undefined,
        })}
        vip={visitorVip}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText('$0.045')).toBeInTheDocument()
  })

  it('leaves the card unchanged without VIP pricing', () => {
    render(<ModelCard model={videoModel()} onClick={vi.fn()} />)

    expect(screen.queryByText('VIP price')).not.toBeInTheDocument()
  })
})

describe('card VIP ratios', () => {
  it('compares against the cheapest non-VIP group the model offers', () => {
    const ratios = getCardVipRatios(
      videoModel({
        enable_groups: ['default', 'overseas', 'vip'],
        group_ratio: { default: 1.28, overseas: 1.25, vip: 1.2 },
      }),
      undefined,
      { group: 'vip', displayRatio: 1.2, isVip: true }
    )

    expect(ratios).toMatchObject({ standardRatio: 1.25, savingPercent: 4 })
  })

  it('compares against the group the viewer filtered by', () => {
    const ratios = getCardVipRatios(
      videoModel({
        enable_groups: ['default', 'overseas', 'vip'],
        group_ratio: { default: 1.28, overseas: 1.25 },
      }),
      'default',
      { ...visitorVip, displayRatio: 1.2 }
    )

    expect(ratios).toMatchObject({ standardRatio: 1.28, savingPercent: 6 })
  })

  it.each([
    ['the model has no VIP group', videoModel({ enable_groups: ['default'] })],
    ['VIP is not cheaper', videoModel({ group_ratio: { default: 0.8 } })],
  ])('returns nothing when %s', (_, model) => {
    expect(getCardVipRatios(model, undefined, visitorVip)).toBeNull()
  })
})
