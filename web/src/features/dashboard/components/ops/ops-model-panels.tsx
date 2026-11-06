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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatLatency } from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  formatOpsMoney,
  isLowSuccessRate,
  OPS_LOW_SUCCESS_RATE,
  OPS_MIN_RATE_REQUESTS,
  percentOf,
  topModels,
  worstModelsFirst,
  type OpsModelMetric,
} from '../../lib/ops'
import type { OpsDashboardData, OpsModelPerf, OpsModelUsage } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'

const CELL = 'text-right font-mono tabular-nums'
const MODEL_LIMIT = 8

export function OpsModelUsagePanel(props: {
  models: OpsModelUsage[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [metric, setMetric] = useState<OpsModelMetric>('quota')
  const bars = useMemo(
    () => topModels(props.models, metric, MODEL_LIMIT),
    [props.models, metric]
  )

  return (
    <PanelWrapper
      title={t('Model usage distribution')}
      loading={props.loading}
      empty={props.models.length === 0}
      height='h-72'
      className='min-w-0'
      headerActions={
        <Tabs
          value={metric}
          onValueChange={(value) => setMetric(value as OpsModelMetric)}
        >
          <TabsList>
            <TabsTrigger value='quota'>{t('Usage amount')}</TabsTrigger>
            <TabsTrigger value='count'>{t('Calls')}</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <ul className='space-y-3'>
        {bars.map((bar) => (
          <li key={bar.name}>
            <div className='flex justify-between gap-3 text-sm'>
              <span className='truncate font-mono' title={bar.name}>
                {bar.name}
              </span>
              <span className='shrink-0 font-mono tabular-nums'>
                {metric === 'quota'
                  ? formatOpsMoney(bar.value)
                  : formatNumber(bar.value, locale)}{' '}
                <span className='text-muted-foreground'>
                  {formatPercent(bar.share)}
                </span>
              </span>
            </div>
            <Progress
              value={bar.width}
              aria-label={bar.name}
              className='mt-1.5'
            />
          </li>
        ))}
      </ul>
    </PanelWrapper>
  )
}

export function OpsModelRatePanel(props: {
  models: OpsModelPerf[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const rows = useMemo(
    () => worstModelsFirst(props.models, MODEL_LIMIT),
    [props.models]
  )

  return (
    <PanelWrapper
      title={t('Model success rate')}
      description={t(
        'Highlighted below {{rate}}% with at least {{calls}} calls. Includes admin traffic.',
        { rate: OPS_LOW_SUCCESS_RATE, calls: OPS_MIN_RATE_REQUESTS }
      )}
      loading={props.loading}
      empty={rows.length === 0}
      height='h-72'
      className='min-w-0'
      contentClassName='p-0 sm:p-0'
    >
      <Table className='min-w-[500px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Model')}</TableHead>
            <TableHead className='text-right'>{t('Calls')}</TableHead>
            <TableHead className='text-right'>{t('Success rate')}</TableHead>
            <TableHead className='text-right'>{t('Average latency')}</TableHead>
            <TableHead className='text-right'>
              {t('Time to first token')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.model_name}>
              <TableCell className='max-w-56 truncate font-mono'>
                {row.model_name}
              </TableCell>
              <TableCell className={CELL}>
                {formatNumber(row.requests, locale)}
              </TableCell>
              <TableCell
                className={cn(
                  CELL,
                  isLowSuccessRate(row) && 'text-destructive font-semibold'
                )}
              >
                {formatPercent(percentOf(row.successes, row.requests))}
              </TableCell>
              <TableCell className={CELL}>
                {formatLatency(row.avg_latency_ms)}
              </TableCell>
              <TableCell className={CELL}>
                {formatLatency(row.avg_ttft_ms)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelWrapper>
  )
}

export function OpsTaskPanel(props: {
  tasks: OpsDashboardData['tasks'] | undefined
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tasks = props.tasks
  const stats = [
    { key: 'success', label: t('Succeeded'), value: tasks?.success ?? 0 },
    { key: 'failure', label: t('Failed'), value: tasks?.failure ?? 0 },
    { key: 'running', label: t('In progress'), value: tasks?.in_progress ?? 0 },
    { key: 'queued', label: t('Queued'), value: tasks?.queued ?? 0 },
  ]
  const finished = (tasks?.success ?? 0) + (tasks?.failure ?? 0)

  return (
    <PanelWrapper
      title={t('Async task status')}
      description={t('Success rate of finished tasks: {{rate}}', {
        rate: formatPercent(percentOf(tasks?.success ?? 0, finished)),
      })}
      loading={props.loading}
      height='h-40'
      className='min-w-0'
    >
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {stats.map((stat) => (
          <div key={stat.key}>
            <div className='text-muted-foreground text-xs'>{stat.label}</div>
            <div className='mt-0.5 font-mono text-xl font-bold tabular-nums'>
              {formatNumber(stat.value, locale)}
            </div>
          </div>
        ))}
      </div>
    </PanelWrapper>
  )
}

export function OpsFailReasonPanel(props: {
  reasons: { reason: string; count: number }[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const largest = props.reasons[0]?.count ?? 0

  return (
    <PanelWrapper
      title={t('Top task failure reasons')}
      loading={props.loading}
      empty={props.reasons.length === 0}
      emptyMessage={t('No failed tasks in this period')}
      height='h-40'
      className='min-w-0'
    >
      <ul className='space-y-2.5'>
        {props.reasons.map((item) => (
          <li key={item.reason}>
            <div className='flex justify-between gap-3 text-sm'>
              <span className='truncate' title={item.reason}>
                {t(item.reason, { defaultValue: item.reason })}
              </span>
              <span className='shrink-0 font-mono tabular-nums'>
                {formatNumber(item.count, locale)}
              </span>
            </div>
            <Progress
              value={largest > 0 ? (item.count / largest) * 100 : 0}
              aria-label={item.reason}
              className='mt-1'
            />
          </li>
        ))}
      </ul>
    </PanelWrapper>
  )
}
