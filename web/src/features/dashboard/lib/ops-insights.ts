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
import { CHART_COLORS } from '@/lib/colors'

import type {
  OpsDashboardData,
  OpsModelDuration,
  OpsTopupTier,
  OpsTrendDay,
  OpsUpstream,
} from '../types'
import { percentOf } from './ops'

/** Stripe keeps about this share of each payment; other channels keep none. */
export const OPS_STRIPE_FEE_RATE = 0.05

const SUCCESS_COLOR = CHART_COLORS[1]
const FAILURE_COLOR = 'hsl(0, 72%, 51%)'
const COST_COLOR = 'hsl(220, 9%, 62%)'

type Datum = Record<string, unknown> | undefined

/**
 * What the period earned after paying for it. Revenue is what users were
 * charged on the upstream channels. Channels without a supplier cost are
 * charged at the cost rate of the channels that have one, and the result is
 * null when no channel has a cost to estimate from.
 */
export function opsProfitBreakdown(input: {
  upstream: OpsUpstream[]
  stripeRevenue: number
  testCredit: number
}) {
  const costed = input.upstream.filter((row) => row.cost_status === 'ok')
  const revenue = input.upstream.reduce((sum, row) => sum + row.quota, 0)
  const costedRevenue = costed.reduce((sum, row) => sum + row.quota, 0)
  const upstreamCost = costed.reduce((sum, row) => sum + row.cost_quota, 0)
  const uncostedRevenue = revenue - costedRevenue
  const costRate = costedRevenue > 0 ? upstreamCost / costedRevenue : null
  const estimatedCost =
    costRate == null ? 0 : Math.round(uncostedRevenue * costRate)
  const stripeFee = Math.round(input.stripeRevenue * OPS_STRIPE_FEE_RATE)
  const unknown = costRate == null && uncostedRevenue > 0
  const net = unknown
    ? null
    : revenue - upstreamCost - estimatedCost - stripeFee - input.testCredit
  return {
    revenue,
    costedRevenue,
    uncostedRevenue,
    upstreamCost,
    costRate,
    estimatedCost,
    stripeRevenue: input.stripeRevenue,
    stripeFee,
    testCredit: input.testCredit,
    net,
    margin: net == null ? null : percentOf(net, revenue),
  }
}

export type OpsProfitBreakdown = ReturnType<typeof opsProfitBreakdown>

/**
 * The profit of the dashboard period, the same whatever channel is picked.
 * Test credit is what was used for all time, and what was granted in a period.
 */
export function opsDashboardProfit(data: OpsDashboardData, allTime: boolean) {
  const stripe = data.channels.find((row) => row.channel === 'stripe')
  return opsProfitBreakdown({
    upstream: data.upstream,
    stripeRevenue: stripe?.topup_quota ?? 0,
    testCredit: allTime
      ? data.wallet.test_credit.used_quota
      : data.current.test_credit_quota,
  })
}

/**
 * Days a supplier wallet lasts at the last seven days of usage on its
 * channels, each priced at the channel's cost rate (full rate when the
 * supplier cost is unknown). Null without recent usage.
 */
export function supplierRunwayDays(
  balanceUSD: number,
  channels: OpsUpstream[],
  quotaPerUnit: number
) {
  if (quotaPerUnit <= 0) return null
  const dailyUSD = channels.reduce((sum, row) => {
    const costRate =
      row.cost_status === 'ok' && row.quota > 0 ? row.cost_quota / row.quota : 1
    return sum + (row.recent_quota * costRate) / quotaPerUnit / 7
  }, 0)
  if (dailyUSD <= 0) return null
  return balanceUSD / dailyUSD
}

function shortDate(date: string) {
  return date.slice(5).replace('-', '/')
}

const BOTTOM_LEGEND = { visible: true, orient: 'bottom' }

export function buildOpsUserTrendSpec(
  trend: OpsTrendDay[],
  labels: { newUsers: string; activeUsers: string; newPayers: string }
) {
  const series = [
    { key: 'new_users', label: labels.newUsers, color: CHART_COLORS[3] },
    { key: 'active_users', label: labels.activeUsers, color: CHART_COLORS[8] },
    { key: 'new_payers', label: labels.newPayers, color: CHART_COLORS[6] },
  ] as const
  return {
    type: 'line',
    data: [
      {
        id: 'ops-users',
        values: trend.flatMap((day) =>
          series.map((item) => ({
            date: shortDate(day.date),
            series: item.label,
            value: day[item.key],
          }))
        ),
      },
    ],
    xField: 'date',
    yField: 'value',
    seriesField: 'series',
    point: { visible: false },
    line: { style: { lineWidth: 2, curveType: 'monotone' } },
    color: {
      type: 'ordinal',
      domain: series.map((item) => item.label),
      range: series.map((item) => item.color),
    },
    legends: BOTTOM_LEGEND,
    axes: [
      { orient: 'left', label: { formatMethod: (v: unknown) => String(v) } },
      { orient: 'bottom' },
    ],
  }
}

export function buildOpsTaskTrendSpec(
  trend: OpsTrendDay[],
  labels: { success: string; failure: string }
) {
  return {
    type: 'bar',
    data: [
      {
        id: 'ops-tasks',
        values: trend.flatMap((day) => [
          {
            date: shortDate(day.date),
            series: labels.success,
            value: day.task_success,
          },
          {
            date: shortDate(day.date),
            series: labels.failure,
            value: day.task_failure,
          },
        ]),
      },
    ],
    xField: 'date',
    yField: 'value',
    seriesField: 'series',
    stack: true,
    color: {
      type: 'ordinal',
      domain: [labels.success, labels.failure],
      range: [SUCCESS_COLOR, FAILURE_COLOR],
    },
    legends: BOTTOM_LEGEND,
  }
}

/** Running totals of top-ups (every channel) and usage across the trend. */
export function opsCumulativeTrend(trend: OpsTrendDay[]) {
  let topups = 0
  let usage = 0
  return trend.map((day) => {
    topups += Object.values(day.topups).reduce((sum, value) => sum + value, 0)
    usage += day.used_quota
    return { date: day.date, topups, usage }
  })
}

export function buildOpsCumulativeSpec(
  trend: OpsTrendDay[],
  labels: {
    topups: string
    usage: string
    formatValue: (quota: number) => string
  }
) {
  const values = opsCumulativeTrend(trend).flatMap((day) => [
    { date: shortDate(day.date), series: labels.topups, value: day.topups },
    { date: shortDate(day.date), series: labels.usage, value: day.usage },
  ])
  const line = {
    key: (datum?: Datum) => String(datum?.series ?? ''),
    value: (datum?: Datum) => labels.formatValue(Number(datum?.value ?? 0)),
  }
  return {
    type: 'line',
    data: [{ id: 'ops-cumulative', values }],
    xField: 'date',
    yField: 'value',
    seriesField: 'series',
    point: { visible: false },
    line: { style: { lineWidth: 2 } },
    color: {
      type: 'ordinal',
      domain: [labels.topups, labels.usage],
      range: [CHART_COLORS[0], CHART_COLORS[2]],
    },
    legends: BOTTOM_LEGEND,
    axes: [
      {
        orient: 'left',
        label: {
          formatMethod: (value: unknown) => labels.formatValue(Number(value)),
        },
      },
      { orient: 'bottom' },
    ],
    tooltip: { mark: { content: [line] }, dimension: { content: [line] } },
  }
}

/** "≤ $5", "$5–10" … "> $100" for the top-up amount tiers. */
export function opsTierLabel(tiers: OpsTopupTier[], index: number) {
  const tier = tiers[index]
  const previous = index > 0 ? tiers[index - 1].max_usd : 0
  if (tier.max_usd === 0) return `> $${previous}`
  if (index === 0) return `≤ $${tier.max_usd}`
  return `$${previous}–${tier.max_usd}`
}

export function buildOpsTierSpec(
  tiers: OpsTopupTier[],
  labels: { first: string; repeat: string }
) {
  const values = tiers.flatMap((tier, index) => [
    {
      tier: opsTierLabel(tiers, index),
      series: labels.first,
      value: tier.first_orders,
    },
    {
      tier: opsTierLabel(tiers, index),
      series: labels.repeat,
      value: tier.repeat_orders,
    },
  ])
  return {
    type: 'bar',
    data: [{ id: 'ops-tiers', values }],
    xField: 'tier',
    yField: 'value',
    seriesField: 'series',
    stack: true,
    color: {
      type: 'ordinal',
      domain: [labels.first, labels.repeat],
      range: [CHART_COLORS[0], CHART_COLORS[8]],
    },
    legends: BOTTOM_LEGEND,
  }
}

/** Revenue, cost and profit of the channels whose supplier cost is known. */
export function buildOpsChannelProfitSpec(
  upstream: OpsUpstream[],
  labels: {
    revenue: string
    cost: string
    profit: string
    formatValue: (quota: number) => string
  }
) {
  const values = upstream
    .filter((row) => row.cost_status === 'ok' && row.quota > 0)
    .flatMap((row) => [
      { channel: row.name, kind: labels.revenue, value: row.quota },
      { channel: row.name, kind: labels.cost, value: row.cost_quota },
      {
        channel: row.name,
        kind: labels.profit,
        value: row.quota - row.cost_quota,
      },
    ])
  const line = {
    key: (datum?: Datum) => String(datum?.kind ?? ''),
    value: (datum?: Datum) => labels.formatValue(Number(datum?.value ?? 0)),
  }
  return {
    type: 'bar',
    data: [{ id: 'ops-channel-profit', values }],
    xField: ['channel', 'kind'],
    yField: 'value',
    seriesField: 'kind',
    color: {
      type: 'ordinal',
      domain: [labels.revenue, labels.cost, labels.profit],
      range: [CHART_COLORS[0], COST_COLOR, SUCCESS_COLOR],
    },
    legends: BOTTOM_LEGEND,
    axes: [
      {
        orient: 'left',
        label: {
          formatMethod: (value: unknown) => labels.formatValue(Number(value)),
        },
      },
      { orient: 'bottom', showAllLevel: false },
    ],
    tooltip: { mark: { content: [line] }, dimension: { content: [line] } },
  }
}

/** Minutes with one decimal below ten minutes, whole minutes above. */
export function formatTaskMinutes(seconds: number) {
  const minutes = seconds / 60
  return minutes < 10 ? minutes.toFixed(1) : String(Math.round(minutes))
}

/** The slowest models first, so the ones to look at lead the list. */
export function slowestModelsFirst(models: OpsModelDuration[]) {
  return [...models].sort(
    (a, b) => b.p90_seconds - a.p90_seconds || b.tasks - a.tasks
  )
}
