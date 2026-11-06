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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getOpsDashboard } from '../../api'
import {
  channelTracksRefunds,
  formatOpsMoney,
  isLowSuccessRate,
  OPS_CHANNEL_ALL,
  opsChannelLabel,
  percentChange,
  percentOf,
  reconcileWallet,
  resolveOpsRange,
  walletRunwayDays,
  type OpsCustomRange,
  type OpsRangeKey,
} from '../../lib/ops'
import { OpsAlertBar } from './ops-alert-bar'
import { OpsFilterBar } from './ops-filter-bar'
import {
  OpsFailReasonPanel,
  OpsModelRatePanel,
  OpsModelUsagePanel,
  OpsTaskPanel,
} from './ops-model-panels'
import {
  OpsChannelPanel,
  OpsChannelTable,
  OpsTrendPanel,
} from './ops-order-panels'
import {
  OpsSection,
  OpsStatGrid,
  type OpsStat,
  type OpsStatTone,
} from './ops-stat-grid'
import { OpsTopUsersPanel, OpsUpstreamPanel } from './ops-upstream-panels'

function changeNote(current: number, previous: number) {
  const change = percentChange(current, previous)
  if (change == null) return {}
  const tone: OpsStatTone = change >= 0 ? 'good' : 'bad'
  return {
    note: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    noteTone: tone,
  }
}

export function OpsDashboard() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const count = (value: number) => formatNumber(value, locale)

  const [rangeKey, setRangeKey] = useState<OpsRangeKey>('7d')
  const [custom, setCustom] = useState<OpsCustomRange>({})
  const [channel, setChannel] = useState(OPS_CHANNEL_ALL)
  const [excludeInternal, setExcludeInternal] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState(() => new Date())

  const range = useMemo(
    () => resolveOpsRange(rangeKey, refreshedAt, custom),
    [rangeKey, refreshedAt, custom]
  )
  const params = {
    start_timestamp: range.start,
    end_timestamp: range.end,
    channel,
    exclude_internal: excludeInternal,
    tz_offset_minutes: -refreshedAt.getTimezoneOffset(),
  }
  const query = useQuery({
    queryKey: ['dashboard', 'ops', params],
    queryFn: async () => requireServerSuccess(await getOpsDashboard(params)),
    select: (res) => res.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const loading = query.isLoading

  const channelOptions = useMemo(() => {
    const options = (data?.channels ?? []).map((row) => row.channel)
    if (channel !== OPS_CHANNEL_ALL && !options.includes(channel)) {
      options.push(channel)
    }
    return options
  }, [data?.channels, channel])

  const recon = data ? reconcileWallet(data.wallet) : null
  const runway = data ? walletRunwayDays(data.wallet) : null
  const current = data?.current
  const previous = data?.previous
  const money = (value: number | undefined) => formatOpsMoney(value ?? 0)
  const number = (value: number | undefined) => count(value ?? 0)

  const walletStats: OpsStat[] = [
    {
      key: 'topup',
      label: t('Total top-ups'),
      value: money(data?.wallet.topup_quota),
      hint: t('Lifetime, net of refunds'),
      note: t('This period {{amount}}', {
        amount: money(current?.topup_quota),
      }),
    },
    {
      key: 'used',
      label: t('Amount used'),
      value: money(data?.wallet.used_quota),
      hint: t('Lifetime usage'),
      note: t('This period {{amount}}', { amount: money(current?.used_quota) }),
    },
    {
      key: 'balance',
      label: t('Unused amount'),
      value: money(data?.wallet.balance_quota),
      hint: t('Current balance of all users'),
    },
    {
      key: 'other',
      label: t('Other credits'),
      value: money(recon?.otherCredit),
      hint: t('Redemption codes, rebates, check-ins'),
      note: t('This period {{amount}}', {
        amount: money(current?.other_credit_quota),
      }),
    },
    {
      key: 'negative',
      label: t('Negative balances'),
      value: money(Math.abs(data?.wallet.negative_quota ?? 0)),
      hint: t('{{count}} users owe right now', {
        count: data?.wallet.negative_users ?? 0,
      }),
    },
    {
      key: 'runway',
      label: t('Balance runway'),
      value:
        runway == null ? '—' : t('{{days}} days', { days: Math.floor(runway) }),
      hint: t('At the last 7 days of usage'),
    },
  ]

  const userStats: OpsStat[] = [
    {
      key: 'registered',
      label: t('Registered users'),
      value: number(data?.users.registered),
      hint: t('{{count}} new in this period', {
        count: current?.new_users ?? 0,
      }),
      ...changeNote(current?.new_users ?? 0, previous?.new_users ?? 0),
    },
    {
      key: 'payers',
      label: t('Paying users'),
      value: number(current?.payers),
      hint: t('Paid in this period'),
      ...changeNote(current?.payers ?? 0, previous?.payers ?? 0),
    },
    {
      key: 'new-payers',
      label: t('New paying users'),
      value: number(current?.new_payers),
      hint: t('First payment in this period'),
      ...changeNote(current?.new_payers ?? 0, previous?.new_payers ?? 0),
    },
    {
      key: 'conversion',
      label: t('Paid conversion'),
      value: formatPercent(
        percentOf(data?.users.total_payers ?? 0, data?.users.registered ?? 0)
      ),
      hint: `${number(data?.users.total_payers)} / ${number(data?.users.registered)}`,
    },
    {
      key: 'active',
      label: t('Active users'),
      value: number(current?.active_users),
      hint: t('Made calls in this period'),
      ...changeNote(current?.active_users ?? 0, previous?.active_users ?? 0),
    },
    {
      key: 'repeat',
      label: t('Repeat payment rate'),
      value: formatPercent(
        percentOf(data?.users.repeat_payers ?? 0, data?.users.total_payers ?? 0)
      ),
      hint: t('Paid at least twice'),
    },
  ]

  const refundsTracked = channelTracksRefunds(channel)
  const finishedOrders =
    (current?.topup_orders ?? 0) + (current?.closed_orders ?? 0)
  const orderStats: OpsStat[] = [
    {
      key: 'orders',
      label: t('Top-up orders'),
      value: number(current?.topup_orders),
      hint: t('Amount {{amount}}', { amount: money(current?.topup_quota) }),
      ...changeNote(current?.topup_orders ?? 0, previous?.topup_orders ?? 0),
    },
    {
      key: 'refunds',
      label: t('Refund orders'),
      value: refundsTracked ? number(current?.refund_orders) : '—',
      hint: refundsTracked
        ? t('Amount {{amount}}', { amount: money(current?.refund_quota) })
        : t('This channel has no refund flow'),
    },
    {
      key: 'pending',
      label: t('Awaiting payment'),
      value: number(data?.pending.pending),
      hint: t('Current, within 24 hours'),
      note:
        (data?.pending.overdue ?? 0) > 0
          ? t('{{count}} overdue and not closed', {
              count: data?.pending.overdue ?? 0,
            })
          : undefined,
      noteTone: 'warning',
    },
    {
      key: 'disputes',
      label: t('Disputed orders'),
      value: refundsTracked ? number(current?.disputed_orders) : '—',
      hint: t('Stripe chargebacks'),
    },
    {
      key: 'rate',
      label: t('Payment success rate'),
      value: formatPercent(
        percentOf(current?.topup_orders ?? 0, finishedOrders)
      ),
      hint: t('Paid / (paid + failed + expired)'),
    },
    {
      key: 'average',
      label: t('Average order value'),
      value:
        (current?.topup_orders ?? 0) > 0
          ? money((current?.topup_quota ?? 0) / (current?.topup_orders ?? 1))
          : '—',
      hint: t('Top-up amount / paid orders'),
    },
  ]

  const lowRateModels = data?.model_perf.filter(isLowSuccessRate).length ?? 0
  const alerts = [
    {
      key: 'overdue',
      n: data?.alerts.overdue_orders ?? 0,
      label: t('overdue orders not closed'),
      href: '#ops-orders',
    },
    {
      key: 'usdt',
      n: data?.alerts.usdt_exceptions ?? 0,
      label: t('USDT receipts need handling'),
      href: '/system-settings/billing/payment',
    },
    {
      key: 'disputes',
      n: data?.alerts.disputed_orders ?? 0,
      label: t('open Stripe disputes'),
      href: '#ops-orders',
    },
    {
      key: 'rates',
      n: lowRateModels,
      label: t('models with a low success rate'),
      href: '#ops-models',
    },
    {
      key: 'balance',
      n: data?.alerts.low_balance_channels ?? 0,
      label: t('upstream channels low on balance'),
      href: '#ops-upstream',
    },
  ].filter((alert) => alert.n > 0)

  return (
    <div className='space-y-5'>
      <OpsFilterBar
        range={rangeKey}
        onRangeChange={setRangeKey}
        custom={custom}
        onCustomChange={setCustom}
        channel={channel}
        channels={channelOptions}
        onChannelChange={setChannel}
        excludeInternal={excludeInternal}
        onExcludeInternalChange={setExcludeInternal}
        onRefresh={() => setRefreshedAt(new Date())}
        refreshing={query.isFetching}
      />

      {query.isError && (
        <ErrorState
          title={t('Failed to load the business dashboard')}
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}

      <OpsAlertBar alerts={alerts} />

      <OpsSection
        id='ops-wallet'
        title={t('Wallet')}
        description={t(
          'Only total top-ups follow the order channel. Unused amount and negative balances are current.'
        )}
      >
        <OpsStatGrid
          stats={walletStats}
          loading={loading}
          footer={
            recon && (
              <div className='bg-muted/50 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t px-3 py-2.5 text-sm sm:px-5'>
                <span className='font-medium'>
                  {t('All-channel reconciliation')}
                </span>
                <span className='font-mono tabular-nums'>
                  {t('Top-ups {{topups}} + other {{other}} = {{total}}', {
                    topups: formatOpsMoney(
                      data?.wallet.all_channels_quota ?? 0
                    ),
                    other: formatOpsMoney(recon.otherCredit),
                    total: formatOpsMoney(recon.inflow),
                  })}
                </span>
                <span className='text-muted-foreground'>≈</span>
                <span className='font-mono tabular-nums'>
                  {t('Used + balance = {{total}}', {
                    total: formatOpsMoney(recon.outflow),
                  })}
                </span>
                <span
                  className='text-warning ml-auto font-mono font-semibold tabular-nums'
                  title={t(
                    'Includes manual adjustments, sign-up bonuses, subscription payments from balance and deleted accounts, which have no structured record.'
                  )}
                >
                  {t('Difference {{amount}}', {
                    amount: formatOpsMoney(recon.difference),
                  })}
                </span>
              </div>
            )
          }
        />
      </OpsSection>

      <OpsSection id='ops-users' title={t('Users')}>
        <OpsStatGrid stats={userStats} loading={loading} />
      </OpsSection>

      <OpsSection
        id='ops-orders'
        title={t('Orders')}
        description={t('Channel: {{channel}}', {
          channel:
            channel === OPS_CHANNEL_ALL ? t('All') : opsChannelLabel(channel),
        })}
      >
        <OpsStatGrid stats={orderStats} loading={loading} />
        <div className='grid gap-3 xl:grid-cols-3'>
          <OpsTrendPanel
            trend={data?.trend ?? []}
            loading={loading}
            topupQuota={current?.topup_quota ?? 0}
            usedQuota={current?.used_quota ?? 0}
          />
          <OpsChannelPanel channels={data?.channels ?? []} loading={loading} />
        </div>
        <OpsChannelTable channels={data?.channels ?? []} loading={loading} />
      </OpsSection>

      <OpsSection id='ops-models' title={t('Tasks and models')}>
        <div className='grid gap-3 lg:grid-cols-2'>
          <OpsModelUsagePanel models={data?.models ?? []} loading={loading} />
          <OpsModelRatePanel
            models={data?.model_perf ?? []}
            loading={loading}
          />
          <OpsTaskPanel tasks={data?.tasks} loading={loading} />
          <OpsFailReasonPanel
            reasons={data?.tasks.fail_reasons ?? []}
            loading={loading}
          />
        </div>
      </OpsSection>

      <OpsSection
        id='ops-upstream'
        title={t('Upstream channels and top users')}
      >
        <div className='grid gap-3 lg:grid-cols-2'>
          <OpsUpstreamPanel upstream={data?.upstream ?? []} loading={loading} />
          <OpsTopUsersPanel
            users={data?.top_users ?? []}
            usedQuota={current?.used_quota ?? 0}
            dormant={data?.users.dormant ?? 0}
            loading={loading}
          />
        </div>
      </OpsSection>
    </div>
  )
}
