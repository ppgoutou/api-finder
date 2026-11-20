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
import { Coins } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'

import { buildOpsTierSpec } from '../../lib/ops-insights'
import {
  channelTracksRefunds,
  formatOpsMoney,
  opsChangeNote,
  OPS_CHANNEL_ALL,
  opsChannelLabel,
  percentOf,
} from '../../lib/ops'
import type { OpsTopupTier } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'
import { OpsChart } from './ops-chart'
import {
  OpsChannelPanel,
  OpsChannelTable,
  OpsTrendPanel,
} from './ops-order-panels'
import {
  OpsSection,
  OpsStatGrid,
  type OpsSectionProps,
  type OpsStat,
} from './ops-stat-grid'

export function OpsTopupsSection(props: OpsSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const number = (value: number | undefined) => formatNumber(value ?? 0, locale)
  const money = (value: number | undefined) => formatOpsMoney(value ?? 0)
  const data = props.data
  const current = data?.current
  const previous = data?.previous
  const channel = props.channel
  const refundsTracked = channelTracksRefunds(channel)
  // Redemption codes are bought, so they count as payments here.
  const payments = (current?.topup_orders ?? 0) + (current?.redemptions ?? 0)
  const paidQuota =
    (current?.topup_quota ?? 0) + (current?.redemption_quota ?? 0)
  const finishedOrders =
    (current?.topup_orders ?? 0) + (current?.closed_orders ?? 0)

  const stats: OpsStat[] = [
    {
      key: 'orders',
      label: t('Top-up orders'),
      value: number(current?.topup_orders),
      hint: t('Amount {{amount}}', { amount: money(current?.topup_quota) }),
      ...opsChangeNote(current?.topup_orders ?? 0, previous?.topup_orders ?? 0),
    },
    {
      key: 'codes',
      label: t('Redemption codes used'),
      value: number(current?.redemptions),
      hint: t('Amount {{amount}}', {
        amount: money(current?.redemption_quota),
      }),
      ...opsChangeNote(current?.redemptions ?? 0, previous?.redemptions ?? 0),
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
      value: payments > 0 ? money(paidQuota / payments) : '—',
      hint: t('Top-up amount / payments, redemption codes included'),
    },
  ]

  return (
    <OpsSection
      id='ops-orders'
      index={3}
      tone='topups'
      icon={Coins}
      title={t('Top-ups and usage')}
      description={t('Channel: {{channel}}', {
        channel:
          channel === OPS_CHANNEL_ALL ? t('All') : opsChannelLabel(channel, t),
      })}
    >
      <OpsStatGrid stats={stats} loading={props.loading} columns={5} />
      <OpsTrendPanel
        trend={data?.trend ?? []}
        loading={props.loading}
        usedQuota={current?.used_quota ?? 0}
      />
      <div className='grid gap-3 xl:grid-cols-2'>
        <OpsChannelPanel
          channels={data?.channels ?? []}
          loading={props.loading}
          allTime={props.allTime}
        />
        <OpsTierPanel
          tiers={data?.topup_tiers ?? []}
          loading={props.loading}
        />
      </div>
      <OpsChannelTable channels={data?.channels ?? []} loading={props.loading} />
    </OpsSection>
  )
}

function OpsTierPanel(props: { tiers: OpsTopupTier[]; loading: boolean }) {
  const { t } = useTranslation()
  const firstLabel = t('First top-up')
  const repeatLabel = t('Repeat top-up')
  const spec = useMemo(
    () =>
      buildOpsTierSpec(props.tiers, { first: firstLabel, repeat: repeatLabel }),
    [props.tiers, firstLabel, repeatLabel]
  )
  const orders = props.tiers.reduce(
    (sum, tier) => sum + tier.first_orders + tier.repeat_orders,
    0
  )

  return (
    <PanelWrapper
      title={t('Top-up amount tiers')}
      description={t('Payments in the period by amount, redemption codes included')}
      loading={props.loading}
      empty={orders === 0}
      emptyMessage={t('No payments in this period')}
      height='h-64'
      contentClassName='h-64 p-1.5 sm:p-2'
      className='min-w-0'
    >
      <OpsChart spec={spec} label={t('Top-up amount tiers')} />
    </PanelWrapper>
  )
}
