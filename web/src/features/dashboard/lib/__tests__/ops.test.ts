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

import type { OpsModelPerf, OpsTrendDay, OpsWallet } from '../../types'
import {
  buildOpsTrendSpec,
  channelTracksRefunds,
  isLowSuccessRate,
  opsCustomRangeIssue,
  percentChange,
  percentOf,
  reconcileWallet,
  resolveOpsRange,
  topModels,
  walletRunwayDays,
  worstModelsFirst,
} from '../ops'

const wallet: OpsWallet = {
  topup_quota: 800,
  all_channels_quota: 1000,
  used_quota: 700,
  balance_quota: 350,
  negative_users: 1,
  negative_quota: -20,
  other_credit: { redemption_quota: 50, rebate_quota: 20, checkin_quota: 10 },
  recent_used_quota: 70,
  recent_used_seconds: 7 * 86400,
  test_credit: { granted_quota: 40, used_quota: 10, users: 2 },
}

function perf(name: string, requests: number, successes: number): OpsModelPerf {
  return {
    model_name: name,
    requests,
    successes,
    avg_latency_ms: 0,
    avg_ttft_ms: 0,
  }
}

describe('resolveOpsRange', () => {
  const now = new Date(2026, 10, 6, 14, 30, 15)
  const seconds = (
    ...args: [number, number, number, number?, number?, number?]
  ) => new Date(...args).getTime() / 1000

  test('rolling windows start at local midnight and end now', () => {
    expect(resolveOpsRange('7d', now)).toEqual({
      start: seconds(2026, 9, 31),
      end: seconds(2026, 10, 6, 14, 30, 15),
    })
    expect(resolveOpsRange('month', now)?.start).toBe(seconds(2026, 10, 1))
  })

  test('yesterday covers the whole previous local day', () => {
    expect(resolveOpsRange('yesterday', now)).toEqual({
      start: seconds(2026, 10, 5),
      end: seconds(2026, 10, 6) - 1,
    })
  })

  test('custom range without both dates is not queried', () => {
    const custom = { start: new Date(2026, 0, 1) }
    expect(opsCustomRangeIssue(custom)).toBe('incomplete')
    expect(resolveOpsRange('custom', now, custom)).toBeNull()
  })

  test('custom range ending before it starts is not queried', () => {
    const custom = { start: new Date(2026, 0, 2), end: new Date(2026, 0, 1) }
    expect(opsCustomRangeIssue(custom)).toBe('inverted')
    expect(resolveOpsRange('custom', now, custom)).toBeNull()
  })

  test('custom range within one day is usable', () => {
    const custom = {
      start: new Date(2026, 0, 1, 18),
      end: new Date(2026, 0, 1, 9),
    }
    expect(opsCustomRangeIssue(custom)).toBeNull()
  })

  test('custom range spans whole local days', () => {
    const range = resolveOpsRange('custom', now, {
      start: new Date(2026, 0, 1, 9),
      end: new Date(2026, 0, 2, 9),
    })
    expect(range).toEqual({
      start: seconds(2026, 0, 1),
      end: seconds(2026, 0, 3) - 1,
    })
  })
})

describe('period comparison', () => {
  test('a previous period without data has no change to report', () => {
    expect(percentChange(10, 0)).toBeNull()
  })

  test('change is relative to the previous period', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
  })

  test('an empty total has no percentage', () => {
    expect(percentOf(1, 0)).toBeNull()
    expect(percentOf(1, 4)).toBe(25)
  })
})

describe('wallet figures', () => {
  test('reconciliation spans every channel and counts what users owe', () => {
    expect(reconcileWallet(wallet)).toEqual({
      otherCredit: 80,
      nonOrderCredit: 120,
      inflow: 1120,
      outflow: 1030,
      difference: 90,
    })
  })

  test('runway divides balances by the recent daily usage', () => {
    expect(walletRunwayDays(wallet)).toBe(35)
  })

  test('runway is unknown without recent usage', () => {
    expect(walletRunwayDays({ ...wallet, recent_used_quota: 0 })).toBeNull()
  })
})

describe('order channels', () => {
  test('only all channels and Stripe report refunds', () => {
    expect(channelTracksRefunds('all')).toBe(true)
    expect(channelTracksRefunds('stripe')).toBe(true)
    expect(channelTracksRefunds('usdt')).toBe(false)
  })
})

describe('model figures', () => {
  test('a low rate only counts with enough calls', () => {
    expect(isLowSuccessRate(perf('busy', 100, 90))).toBe(true)
    expect(isLowSuccessRate(perf('rare', 5, 0))).toBe(false)
    expect(isLowSuccessRate(perf('fine', 100, 95))).toBe(false)
  })

  test('flagged models sort ahead of a rarely used worse one', () => {
    const rows = worstModelsFirst(
      [perf('fine', 100, 99), perf('rare', 5, 0), perf('busy', 100, 90)],
      3
    )
    expect(rows.map((row) => row.model_name)).toEqual(['busy', 'rare', 'fine'])
  })

  test('usage bars follow the chosen metric and share the whole total', () => {
    const models = [
      { model_name: 'cheap-popular', count: 90, quota: 10 },
      { model_name: 'costly-rare', count: 10, quota: 30 },
    ]
    expect(topModels(models, 'quota', 1)).toEqual([
      { name: 'costly-rare', value: 30, share: 75, width: 100 },
    ])
    expect(topModels(models, 'count', 2).map((bar) => bar.name)).toEqual([
      'cheap-popular',
      'costly-rare',
    ])
  })

  test('no usage leaves empty bars rather than dividing by zero', () => {
    expect(
      topModels([{ model_name: 'idle', count: 0, quota: 0 }], 'quota', 1)
    ).toEqual([{ name: 'idle', value: 0, share: 0, width: 0 }])
  })
})

describe('buildOpsTrendSpec', () => {
  const trend: OpsTrendDay[] = [
    { date: '2026-11-05', topups: { usdt: 5 }, used_quota: 7 },
    { date: '2026-11-06', topups: { stripe: 20 }, used_quota: 3 },
  ]
  const spec = buildOpsTrendSpec(trend, {
    usage: 'Usage',
    formatValue: String,
  })

  test('every day has a value for each channel and for usage', () => {
    expect(spec.data[0].values).toEqual([
      { date: '11/05', kind: 'topup', series: 'Stripe', value: 0 },
      { date: '11/05', kind: 'topup', series: 'USDT', value: 5 },
      { date: '11/05', kind: 'usage', series: 'Usage', value: 7 },
      { date: '11/06', kind: 'topup', series: 'Stripe', value: 20 },
      { date: '11/06', kind: 'topup', series: 'USDT', value: 0 },
      { date: '11/06', kind: 'usage', series: 'Usage', value: 3 },
    ])
  })

  test('colors line up with their series and usage keeps its own', () => {
    expect(spec.color.domain).toEqual(['Stripe', 'USDT', 'Usage'])
    expect(new Set(spec.color.range).size).toBe(3)
  })
})
