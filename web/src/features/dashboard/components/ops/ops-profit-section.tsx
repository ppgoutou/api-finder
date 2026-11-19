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
import { ChartPie } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getCurrencyDisplay } from '@/lib/currency'
import { formatCurrencyUSD, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  buildOpsChannelProfitSpec,
  OPS_STRIPE_FEE_RATE,
  opsDashboardProfit,
  upstreamRunwayDays,
  type OpsProfitBreakdown,
} from '../../lib/ops-insights'
import { formatOpsMoney } from '../../lib/ops'
import type { OpsUpstream } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'
import { OpsChart } from './ops-chart'
import {
  OpsSection,
  OpsStatGrid,
  type OpsSectionProps,
  type OpsStat,
} from './ops-stat-grid'
import { OpsUpstreamPanel } from './ops-upstream-panels'

const STRIPE_FEE_PERCENT = `${OPS_STRIPE_FEE_RATE * 100}%`
// A balance that runs out within this many days is flagged.
const RUNWAY_WARNING_DAYS = 7

export function OpsProfitSection(props: OpsSectionProps) {
  const { t } = useTranslation()
  const data = props.data
  const profit = data ? opsDashboardProfit(data, props.allTime) : null
  const money = (value: number | null | undefined) =>
    value == null ? '—' : formatOpsMoney(value)

  const stats: OpsStat[] = [
    {
      key: 'net',
      label: t('Net profit (estimated)'),
      value: money(profit?.net),
      hint: t('Margin {{rate}}', { rate: formatPercent(profit?.margin) }),
    },
    {
      key: 'revenue',
      label: t('Usage revenue'),
      value: money(profit?.revenue),
      hint: t('What users were charged on upstream channels'),
    },
    {
      key: 'cost',
      label: t('Upstream cost'),
      value: money(profit?.upstreamCost),
      hint: t('At supply prices or supplier charges, {{amount}} of revenue', {
        amount: money(profit?.costedRevenue),
      }),
    },
    {
      key: 'estimated',
      label: t('Estimated cost of other channels'),
      value: money(profit?.estimatedCost),
      hint: t('{{amount}} revenue without a supplier cost, at {{rate}}', {
        amount: money(profit?.uncostedRevenue),
        rate: formatPercent(
          profit?.costRate == null ? null : profit.costRate * 100
        ),
      }),
    },
    {
      key: 'stripe',
      label: t('Stripe fees ({{rate}})', { rate: STRIPE_FEE_PERCENT }),
      value: money(profit?.stripeFee),
      hint: t('{{rate}} of Stripe top-ups {{amount}}', {
        rate: STRIPE_FEE_PERCENT,
        amount: money(profit?.stripeRevenue),
      }),
    },
    {
      key: 'test',
      label: props.allTime ? t('Test credit used') : t('Test credit granted'),
      value: money(profit?.testCredit),
      hint: t('Promotional cost with no revenue'),
    },
  ]

  return (
    <OpsSection
      id='ops-upstream'
      index={5}
      tone='profit'
      icon={ChartPie}
      title={t('Channel profit')}
      description={t(
        'Covers every top-up channel. USDT and redemption codes have no fees.'
      )}
    >
      <OpsStatGrid stats={stats} loading={props.loading} />
      <div className='grid gap-3 xl:grid-cols-2'>
        <OpsWaterfallPanel
          profit={profit}
          loading={props.loading}
          allTime={props.allTime}
        />
        <OpsChannelProfitPanel
          upstream={data?.upstream ?? []}
          loading={props.loading}
        />
      </div>
      <OpsRunwayPanel upstream={data?.upstream ?? []} loading={props.loading} />
      <OpsUpstreamPanel upstream={data?.upstream ?? []} loading={props.loading} />
    </OpsSection>
  )
}

interface WaterfallStep {
  key: string
  label: string
  value: number
  note?: string
  total?: boolean
  /** Shown as a dash: no channel has a supplier cost to estimate from. */
  unknown?: boolean
}

/** Revenue, then each deduction, ending at net profit. */
export function OpsWaterfallPanel(props: {
  profit: OpsProfitBreakdown | null
  loading: boolean
  allTime: boolean
}) {
  const { t } = useTranslation()
  const profit = props.profit
  const steps: WaterfallStep[] = profit
    ? [
        {
          key: 'revenue',
          label: t('Usage revenue'),
          value: profit.revenue,
          total: true,
        },
        {
          key: 'cost',
          label: t('Upstream cost'),
          value: -profit.upstreamCost,
        },
        {
          key: 'estimated',
          label: t('Estimated cost of other channels'),
          value: -profit.estimatedCost,
          note: t('Estimated'),
        },
        {
          key: 'stripe',
          label: t('Stripe fees ({{rate}})', { rate: STRIPE_FEE_PERCENT }),
          value: -profit.stripeFee,
          note: t('Estimated'),
        },
        {
          key: 'test',
          label: props.allTime
            ? t('Test credit used')
            : t('Test credit granted'),
          value: -profit.testCredit,
        },
      ]
    : []
  const scale = Math.max(profit?.revenue ?? 0, 1)
  let running = 0

  return (
    <PanelWrapper
      title={t('From revenue to net profit')}
      description={t(
        'Stripe fees are {{rate}} of Stripe top-ups. Channels without a supplier cost are charged at the cost rate of those with one.',
        { rate: STRIPE_FEE_PERCENT }
      )}
      loading={props.loading}
      empty={(profit?.revenue ?? 0) === 0}
      height='h-64'
      className='min-w-0'
    >
      <ol className='space-y-2.5'>
        {steps.map((step) => {
          const start = step.total ? 0 : running + step.value
          const width = Math.abs(step.value)
          running = step.total ? step.value : running + step.value
          return (
            <WaterfallRow
              key={step.key}
              step={step}
              left={(Math.max(start, 0) / scale) * 100}
              width={(width / scale) * 100}
              tone={step.total ? 'total' : 'deduction'}
            />
          )
        })}
        {profit && (
          <WaterfallRow
            step={{
              key: 'net',
              label: t('Net profit'),
              value: profit.net ?? 0,
              note: profit.net == null ? t('Unknown') : undefined,
              unknown: profit.net == null,
            }}
            left={0}
            width={(Math.max(profit.net ?? 0, 0) / scale) * 100}
            tone={(profit.net ?? 0) < 0 ? 'loss' : 'net'}
          />
        )}
      </ol>
    </PanelWrapper>
  )
}

const WATERFALL_TONES = {
  total: 'bg-chart-1',
  deduction: 'bg-destructive/70',
  net: 'bg-success',
  loss: 'bg-destructive',
}

function WaterfallRow(props: {
  step: WaterfallStep
  left: number
  width: number
  tone: keyof typeof WATERFALL_TONES
}) {
  return (
    <li className='grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:gap-3'>
      <span className='flex min-w-0 items-center gap-1.5'>
        <span className='truncate' title={props.step.label}>
          {props.step.label}
        </span>
        {props.step.note != null && (
          <span className='bg-warning/15 text-warning shrink-0 rounded px-1 text-xs'>
            {props.step.note}
          </span>
        )}
      </span>
      <span className='bg-muted relative h-3 overflow-hidden rounded'>
        <span
          className={cn(
            'absolute inset-y-0 rounded',
            WATERFALL_TONES[props.tone]
          )}
          style={{
            left: `${Math.min(props.left, 100)}%`,
            width: `${Math.min(Math.max(props.width, 0.5), 100)}%`,
          }}
        />
      </span>
      <span
        className={cn(
          'font-mono tabular-nums',
          props.tone === 'loss' && 'text-destructive'
        )}
      >
        {props.step.unknown ? '—' : formatOpsMoney(props.step.value)}
      </span>
    </li>
  )
}

function OpsChannelProfitPanel(props: {
  upstream: OpsUpstream[]
  loading: boolean
}) {
  const { t } = useTranslation()
  const revenueLabel = t('Revenue')
  const costLabel = t('Upstream cost')
  const profitLabel = t('Profit')
  const spec = useMemo(
    () =>
      buildOpsChannelProfitSpec(props.upstream, {
        revenue: revenueLabel,
        cost: costLabel,
        profit: profitLabel,
        formatValue: formatOpsMoney,
      }),
    [props.upstream, revenueLabel, costLabel, profitLabel]
  )
  const costed = props.upstream.some(
    (row) => row.cost_status === 'ok' && row.quota > 0
  )

  return (
    <PanelWrapper
      title={t('Profit by channel')}
      description={t('Channels whose supplier cost is known')}
      loading={props.loading}
      empty={!costed}
      emptyMessage={t(
        'Set a supplier token in model onboarding to read its charges'
      )}
      height='h-64'
      contentClassName='h-64 p-1.5 sm:p-2'
      className='min-w-0'
    >
      <OpsChart spec={spec} label={t('Profit by channel')} />
    </PanelWrapper>
  )
}

function OpsRunwayPanel(props: { upstream: OpsUpstream[]; loading: boolean }) {
  const { t } = useTranslation()
  const quotaPerUnit = getCurrencyDisplay().config.quotaPerUnit
  const rows = props.upstream
    .filter((row) => row.balance_updated_time > 0)
    .map((row) => ({ row, days: upstreamRunwayDays(row, quotaPerUnit) }))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity))

  return (
    <PanelWrapper
      title={t('Upstream balance runway')}
      description={t(
        'Days each supplier balance lasts at the last 7 days of usage. Only channels whose balance was read.'
      )}
      loading={props.loading}
      empty={rows.length === 0}
      emptyMessage={t('No upstream balance has been read yet')}
      height='h-32'
    >
      <ul className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {rows.map(({ row, days }) => {
          const low = days != null && days < RUNWAY_WARNING_DAYS
          return (
            <li
              key={row.channel_id}
              className={cn(
                'rounded-control border px-3 py-2',
                low && 'border-destructive/50 bg-destructive/5'
              )}
            >
              <div className='truncate text-sm' title={row.name}>
                {row.name}
              </div>
              <div
                className={cn(
                  'font-mono text-lg font-semibold tabular-nums',
                  low && 'text-destructive'
                )}
              >
                {days == null
                  ? '—'
                  : t('{{days}} days', { days: Math.floor(days) })}
              </div>
              <div className='text-muted-foreground font-mono text-xs tabular-nums'>
                {t('Balance {{amount}}', {
                  amount: formatCurrencyUSD(row.balance),
                })}
              </div>
            </li>
          )
        })}
      </ul>
    </PanelWrapper>
  )
}
