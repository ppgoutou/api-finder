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
import { Users } from 'lucide-react'
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
import { cn } from '@/lib/utils'

import { buildOpsUserTrendSpec } from '../../lib/ops-insights'
import { formatOpsMoney,
  opsChangeNote, percentOf } from '../../lib/ops'
import type { OpsInviter, OpsSource } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'
import { OpsChart } from './ops-chart'
import { OpsFunnelList } from './ops-funnel'
import {
  OpsSection,
  OpsStatGrid,
  type OpsSectionProps,
  type OpsStat,
} from './ops-stat-grid'
import { OpsTopUsersPanel } from './ops-upstream-panels'

const CELL = 'text-right font-mono tabular-nums'

export function OpsUsersSection(props: OpsSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const number = (value: number | undefined) => formatNumber(value ?? 0, locale)
  const data = props.data
  const current = data?.current
  const previous = data?.previous
  const allTime = props.allTime
  const funnel = data?.funnel

  const stats: OpsStat[] = [
    {
      key: 'registered',
      label: allTime ? t('Registered users') : t('New users'),
      value: number(current?.new_users),
      hint: allTime ? undefined : t('Registered in this period'),
      ...opsChangeNote(current?.new_users ?? 0, previous?.new_users ?? 0),
    },
    {
      key: 'payers',
      label: t('Paying users'),
      value: number(current?.payers),
      hint: allTime ? t('Paid at least once') : t('Paid in this period'),
      ...opsChangeNote(current?.payers ?? 0, previous?.payers ?? 0),
    },
    allTime
      ? {
          key: 'dormant',
          label: t('Dormant payers'),
          value: number(data?.users.dormant),
          hint: t('Balance left, no calls in 30 days'),
        }
      : {
          key: 'new-payers',
          label: t('New paying users'),
          value: number(current?.new_payers),
          hint: t('First payment in this period'),
          ...opsChangeNote(current?.new_payers ?? 0, previous?.new_payers ?? 0),
        },
    {
      key: 'conversion',
      label: t('Paid conversion'),
      value: formatPercent(
        percentOf(current?.registered_payers ?? 0, current?.new_users ?? 0)
      ),
      hint: t('{{paid}} / {{registered}} registered in this period have paid', {
        paid: number(current?.registered_payers),
        registered: number(current?.new_users),
      }),
    },
    {
      key: 'active',
      label: t('Active users'),
      value: number(current?.active_users),
      hint: allTime
        ? t('Made at least one call')
        : t('Made calls in this period'),
      ...opsChangeNote(current?.active_users ?? 0, previous?.active_users ?? 0),
    },
    {
      key: 'repeat',
      label: t('Repeat payment rate'),
      value: formatPercent(
        percentOf(current?.repeat_payers ?? 0, current?.payers ?? 0)
      ),
      hint: allTime
        ? t('Paid at least twice')
        : t('Paid at least twice in this period'),
    },
  ]

  const newUsersLabel = t('New users')
  const activeUsersLabel = t('Active users')
  const newPayersLabel = t('New paying users')
  const trendSpec = useMemo(
    () =>
      buildOpsUserTrendSpec(data?.trend ?? [], {
        newUsers: newUsersLabel,
        activeUsers: activeUsersLabel,
        newPayers: newPayersLabel,
      }),
    [data?.trend, newUsersLabel, activeUsersLabel, newPayersLabel]
  )

  return (
    <OpsSection
      id='ops-users'
      index={2}
      tone='users'
      icon={Users}
      title={t('Users')}
      description={t(
        'Funnel, sources and inviters follow the users registered in the period, up to now.'
      )}
    >
      <OpsStatGrid stats={stats} loading={props.loading} />
      <div className='grid gap-3 xl:grid-cols-3'>
        <PanelWrapper
          title={t('Daily new and active users')}
          loading={props.loading}
          empty={(data?.trend.length ?? 0) === 0}
          height='h-72'
          contentClassName='h-72 p-1.5 sm:p-2'
          className='min-w-0 xl:col-span-2'
        >
          <OpsChart spec={trendSpec} label={t('Daily new and active users')} />
        </PanelWrapper>
        <PanelWrapper
          title={t('Conversion funnel')}
          description={t('Users registered in the period')}
          loading={props.loading}
          empty={(funnel?.registered ?? 0) === 0}
          height='h-72'
          className='min-w-0'
        >
          <OpsFunnelList
            steps={[
              {
                key: 'registered',
                label: t('Registered'),
                value: funnel?.registered ?? 0,
              },
              {
                key: 'active',
                label: t('Made a call'),
                value: funnel?.active ?? 0,
              },
              { key: 'paid', label: t('Paid'), value: funnel?.paid ?? 0 },
              {
                key: 'repeat',
                label: t('Paid again'),
                value: funnel?.repeat ?? 0,
              },
            ]}
          />
        </PanelWrapper>
      </div>
      <div className='grid gap-3 xl:grid-cols-2'>
        <OpsSourcePanel sources={data?.sources ?? []} loading={props.loading} />
        <OpsInviterPanel
          inviters={data?.inviters ?? []}
          loading={props.loading}
        />
      </div>
      <OpsTopUsersPanel
        users={data?.top_users ?? []}
        usedQuota={current?.used_quota ?? 0}
        dormant={data?.users.dormant ?? 0}
        loading={props.loading}
      />
    </OpsSection>
  )
}

/** Sign-up method across, invited or organic down. */
export function OpsSourcePanel(props: {
  sources: OpsSource[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const cell = (method: OpsSource['method'], invited: boolean) =>
    props.sources.find(
      (source) => source.method === method && source.invited === invited
    )
  const methods: { key: OpsSource['method']; label: string }[] = [
    { key: 'google', label: t('Google sign-in') },
    { key: 'direct', label: t('Direct sign-up') },
  ]
  const rows = [
    { invited: true, label: t('Invited') },
    { invited: false, label: t('Organic') },
  ]
  const total = props.sources.reduce((sum, source) => sum + source.users, 0)

  return (
    <PanelWrapper
      title={t('User sources')}
      description={t(
        'Google sign-in means the account is linked to Google. Paid amount counts orders up to now.'
      )}
      loading={props.loading}
      empty={total === 0}
      height='h-56'
      className='min-w-0'
    >
      <table className='w-full table-fixed border-separate border-spacing-1.5 text-sm'>
        <thead>
          <tr>
            <th className='w-20' />
            {methods.map((method) => (
              <th
                key={method.key}
                scope='col'
                className='text-muted-foreground text-xs font-medium'
              >
                {method.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.invited)}>
              <th
                scope='row'
                className='text-muted-foreground text-left text-xs font-medium'
              >
                {row.label}
              </th>
              {methods.map((method) => {
                const source = cell(method.key, row.invited)
                return (
                  <td
                    key={method.key}
                    className={cn(
                      'rounded-control p-2.5 align-top',
                      row.invited ? 'bg-chart-3/10' : 'bg-muted'
                    )}
                  >
                    <div className='font-mono text-lg font-semibold tabular-nums'>
                      {formatNumber(source?.users ?? 0, locale)}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      {t('{{payers}} paid · {{rate}}', {
                        payers: formatNumber(source?.payers ?? 0, locale),
                        rate: formatPercent(
                          percentOf(source?.payers ?? 0, source?.users ?? 0)
                        ),
                      })}
                    </div>
                    <div className='text-muted-foreground font-mono text-xs tabular-nums'>
                      {formatOpsMoney(source?.quota ?? 0)}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </PanelWrapper>
  )
}

export function OpsInviterPanel(props: {
  inviters: OpsInviter[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  return (
    <PanelWrapper
      title={t('Top inviters')}
      description={t('By what their invitees registered in the period paid')}
      loading={props.loading}
      empty={props.inviters.length === 0}
      emptyMessage={t('No invited users registered in this period')}
      height='h-56'
      className='min-w-0'
      contentClassName='max-h-80 overflow-y-auto p-0 sm:p-0'
    >
      <Table className='min-w-[420px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Inviter')}</TableHead>
            <TableHead className='text-right'>{t('Invited')}</TableHead>
            <TableHead className='text-right'>{t('Paid')}</TableHead>
            <TableHead className='text-right'>{t('Paid amount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.inviters.map((row) => (
            <TableRow key={row.user_id}>
              <TableCell className='max-w-40 truncate font-mono'>
                {row.username || `#${row.user_id}`}
              </TableCell>
              <TableCell className={CELL}>
                {formatNumber(row.invited, locale)}
              </TableCell>
              <TableCell className={CELL}>
                {formatNumber(row.payers, locale)}
              </TableCell>
              <TableCell className={CELL}>{formatOpsMoney(row.quota)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelWrapper>
  )
}
