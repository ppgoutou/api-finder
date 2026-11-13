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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'

import {
  buildOpsChannelSpec,
  buildOpsTrendSpec,
  channelTracksRefunds,
  formatOpsMoney,
  opsChannelLabel,
  percentOf,
} from '../../lib/ops'
import type { OpsChannelStats, OpsTrendDay } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'
import { OpsChart } from './ops-chart'

const CELL = 'text-right font-mono tabular-nums'

export function OpsTrendPanel(props: {
  trend: OpsTrendDay[]
  loading: boolean
  topupQuota: number
  usedQuota: number
}) {
  const { t } = useTranslation()
  const usageLabel = t('Site usage')
  const spec = useMemo(
    () =>
      buildOpsTrendSpec(props.trend, {
        usage: usageLabel,
        formatValue: formatOpsMoney,
      }),
    [props.trend, usageLabel]
  )

  return (
    <PanelWrapper
      title={t('Daily top-ups and usage')}
      description={t('Top-ups {{topups}}, usage {{usage}}', {
        topups: formatOpsMoney(props.topupQuota),
        usage: formatOpsMoney(props.usedQuota),
      })}
      loading={props.loading}
      height='h-80'
      contentClassName='h-80 p-1.5 sm:p-2'
      className='min-w-0 xl:col-span-2'
    >
      <OpsChart spec={spec} label={t('Daily top-ups and usage')} />
    </PanelWrapper>
  )
}

export function OpsChannelPanel(props: {
  channels: OpsChannelStats[]
  loading: boolean
  allTime: boolean
}) {
  const { t } = useTranslation()
  const rows = useMemo(
    () =>
      props.channels
        .filter((row) => row.topup_quota > 0)
        .map((row) => ({ channel: row.channel, quota: row.topup_quota })),
    [props.channels]
  )
  const total = rows.reduce((sum, row) => sum + row.quota, 0)
  const spec = useMemo(() => buildOpsChannelSpec(rows, formatOpsMoney), [rows])

  return (
    <PanelWrapper
      title={t('Order channel distribution')}
      description={
        props.allTime
          ? t('Top-up amount of all time, all channels')
          : t('Top-up amount in the period, all channels')
      }
      loading={props.loading}
      empty={rows.length === 0}
      height='h-80'
      className='min-w-0'
    >
      <div className='h-48'>
        <OpsChart spec={spec} label={t('Order channel distribution')} />
      </div>
      <ul className='mt-3 space-y-2 text-sm'>
        {rows.map((row) => (
          <li key={row.channel} className='flex justify-between gap-3'>
            <span>{opsChannelLabel(row.channel)}</span>
            <span className='font-mono tabular-nums'>
              {formatOpsMoney(row.quota)} ·{' '}
              {formatPercent(percentOf(row.quota, total))}
            </span>
          </li>
        ))}
      </ul>
    </PanelWrapper>
  )
}

export function OpsChannelTable(props: {
  channels: OpsChannelStats[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const count = (value: number) => formatNumber(value, locale)
  const refundCell = (channel: string, value: number) =>
    channelTracksRefunds(channel) ? count(value) : '—'

  return (
    <PanelWrapper
      title={t('Orders by channel')}
      description={t(
        'Refunds and disputes are only reported by Stripe. Pending counts are current.'
      )}
      loading={props.loading}
      empty={props.channels.length === 0}
      height='h-40'
      contentClassName='p-0 sm:p-0'
    >
      <Table className='min-w-[760px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Channel')}</TableHead>
            <TableHead className='text-right'>{t('Top-up orders')}</TableHead>
            <TableHead className='text-right'>{t('Top-up amount')}</TableHead>
            <TableHead className='text-right'>
              {t('Awaiting payment')}
            </TableHead>
            <TableHead className='text-right'>{t('Overdue')}</TableHead>
            <TableHead className='text-right'>
              {t('Failed or expired')}
            </TableHead>
            <TableHead className='text-right'>{t('Refunds')}</TableHead>
            <TableHead className='text-right'>{t('Disputes')}</TableHead>
            <TableHead className='text-right'>
              {t('Payment success rate')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.channels.map((row) => (
            <TableRow key={row.channel}>
              <TableCell>{opsChannelLabel(row.channel)}</TableCell>
              <TableCell className={CELL}>{count(row.topup_orders)}</TableCell>
              <TableCell className={CELL}>
                {formatOpsMoney(row.topup_quota)}
              </TableCell>
              <TableCell className={CELL}>
                {count(row.pending - row.overdue)}
              </TableCell>
              <TableCell className={CELL}>{count(row.overdue)}</TableCell>
              <TableCell className={CELL}>{count(row.closed_orders)}</TableCell>
              <TableCell className={CELL}>
                {refundCell(row.channel, row.refund_orders)}
              </TableCell>
              <TableCell className={CELL}>
                {refundCell(row.channel, row.disputed_orders)}
              </TableCell>
              <TableCell className={CELL}>
                {formatPercent(
                  percentOf(
                    row.topup_orders,
                    row.topup_orders + row.closed_orders
                  )
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelWrapper>
  )
}
