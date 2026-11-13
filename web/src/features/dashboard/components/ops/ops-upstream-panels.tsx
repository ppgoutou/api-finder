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
import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCurrencyUSD,
  formatPercent,
  formatTimestampToDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatOpsMoney, opsProfit, percentOf } from '../../lib/ops'
import type { OpsTopUser, OpsUpstream } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'

const CELL = 'text-right font-mono tabular-nums'

export function OpsUpstreamPanel(props: {
  upstream: OpsUpstream[]
  loading: boolean
}) {
  const { t } = useTranslation()
  const revenue = props.upstream.reduce((sum, row) => sum + row.quota, 0)
  const cost = props.upstream.reduce((sum, row) => sum + row.cost_quota, 0)

  return (
    <PanelWrapper
      title={t('Upstream channels')}
      description={t(
        'Revenue is what users spent on the channel. Upstream cost is that charge without the group markup, since model prices are the supplier price. Task success rate only covers async tasks; a dash means no balance was fetched.'
      )}
      loading={props.loading}
      empty={props.upstream.length === 0}
      height='h-40'
      className='min-w-0'
      contentClassName='max-h-[32rem] overflow-y-auto p-0 sm:p-0'
    >
      <Table className='min-w-[760px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Channel')}</TableHead>
            <TableHead className='text-right'>{t('Revenue')}</TableHead>
            <TableHead className='text-right'>{t('Upstream cost')}</TableHead>
            <TableHead className='text-right'>{t('Profit')}</TableHead>
            <TableHead className='text-right'>{t('Profit margin')}</TableHead>
            <TableHead className='text-right'>
              {t('Task success rate')}
            </TableHead>
            <TableHead className='text-right'>
              {t('Upstream balance')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.upstream.map((row) => (
            <TableRow key={row.channel_id}>
              <TableCell className='max-w-48 truncate'>{row.name}</TableCell>
              <TableCell className={CELL}>
                {formatOpsMoney(row.quota)}
              </TableCell>
              <TableCell className={CELL}>
                {formatOpsMoney(row.cost_quota)}
              </TableCell>
              <OpsProfitCells revenue={row.quota} cost={row.cost_quota} />
              <TableCell className={CELL}>
                {formatPercent(
                  percentOf(
                    row.task_success,
                    row.task_success + row.task_failure
                  )
                )}
              </TableCell>
              <TableCell
                className={CELL}
                title={
                  row.balance_updated_time > 0
                    ? formatTimestampToDate(row.balance_updated_time)
                    : undefined
                }
              >
                {row.balance_updated_time > 0
                  ? formatCurrencyUSD(row.balance)
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className='font-medium'>{t('Total')}</TableCell>
            <TableCell className={CELL}>{formatOpsMoney(revenue)}</TableCell>
            <TableCell className={CELL}>{formatOpsMoney(cost)}</TableCell>
            <OpsProfitCells revenue={revenue} cost={cost} />
            <TableCell />
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </PanelWrapper>
  )
}

function OpsProfitCells(props: { revenue: number; cost: number }) {
  const result = opsProfit(props.revenue, props.cost)
  const tone = result.profit < 0 ? 'text-destructive' : undefined
  return (
    <>
      <TableCell className={cn(CELL, tone)}>
        {formatOpsMoney(result.profit)}
      </TableCell>
      <TableCell className={cn(CELL, tone)}>
        {formatPercent(result.margin)}
      </TableCell>
    </>
  )
}

export function OpsTopUsersPanel(props: {
  users: OpsTopUser[]
  usedQuota: number
  dormant: number
  loading: boolean
}) {
  const { t } = useTranslation()

  return (
    <PanelWrapper
      title={t('Top users by usage')}
      description={t(
        'Dormant payers (balance left, no calls in 30 days): {{count}}',
        { count: props.dormant }
      )}
      loading={props.loading}
      empty={props.users.length === 0}
      height='h-40'
      className='min-w-0'
      contentClassName='max-h-96 overflow-y-auto p-0 sm:p-0'
    >
      <Table className='min-w-[480px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('User')}</TableHead>
            <TableHead className='text-right'>{t('Usage amount')}</TableHead>
            <TableHead className='text-right'>{t('Share')}</TableHead>
            <TableHead className='text-right'>{t('Balance')}</TableHead>
            <TableHead className='text-right'>{t('Last call')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.users.map((row) => (
            <TableRow key={row.user_id}>
              <TableCell className='max-w-40 truncate font-mono'>
                {row.username || `#${row.user_id}`}
              </TableCell>
              <TableCell className={CELL}>
                {formatOpsMoney(row.quota)}
              </TableCell>
              <TableCell className={CELL}>
                {formatPercent(percentOf(row.quota, props.usedQuota))}
              </TableCell>
              <TableCell className={CELL}>
                {formatOpsMoney(row.balance)}
              </TableCell>
              <TableCell className={CELL}>
                {formatTimestampToDate(row.last_used_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelWrapper>
  )
}
