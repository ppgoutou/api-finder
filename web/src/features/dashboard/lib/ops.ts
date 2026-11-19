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
import { formatPercent } from '@/lib/format'

import type {
  OpsModelPerf,
  OpsModelUsage,
  OpsTrendDay,
  OpsWallet,
} from '../types'

export const OPS_CHANNEL_ALL = 'all'
/** Trend and channel key of quota credited by redemption codes, which have no order. */
export const OPS_TREND_REDEMPTION = 'redemption'
/** The top-up channels the page filters on. */
export const OPS_TOPUP_CHANNELS = ['stripe', 'usdt', OPS_TREND_REDEMPTION]
export const OPS_LOW_SUCCESS_RATE = 95
// Below this many calls a success rate is too noisy to flag.
export const OPS_MIN_RATE_REQUESTS = 20

export type OpsRangeKey =
  | 'all'
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

/** Why a custom range cannot be queried yet, or null when it can. */
export function opsCustomRangeIssue(custom: OpsCustomRange) {
  if (!custom.start || !custom.end) return 'incomplete'
  if (dayjs(custom.end).isBefore(custom.start, 'day')) return 'inverted'
  return null
}

/**
 * The period to query, or null for a custom range that is not usable yet. The
 * all-time range starts at 0, which the request turns into `all_time`.
 */
export function resolveOpsRange(
  key: OpsRangeKey,
  now: Date,
  custom: OpsCustomRange = {}
): { start: number; end: number } | null {
  const current = dayjs(now)
  const today = current.startOf('day')
  const untilNow = (from: dayjs.Dayjs) => ({
    start: from.unix(),
    end: current.unix(),
  })

  switch (key) {
    case 'all':
      return { start: 0, end: current.unix() }
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
      if (opsCustomRangeIssue(custom)) return null
      return {
        start: dayjs(custom.start).startOf('day').unix(),
        end: dayjs(custom.end).endOf('day').unix(),
      }
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

/** A change against the previous period, colored by direction. */
export function opsChangeNote(
  current: number,
  previous: number,
  higherIsBetter = true
): { note?: string; noteTone?: 'good' | 'bad' } {
  const change = percentChange(current, previous)
  if (change == null) return {}
  const good = higherIsBetter ? change >= 0 : change <= 0
  return {
    note: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    noteTone: good ? 'good' : 'bad',
  }
}

/** Percentage of `part` in `total`, or null when `total` is empty. */
export function percentOf(part: number, total: number) {
  if (total <= 0) return null
  return (part / total) * 100
}

/**
 * Compares what entered the wallets with where it went. Top-ups count every
 * channel, redemption codes included. The difference comes from credits
 * without a structured record, such as manual adjustments and sign-up
 * bonuses, and from balances of deleted accounts.
 */
export function reconcileWallet(wallet: OpsWallet) {
  const credit = wallet.other_credit
  const topups = wallet.all_channels_quota + credit.redemption_quota
  const otherCredit = credit.rebate_quota + credit.checkin_quota
  const nonOrderCredit = otherCredit + wallet.test_credit.granted_quota
  const inflow = topups + nonOrderCredit
  const outflow =
    wallet.used_quota + wallet.balance_quota + wallet.negative_quota
  return {
    topups,
    otherCredit,
    nonOrderCredit,
    inflow,
    outflow,
    difference: inflow - outflow,
  }
}

/** What the site kept of a charge after paying the upstream. */
export function opsProfit(revenue: number, cost: number) {
  return { profit: revenue - cost, margin: percentOf(revenue - cost, revenue) }
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

/** Payment brands keep their names; redemption codes are translated. */
export function opsChannelLabel(channel: string, t: (key: string) => string) {
  if (channel === OPS_TREND_REDEMPTION) return t('Redemption codes')
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

// The filterable channels keep one color on every chart.
const FIXED_CHANNEL_COLORS: Record<string, string> = {
  stripe: CHART_COLORS[0],
  usdt: CHART_COLORS[1],
  [OPS_TREND_REDEMPTION]: CHART_COLORS[3],
}

export function channelColor(channel: string, channels: string[]) {
  const fixed = FIXED_CHANNEL_COLORS[channel]
  if (fixed) return fixed
  // Amber is reserved for usage, so a channel never reads as consumption.
  const palette = CHART_COLORS.filter((_, index) => index > 4)
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

export interface OpsTrendLabels {
  usage: string
  redemption: string
  topupTotal: string
  formatValue: (quota: number) => string
}

/** Sum of every top-up channel across the trend. */
export function opsTrendTopupTotal(trend: OpsTrendDay[]) {
  return trend.reduce(
    (sum, day) =>
      sum + Object.values(day.topups).reduce((acc, value) => acc + value, 0),
    0
  )
}

/**
 * One stacked top-up bar and one usage bar per day. Each top-up segment
 * carries its share of the day's top-ups for the tooltip.
 */
export function buildOpsTrendSpec(
  trend: OpsTrendDay[],
  labels: OpsTrendLabels
) {
  const channels = opsTrendChannels(trend)
  const seriesLabel = (channel: string) =>
    opsChannelLabel(channel, () => labels.redemption)
  const values = trend.flatMap((day) => {
    const date = day.date.slice(5).replace('-', '/')
    const dayTotal = channels.reduce(
      (sum, channel) => sum + (day.topups[channel] ?? 0),
      0
    )
    return [
      ...channels.map((channel) => {
        const value = day.topups[channel] ?? 0
        return {
          date,
          kind: 'topup',
          series: seriesLabel(channel),
          value,
          share: percentOf(value, dayTotal),
          dayTotal,
        }
      }),
      {
        date,
        kind: 'usage',
        series: labels.usage,
        value: day.used_quota,
        share: null,
        dayTotal,
      },
    ]
  })
  const tooltipLine = {
    key: (datum?: Record<string, unknown>) => String(datum?.series ?? ''),
    value: (datum?: Record<string, unknown>) => {
      const amount = labels.formatValue(Number(datum?.value ?? 0))
      if (datum?.kind !== 'topup') return amount
      return `${amount} · ${formatPercent(datum.share as number | null)}`
    },
    // Days usually see a few channels; the rest would only list zeros.
    visible: (datum?: Record<string, unknown>) =>
      datum?.kind !== 'topup' || Number(datum?.value ?? 0) > 0,
  }
  const tooltipTitle = {
    value: (datum?: Record<string, unknown>) =>
      `${String(datum?.date ?? '')}  ${labels.topupTotal} ${labels.formatValue(Number(datum?.dayTotal ?? 0))}`,
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
      domain: [...channels.map(seriesLabel), labels.usage],
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
      mark: { title: tooltipTitle, content: [tooltipLine] },
      dimension: { title: tooltipTitle, content: [tooltipLine] },
    },
  }
}

export function buildOpsChannelSpec(
  rows: { channel: string; quota: number }[],
  formatValue: (quota: number) => string,
  t: (key: string) => string
) {
  const channels = rows.map((row) => row.channel)
  return {
    type: 'pie',
    data: [
      {
        id: 'ops-channels',
        values: rows.map((row) => ({
          channel: opsChannelLabel(row.channel, t),
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
