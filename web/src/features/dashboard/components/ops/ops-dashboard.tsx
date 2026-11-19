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

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getOpsDashboard } from '../../api'
import {
  isLowSuccessRate,
  OPS_CHANNEL_ALL,
  OPS_TOPUP_CHANNELS,
  opsCustomRangeIssue,
  resolveOpsRange,
  type OpsCustomRange,
  type OpsRangeKey,
} from '../../lib/ops'
import { OpsAlertBar } from './ops-alert-bar'
import { OpsFilterBar } from './ops-filter-bar'
import { OpsOverviewSection } from './ops-overview-section'
import { OpsProfitSection } from './ops-profit-section'
import { OpsSectionNav } from './ops-section-nav'
import type { OpsSectionProps } from './ops-stat-grid'
import { OpsTasksSection } from './ops-tasks-section'
import { OpsTopupsSection } from './ops-topups-section'
import { OpsUsersSection } from './ops-users-section'
import { OpsWalletSection } from './ops-wallet-section'

export function OpsDashboard() {
  const { t } = useTranslation()

  const [rangeKey, setRangeKey] = useState<OpsRangeKey>('all')
  const [custom, setCustom] = useState<OpsCustomRange>({})
  const [channel, setChannel] = useState(OPS_CHANNEL_ALL)
  const [excludeInternal, setExcludeInternal] = useState(true)
  const customIssue = rangeKey === 'custom' ? opsCustomRangeIssue(custom) : null

  const query = useQuery({
    queryKey: [
      'dashboard',
      'ops',
      {
        rangeKey,
        customStart: custom.start?.getTime(),
        customEnd: custom.end?.getTime(),
        channel,
        excludeInternal,
      },
    ],
    // The clock is read per request, so every fetch reaches up to the present
    // however long the page has been open.
    queryFn: async () => {
      const now = new Date()
      const range = resolveOpsRange(rangeKey, now, custom)
      if (!range) throw new Error('Invalid time range')
      const period =
        rangeKey === 'all'
          ? { all_time: true }
          : { start_timestamp: range.start, end_timestamp: range.end }
      return requireServerSuccess(
        await getOpsDashboard({
          ...period,
          channel,
          exclude_internal: excludeInternal,
          tz_offset_minutes: -now.getTimezoneOffset(),
        })
      )
    },
    enabled: customIssue == null,
    select: (res) => res.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const sectionProps: OpsSectionProps = {
    data,
    loading: query.isLoading,
    allTime: rangeKey === 'all',
    channel,
  }

  const navItems = useMemo(
    () => [
      { id: 'ops-overview', index: 0, label: t('Overview') },
      { id: 'ops-wallet', index: 1, label: t('Wallet') },
      { id: 'ops-users', index: 2, label: t('Users') },
      { id: 'ops-orders', index: 3, label: t('Top-ups and usage') },
      { id: 'ops-models', index: 4, label: t('Tasks and models') },
      { id: 'ops-upstream', index: 5, label: t('Channel profit') },
    ],
    [t]
  )

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

  const filterBar = (
    <OpsFilterBar
      range={rangeKey}
      onRangeChange={setRangeKey}
      custom={custom}
      onCustomChange={setCustom}
      channel={channel}
      channels={OPS_TOPUP_CHANNELS}
      onChannelChange={setChannel}
      excludeInternal={excludeInternal}
      onExcludeInternalChange={setExcludeInternal}
      onRefresh={() => void query.refetch()}
      refreshing={query.isFetching || customIssue != null}
    />
  )

  if (customIssue != null) {
    return (
      <div className='space-y-5'>
        {filterBar}
        <EmptyState
          bordered
          title={
            customIssue === 'inverted'
              ? t('The end date cannot be before the start date')
              : t('Select a start and end date to see the figures')
          }
        />
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {filterBar}

      {query.isError && (
        <ErrorState
          title={t('Failed to load the business dashboard')}
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}

      <OpsAlertBar alerts={alerts} />
      <OpsSectionNav items={navItems} />

      <OpsOverviewSection {...sectionProps} />
      <OpsWalletSection {...sectionProps} />
      <OpsUsersSection {...sectionProps} />
      <OpsTopupsSection {...sectionProps} />
      <OpsTasksSection {...sectionProps} />
      <OpsProfitSection {...sectionProps} />
    </div>
  )
}
