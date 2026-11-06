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
import dayjs from 'dayjs'

import { CHART_COLORS } from '@/lib/colors'
import { formatQuotaWithCurrency } from '@/lib/currency'

import type {
  OpsModelPerf,
  OpsModelUsage,
  OpsTrendDay,
  OpsWallet,
} from '../types'

export const OPS_CHANNEL_ALL = 'all'
export const OPS_LOW_SUCCESS_RATE = 95
// Below this many calls a success rate is too noisy to flag.
export const OPS_MIN_RATE_REQUESTS = 20

export type OpsRangeKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'month'
  | 'custom'
export type OpsModelMetric = 'quota' | 'count'

export interface OpsCustomRange {
  start?: Date
  end?: Date
}

export function resolveOpsRange(
  key: OpsRangeKey,
  now: Date,
  custom: OpsCustomRange = {}
): { start: number; end: number } {
  const current = dayjs(now)
  const today = current.startOf('day')
  const untilNow = (from: dayjs.Dayjs) => ({
    start: from.unix(),
    end: current.unix(),
  })

  switch (key) {
    case 'today':
      return untilNow(today)
    case 'yesterday':
      return {
        start: today.subtract(1, 'day').unix(),
        end: today.unix() - 1,
      }
    case '30d':
      return untilNow(today.subtract(29, 'day'))
    case 'month':
      return untilNow(current.startOf('month'))
    case 'custom':
      if (custom.start && custom.end) {
        return {
          start: dayjs(custom.start).startOf('day').unix(),
          end: dayjs(custom.end).endOf('day').unix(),
        }
      }
      return untilNow(today.subtract(6, 'day'))
    case '7d':
    default:
      return untilNow(today.subtract(6, 'day'))
  }
}

export function formatOpsMoney(quota: number) {
  return formatQuotaWithCurrency(quota, {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })
}

/** Change against the previous period, or null when there is nothing to compare. */
export function percentChange(current: number, previous: number) {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/** Percentage of `part` in `total`, or null when `total` is empty. */
export function percentOf(part: number, total: number) {
  if (total <= 0) return null
  return (part / total) * 100
}

/**
 * Compares what entered the wallets with where it went. The difference comes
 * from credits without a structured record, such as manual adjustments and
 * sign-up bonuses, and from balances of deleted accounts.
 */
export function reconcileWallet(wallet: OpsWallet) {
  const credit = wallet.other_credit
  const otherCredit =
    credit.redemption_quota + credit.rebate_quota + credit.checkin_quota
  const inflow = wallet.all_channels_quota + otherCredit
  const outflow =
    wallet.used_quota + wallet.balance_quota + wallet.negative_quota
  return { otherCredit, inflow, outflow, difference: inflow - outflow }
}

/** Days the current balances last at the recent daily usage. */
export function walletRunwayDays(wallet: OpsWallet) {
  const days = wallet.recent_used_seconds / 86400
  if (wallet.recent_used_quota <= 0 || days <= 0) return null
  return wallet.balance_quota / (wallet.recent_used_quota / days)
}

const CHANNEL_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  usdt: 'USDT',
  epay: 'EPay',
  creem: 'Creem',
  waffo: 'Waffo',
  waffo_pancake: 'Waffo Pancake',
}

export function opsChannelLabel(channel: string) {
  return CHANNEL_LABELS[channel] ?? channel
}

/** Only Stripe reports refunds and disputes back to the order. */
export function channelTracksRefunds(channel: string) {
  return channel === OPS_CHANNEL_ALL || channel === 'stripe'
}

export function isLowSuccessRate(model: OpsModelPerf) {
  return (
    model.requests >= OPS_MIN_RATE_REQUESTS &&
    (model.successes / model.requests) * 100 < OPS_LOW_SUCCESS_RATE
  )
}

export function worstModelsFirst(models: OpsModelPerf[], limit: number) {
  return [...models]
    .sort(
      (a, b) =>
        Number(isLowSuccessRate(b)) - Number(isLowSuccessRate(a)) ||
        a.successes / a.requests - b.successes / b.requests ||
        b.requests - a.requests
    )
    .slice(0, limit)
}

export function topModels(
  models: OpsModelUsage[],
  metric: OpsModelMetric,
  limit: number
) {
  const total = models.reduce((sum, model) => sum + model[metric], 0)
  const sorted = [...models]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, limit)
  const largest = sorted[0]?.[metric] ?? 0
  return sorted.map((model) => ({
    name: model.model_name,
    value: model[metric],
    share: total > 0 ? (model[metric] / total) * 100 : 0,
    width: largest > 0 ? (model[metric] / largest) * 100 : 0,
  }))
}

function channelColor(channel: string, channels: string[]) {
  // Amber is reserved for usage, so a channel never reads as consumption.
  const palette = CHART_COLORS.filter((_, index) => index !== 2)
  return palette[channels.indexOf(channel) % palette.length]
}

export function opsTrendChannels(trend: OpsTrendDay[]) {
  const totals = new Map<string, number>()
  for (const day of trend) {
    for (const [channel, value] of Object.entries(day.topups)) {
      totals.set(channel, (totals.get(channel) ?? 0) + value)
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key)
}

export function buildOpsTrendSpec(
  trend: OpsTrendDay[],
  labels: { usage: string; formatValue: (quota: number) => string }
) {
  const channels = opsTrendChannels(trend)
  const values = trend.flatMap((day) => {
    const date = day.date.slice(5).replace('-', '/')
    return [
      ...channels.map((channel) => ({
        date,
        kind: 'topup',
        series: opsChannelLabel(channel),
        value: day.topups[channel] ?? 0,
      })),
      { date, kind: 'usage', series: labels.usage, value: day.used_quota },
    ]
  })
  const tooltipLine = {
    key: (datum?: Record<string, unknown>) => String(datum?.series ?? ''),
    value: (datum?: Record<string, unknown>) =>
      labels.formatValue(Number(datum?.value ?? 0)),
  }

  return {
    type: 'bar',
    data: [{ id: 'ops-trend', values }],
    xField: ['date', 'kind'],
    yField: 'value',
    seriesField: 'series',
    stack: true,
    color: {
      type: 'ordinal',
      domain: [...channels.map(opsChannelLabel), labels.usage],
      range: [
        ...channels.map((channel) => channelColor(channel, channels)),
        CHART_COLORS[2],
      ],
    },
    legends: { visible: true, orient: 'bottom' },
    axes: [
      {
        orient: 'left',
        label: {
          formatMethod: (value: unknown) => labels.formatValue(Number(value)),
        },
      },
      { orient: 'bottom', showAllLevel: false },
    ],
    tooltip: {
      mark: { content: [tooltipLine] },
      dimension: { content: [tooltipLine] },
    },
  }
}

export function buildOpsChannelSpec(
  rows: { channel: string; quota: number }[],
  formatValue: (quota: number) => string
) {
  const channels = rows.map((row) => row.channel)
  return {
    type: 'pie',
    data: [
      {
        id: 'ops-channels',
        values: rows.map((row) => ({
          channel: opsChannelLabel(row.channel),
          value: row.quota,
        })),
      },
    ],
    valueField: 'value',
    categoryField: 'channel',
    outerRadius: 0.9,
    innerRadius: 0.62,
    color: channels.map((channel) => channelColor(channel, channels)),
    legends: { visible: false },
    label: { visible: false },
    tooltip: {
      mark: {
        content: [
          {
            key: (datum?: Record<string, unknown>) =>
              String(datum?.channel ?? ''),
            value: (datum?: Record<string, unknown>) =>
              formatValue(Number(datum?.value ?? 0)),
          },
        ],
      },
    },
  }
}
