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
import { describe, expect, test } from 'vitest'

import type { OpsTopupTier, OpsTrendDay, OpsUpstream } from '../../types'
import {
  formatTaskMinutes,
  opsCumulativeTrend,
  opsProfitBreakdown,
  opsTierLabel,
  upstreamRunwayDays,
} from '../ops-insights'

function upstream(overrides: Partial<OpsUpstream>): OpsUpstream {
  return {
    channel_id: 1,
    name: 'channel',
    quota: 0,
    cost_quota: 0,
    cost_status: 'ok',
    count: 0,
    balance: 0,
    balance_updated_time: 0,
    task_success: 0,
    task_failure: 0,
    recent_quota: 0,
    task_cost_quota: 0,
    task_cost_charged: 0,
    task_cost_estimated: 0,
    supply_cost_quota: 0,
    supply_covered_quota: 0,
    supply_estimated_quota: 0,
    ...overrides,
  }
}

describe('opsProfitBreakdown', () => {
  test('charges channels without a cost at the rate of those with one and takes 5% of Stripe', () => {
    const profit = opsProfitBreakdown({
      upstream: [
        upstream({ quota: 1000, cost_quota: 800 }),
        upstream({ channel_id: 2, quota: 500, cost_status: 'no_token' }),
      ],
      stripeRevenue: 2000,
      testCredit: 30,
    })

    expect(profit).toMatchObject({
      revenue: 1500,
      upstreamCost: 800,
      uncostedRevenue: 500,
      costRate: 0.8,
      estimatedCost: 400,
      stripeFee: 100,
      net: 1500 - 800 - 400 - 100 - 30,
    })
    expect(profit.margin).toBeCloseTo((170 / 1500) * 100)
  })

  test('has no net profit when no channel has a cost to estimate from', () => {
    const profit = opsProfitBreakdown({
      upstream: [upstream({ quota: 500, cost_status: 'error' })],
      stripeRevenue: 0,
      testCredit: 0,
    })

    expect(profit.costRate).toBeNull()
    expect(profit.net).toBeNull()
    expect(profit.margin).toBeNull()
  })

  test('is zero rather than unknown for a period without revenue', () => {
    const profit = opsProfitBreakdown({
      upstream: [],
      stripeRevenue: 0,
      testCredit: 0,
    })

    expect(profit.net).toBe(0)
  })
})

describe('upstreamRunwayDays', () => {
  test('divides the balance by seven days of usage at the channel cost rate', () => {
    // $14 charged in 7 days at an 50% cost rate is $1 a day.
    const row = upstream({
      quota: 200,
      cost_quota: 100,
      recent_quota: 14 * 500000,
      balance: 30,
      balance_updated_time: 1,
    })

    expect(upstreamRunwayDays(row, 500000)).toBeCloseTo(30)
  })

  test('prices usage at full rate when the supplier cost is unknown', () => {
    const row = upstream({
      cost_status: 'no_token',
      recent_quota: 7 * 500000,
      balance: 10,
      balance_updated_time: 1,
    })

    expect(upstreamRunwayDays(row, 500000)).toBeCloseTo(10)
  })

  test('is unknown without a read balance or recent usage', () => {
    expect(
      upstreamRunwayDays(upstream({ recent_quota: 100, balance: 5 }), 500000)
    ).toBeNull()
    expect(
      upstreamRunwayDays(
        upstream({ balance: 5, balance_updated_time: 1 }),
        500000
      )
    ).toBeNull()
  })
})

describe('opsTierLabel', () => {
  const tier = (max: number): OpsTopupTier => ({
    max_usd: max,
    first_orders: 0,
    repeat_orders: 0,
    first_quota: 0,
    repeat_quota: 0,
  })
  const tiers = [tier(5), tier(10), tier(0)]

  test('names the first, middle and open-ended tiers', () => {
    expect(tiers.map((_, index) => opsTierLabel(tiers, index))).toEqual([
      '≤ $5',
      '$5–10',
      '> $10',
    ])
  })
})

describe('opsCumulativeTrend', () => {
  test('adds up every top-up channel and usage day by day', () => {
    const day = (topups: Record<string, number>, used: number): OpsTrendDay => ({
      date: '2026-11-05',
      topups,
      used_quota: used,
      new_users: 0,
      active_users: 0,
      new_payers: 0,
      task_success: 0,
      task_failure: 0,
    })

    expect(
      opsCumulativeTrend([
        day({ stripe: 10, redemption: 5 }, 4),
        day({}, 6),
        day({ usdt: 20 }, 0),
      ]).map((row) => [row.topups, row.usage])
    ).toEqual([
      [15, 4],
      [15, 10],
      [35, 10],
    ])
  })
})

describe('formatTaskMinutes', () => {
  test('keeps one decimal under ten minutes and rounds above', () => {
    expect(formatTaskMinutes(90)).toBe('1.5')
    expect(formatTaskMinutes(754)).toBe('13')
  })
})
