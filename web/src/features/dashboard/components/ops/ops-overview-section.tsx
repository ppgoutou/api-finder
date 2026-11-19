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
import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'

import { opsDashboardProfit } from '../../lib/ops-insights'
import { formatOpsMoney,
  opsChangeNote, percentOf } from '../../lib/ops'
import type { OpsPeriodStats } from '../../types'
import {
  OpsSection,
  OpsStatGrid,
  type OpsSectionProps,
  type OpsStat,
} from './ops-stat-grid'

function arppu(period: OpsPeriodStats | undefined) {
  if (!period || period.payers <= 0) return null
  return period.topup_quota / period.payers
}

function taskSuccessRate(period: OpsPeriodStats | undefined) {
  if (!period) return null
  return percentOf(period.task_success, period.task_success + period.task_failure)
}

export function OpsOverviewSection(props: OpsSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const data = props.data
  const current = data?.current
  const previous = data?.previous
  const profit = data ? opsDashboardProfit(data, props.allTime) : null
  const compare = !props.allTime
  const currentArppu = arppu(current)
  const previousArppu = arppu(previous)
  const currentRate = taskSuccessRate(current)
  const previousRate = taskSuccessRate(previous)
  const rateChange =
    compare && currentRate != null && previousRate != null
      ? currentRate - previousRate
      : null

  const stats: OpsStat[] = [
    {
      key: 'cash',
      label: t('Cash revenue'),
      value: formatOpsMoney(current?.topup_quota ?? 0),
      hint: t('Paid orders, without redemption codes'),
      ...(compare
        ? opsChangeNote(current?.topup_quota ?? 0, previous?.topup_quota ?? 0)
        : {}),
    },
    {
      key: 'profit',
      label: t('Net profit (estimated)'),
      value: profit?.net == null ? '—' : formatOpsMoney(profit.net),
      hint: t('After upstream cost, Stripe fees and test credit'),
    },
    {
      key: 'payers',
      label: t('Paying users'),
      value: formatNumber(current?.payers ?? 0, locale),
      ...(compare
        ? opsChangeNote(current?.payers ?? 0, previous?.payers ?? 0)
        : {}),
    },
    {
      key: 'arppu',
      label: 'ARPPU',
      value: currentArppu == null ? '—' : formatOpsMoney(currentArppu),
      hint: t('Cash revenue per paying user'),
      ...(compare && currentArppu != null && previousArppu != null
        ? opsChangeNote(currentArppu, previousArppu)
        : {}),
    },
    {
      key: 'liability',
      label: t('Unspent balance'),
      value: formatOpsMoney(data?.wallet.balance_quota ?? 0),
      hint: t('Paid in advance, still owed as service'),
    },
    {
      key: 'tasks',
      label: t('Task success rate'),
      value: formatPercent(currentRate),
      ...(rateChange == null
        ? {}
        : {
            note: t('{{change}} pt', {
              change: `${rateChange >= 0 ? '+' : ''}${rateChange.toFixed(1)}`,
            }),
            noteTone: rateChange >= 0 ? ('good' as const) : ('bad' as const),
          }),
    },
  ]

  return (
    <OpsSection
      id='ops-overview'
      index={0}
      tone='neutral'
      icon={Gauge}
      title={t('Overview')}
      description={
        compare
          ? t('Changes compare with the previous period of the same length')
          : t('All time, so there is no period to compare with')
      }
    >
      <OpsStatGrid stats={stats} loading={props.loading} />
    </OpsSection>
  )
}
