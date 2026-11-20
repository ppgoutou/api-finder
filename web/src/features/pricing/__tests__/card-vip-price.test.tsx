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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ModelCard } from '../components/model-card'
import { getCardVipRatios, type VipPriceContext } from '../lib/vip-price'
import type { PricingModel } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

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
  pairs: [
    { baseGroup: 'default', vipGroup: 'vip', baseRatio: 1, vipRatio: 0.9 },
  ],
  viewerVipGroup: 'vip',
  isVip: false,
}

const mainPair = {
  baseGroup: 'default',
  vipGroup: 'vip',
  baseRatio: 1.3,
  vipRatio: 1.2,
}
const overseasPair = {
  baseGroup: 'overseas',
  vipGroup: 'vip-overseas',
  baseRatio: 1.5,
  vipRatio: 1.35,
}

beforeEach(() => {
  usePricingPreferencesStore.setState({
    vipPriceView: null,
    vipSwitchOrigin: null,
  })
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
  it('shows a standard user standard prices and a VIP switch', () => {
    render(
      <ModelCard model={videoModel()} vip={visitorVip} onClick={vi.fn()} />
    )

    expect(screen.getAllByText('$0.04').length).toBeGreaterThan(0)
    expect(screen.queryByText('$0.036')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Price view' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'VIP' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('switches a standard user to VIP prices with three decimals when VIP is pressed', async () => {
    const user = userEvent.setup()
    render(
      <ModelCard model={videoModel()} vip={visitorVip} onClick={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: 'VIP' }))

    expect(screen.getAllByText('$0.036').length).toBeGreaterThan(0)
    expect(screen.getByText('$0.081')).toBeInTheDocument()
    expect(screen.getByText('Save 10%')).toBeInTheDocument()
    // The headline keeps its price size and face in VIP violet.
    expect(screen.getAllByText('$0.036')[0].parentElement).toHaveClass(
      'font-price',
      'text-price',
      'text-vip'
    )
    expect(screen.getByRole('button', { name: 'VIP' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('strikes through the standard price with the VIP price decimals', async () => {
    const user = userEvent.setup()
    render(
      <ModelCard
        model={videoModel()}
        vip={{
          ...visitorVip,
          pairs: [{ ...mainPair, baseRatio: 1.115, vipRatio: 1.025 }],
        }}
        onClick={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'VIP' }))

    // 0.04 × 1.115 struck as $0.045 beside $0.041, never as $0.04, which
    // would look cheaper than the VIP price.
    expect(screen.getByText('$0.045').tagName).toBe('S')
    expect(screen.getAllByText('$0.041').length).toBeGreaterThan(0)
  })

  it('keeps VIP prices when the VIP segment in use is pressed again', async () => {
    const user = userEvent.setup()
    render(
      <ModelCard model={videoModel()} vip={visitorVip} onClick={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: 'VIP' }))
    await user.click(screen.getByRole('button', { name: 'VIP' }))

    expect(screen.getByRole('button', { name: 'VIP' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(usePricingPreferencesStore.getState().vipPriceView).toBe('vip')
  })

  it('offers VIP membership under VIP prices to a standard user', async () => {
    const user = userEvent.setup()
    render(
      <ModelCard model={videoModel()} vip={visitorVip} onClick={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: 'VIP' }))

    expect(
      screen.getByRole('link', { name: 'Join VIP to get this price' })
    ).toHaveAttribute('href', '/vip')
    expect(screen.queryByText('Your price')).not.toBeInTheDocument()
  })

  it('tells a VIP user that the VIP price is theirs', () => {
    render(
      <ModelCard
        model={videoModel()}
        vip={{ ...visitorVip, isVip: true }}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText('Your price')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Join VIP to get this price' })
    ).not.toBeInTheDocument()
  })

  it('shows a VIP user VIP prices first and standard prices after Standard is pressed', async () => {
    const user = userEvent.setup()
    render(
      <ModelCard
        model={videoModel({ group_ratio: { default: 1, vip: 0.9 } })}
        vip={{ ...visitorVip, isVip: true }}
        onClick={vi.fn()}
      />
    )
    expect(screen.getAllByText('$0.036').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Standard' }))

    expect(screen.queryByText('$0.036')).not.toBeInTheDocument()
    expect(screen.getAllByText('$0.04').length).toBeGreaterThan(0)
    expect(screen.queryByText('Save 10%')).not.toBeInTheDocument()
  })

  it('shows a VIP user the standard group price after Standard is pressed', async () => {
    const user = userEvent.setup()
    render(
      <ModelCard
        model={videoModel()}
        vip={{ pairs: [mainPair], viewerVipGroup: 'vip', isVip: true }}
        onClick={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Standard' }))

    // 0.04 × 1.3 and 0.09 × 1.3, not the VIP group's 0.048 and 0.108.
    expect(screen.getAllByText('$0.05').length).toBeGreaterThan(0)
    expect(screen.getByText('$0.12')).toBeInTheDocument()
    expect(screen.queryByText('$0.11')).not.toBeInTheDocument()
  })

  it('switches the pressed card at once and every other card shortly after', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ModelCard model={videoModel()} vip={visitorVip} onClick={vi.fn()} />
        <ModelCard
          model={videoModel({ id: 2, model_name: 'seedance-lite' })}
          vip={visitorVip}
          onClick={vi.fn()}
        />
      </>
    )

    await user.click(screen.getAllByRole('button', { name: 'VIP' })[0])
    const pressed = () =>
      screen
        .getAllByRole('button', { name: 'VIP' })
        .map((button) => button.getAttribute('aria-pressed'))

    expect(usePricingPreferencesStore.getState().vipPriceView).toBe('vip')
    expect(pressed()[0]).toBe('true')
    await waitFor(() => expect(pressed()).toEqual(['true', 'true']))
  })

  it('switches a per-request model to its VIP price', async () => {
    const user = userEvent.setup()
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
    expect(screen.queryByText('$0.045')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'VIP' }))

    expect(screen.getByText('$0.045')).toBeInTheDocument()
  })

  it('leaves the card without a switch when there is no VIP pricing', () => {
    render(<ModelCard model={videoModel()} onClick={vi.fn()} />)

    expect(
      screen.queryByRole('group', { name: 'Price view' })
    ).not.toBeInTheDocument()
  })
})

describe('card VIP ratios', () => {
  const allGroups = ['default', 'overseas', 'vip', 'vip-overseas']
  const pairs = [mainPair, overseasPair]

  it("compares the viewer's own pair when the model offers it", () => {
    const ratios = getCardVipRatios(
      videoModel({ enable_groups: allGroups }),
      undefined,
      { pairs, viewerVipGroup: 'vip-overseas', isVip: false }
    )

    expect(ratios).toMatchObject({
      standardRatio: 1.5,
      vipRatio: 1.35,
      savingPercent: 10,
    })
  })

  it('compares the overseas pair for an overseas-only model', () => {
    const ratios = getCardVipRatios(
      videoModel({ enable_groups: ['overseas', 'vip', 'vip-overseas'] }),
      undefined,
      { pairs, viewerVipGroup: 'vip', isVip: true }
    )

    expect(ratios).toMatchObject({ standardRatio: 1.5, vipRatio: 1.35 })
  })

  it('compares the pair of the group the viewer filtered by', () => {
    const ratios = getCardVipRatios(
      videoModel({ enable_groups: allGroups }),
      'default',
      { pairs, viewerVipGroup: 'vip-overseas', isVip: false }
    )

    expect(ratios).toMatchObject({
      standardRatio: 1.3,
      vipRatio: 1.2,
      savingPercent: 8,
    })
  })

  it.each([
    [
      'the model lacks the VIP group of every pair',
      videoModel({ enable_groups: ['overseas', 'vip'] }),
    ],
    ['the model has no VIP group', videoModel({ enable_groups: ['default'] })],
  ])('returns nothing when %s', (_, model) => {
    expect(
      getCardVipRatios(model, undefined, {
        pairs,
        viewerVipGroup: 'vip',
        isVip: false,
      })
    ).toBeNull()
  })

  it('returns nothing when VIP is not cheaper', () => {
    expect(
      getCardVipRatios(videoModel(), undefined, {
        pairs: [{ ...mainPair, vipRatio: 1.4 }],
        viewerVipGroup: 'vip',
        isVip: false,
      })
    ).toBeNull()
  })
})
