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
import { Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  formatOpsMoney,
  reconcileWallet,
  walletRunwayDays,
} from '../../lib/ops'
import type { OpsDashboardData } from '../../types'
import { OpsSection, OpsStatGrid, type OpsStat } from './ops-stat-grid'
import { OpsSupplierWallets } from './ops-supplier-wallets'

/**
 * Figures of the present moment: balances, debts, open orders and running
 * tasks. No time or channel filter changes them, so they sit above the
 * filters.
 */
export function OpsLiveSection(props: {
  data: OpsDashboardData | undefined
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const number = (value: number | undefined) => formatNumber(value ?? 0, locale)
  const data = props.data
  const wallet = data?.wallet
  const runway = wallet ? walletRunwayDays(wallet) : null
  const recon = wallet ? reconcileWallet(wallet) : null
  // Summed over the channel table, which always lists every channel, so the
  // channel filter does not change these either.
  let pending = 0
  let overdue = 0
  for (const row of data?.channels ?? []) {
    pending += row.pending - row.overdue
    overdue += row.overdue
  }

  const stats: OpsStat[] = [
    {
      key: 'unspent',
      label: t('Prepaid, not yet spent'),
      value: formatOpsMoney(wallet?.balance_quota ?? 0),
      hint:
        runway == null
          ? t('Current balance of all users')
          : t('Lasts about {{days}} days at the last 7 days of usage', {
              days: Math.floor(runway),
            }),
    },
    {
      key: 'negative',
      label: t('Negative balances'),
      value: formatOpsMoney(Math.abs(wallet?.negative_quota ?? 0)),
      hint: t('{{count}} users owe right now', {
        count: wallet?.negative_users ?? 0,
      }),
    },
    {
      key: 'dormant',
      label: t('Dormant payers'),
      value: number(data?.users.dormant),
      hint: t('Balance left, no calls in 30 days'),
    },
    {
      key: 'pending',
      label: t('Awaiting payment'),
      value: number(pending),
      hint: t('Orders opened in the last 24 hours'),
      note:
        overdue > 0
          ? t('{{count}} overdue and not closed', { count: overdue })
          : undefined,
      noteTone: 'warning',
    },
    {
      key: 'tasks',
      label: t('Tasks running'),
      value: number(data?.live.tasks_in_progress),
      hint: t('{{count}} queued', { count: data?.live.tasks_queued ?? 0 }),
    },
    {
      key: 'reconciliation',
      label: t('Reconciliation difference'),
      value: recon == null ? '—' : formatOpsMoney(recon.difference),
      fullValue:
        recon == null
          ? undefined
          : t(
              'Includes manual adjustments, sign-up bonuses, subscription payments from balance and deleted accounts, which have no structured record.'
            ),
      hint:
        recon == null
          ? undefined
          : t('In {{inflow}} vs used + balance {{outflow}}', {
              inflow: formatOpsMoney(recon.inflow),
              outflow: formatOpsMoney(recon.outflow),
            }),
    },
  ]

  return (
    <OpsSection
      id='ops-live'
      tone='neutral'
      icon={Activity}
      title={t('Live status')}
      description={t('Current figures. The time and channel filters do not change them.')}
    >
      <OpsStatGrid
        stats={stats}
        loading={props.loading}
        footer={<OpsSupplierWallets upstream={data?.upstream ?? []} />}
      />
    </OpsSection>
  )
}
