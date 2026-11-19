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
import { Cpu } from 'lucide-react'
import { useMemo } from 'react'
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
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'

import {
  buildOpsTaskTrendSpec,
  formatTaskMinutes,
  slowestModelsFirst,
} from '../../lib/ops-insights'
import { formatOpsMoney, percentOf } from '../../lib/ops'
import type { OpsModelDuration, OpsTrendDay, OpsUpstream } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'
import { OpsChart } from './ops-chart'
import {
  OpsFailReasonPanel,
  OpsModelRatePanel,
  OpsModelUsagePanel,
  OpsTaskPanel,
} from './ops-model-panels'
import { OpsSection, type OpsSectionProps } from './ops-stat-grid'

const CELL = 'text-right font-mono tabular-nums'
const CHANNEL_LIMIT = 8

export function OpsTasksSection(props: OpsSectionProps) {
  const { t } = useTranslation()
  const data = props.data

  return (
    <OpsSection
      id='ops-models'
      index={4}
      tone='tasks'
      icon={Cpu}
      title={t('Tasks and models')}
    >
      <div className='grid gap-3 xl:grid-cols-3'>
        <OpsTaskTrendPanel trend={data?.trend ?? []} loading={props.loading} />
        <OpsTaskPanel tasks={data?.tasks} loading={props.loading} />
      </div>
      <div className='grid gap-3 lg:grid-cols-2'>
        <OpsDurationPanel
          models={data?.model_durations ?? []}
          loading={props.loading}
        />
        <OpsChannelUsagePanel
          upstream={data?.upstream ?? []}
          loading={props.loading}
        />
        <OpsModelUsagePanel models={data?.models ?? []} loading={props.loading} />
        <OpsModelRatePanel
          models={data?.model_perf ?? []}
          loading={props.loading}
        />
      </div>
      <OpsFailReasonPanel
        reasons={data?.tasks.fail_reasons ?? []}
        loading={props.loading}
      />
    </OpsSection>
  )
}

function OpsTaskTrendPanel(props: { trend: OpsTrendDay[]; loading: boolean }) {
  const { t } = useTranslation()
  const successLabel = t('Succeeded')
  const failureLabel = t('Failed')
  const spec = useMemo(
    () =>
      buildOpsTaskTrendSpec(props.trend, {
        success: successLabel,
        failure: failureLabel,
      }),
    [props.trend, successLabel, failureLabel]
  )

  return (
    <PanelWrapper
      title={t('Daily task results')}
      loading={props.loading}
      empty={props.trend.length === 0}
      height='h-64'
      contentClassName='h-64 p-1.5 sm:p-2'
      className='min-w-0 xl:col-span-2'
    >
      <OpsChart spec={spec} label={t('Daily task results')} />
    </PanelWrapper>
  )
}

export function OpsDurationPanel(props: {
  models: OpsModelDuration[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const rows = useMemo(() => slowestModelsFirst(props.models), [props.models])

  return (
    <PanelWrapper
      title={t('Generation time')}
      description={t(
        'Successful tasks from submission to result, in minutes. P90 means nine in ten finished faster.'
      )}
      loading={props.loading}
      empty={rows.length === 0}
      emptyMessage={t('No finished tasks in this period')}
      height='h-72'
      className='min-w-0'
      contentClassName='p-0 sm:p-0'
    >
      <Table className='min-w-[420px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Model')}</TableHead>
            <TableHead className='text-right'>{t('Tasks')}</TableHead>
            <TableHead className='text-right'>P50</TableHead>
            <TableHead className='text-right'>P90</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.model_name}>
              <TableCell className='max-w-56 truncate font-mono'>
                {row.model_name}
              </TableCell>
              <TableCell className={CELL}>
                {formatNumber(row.tasks, locale)}
              </TableCell>
              <TableCell className={CELL}>
                {formatTaskMinutes(row.p50_seconds)}
              </TableCell>
              <TableCell className={CELL}>
                {formatTaskMinutes(row.p90_seconds)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelWrapper>
  )
}

/** How much traffic each upstream channel carried in the period. */
export function OpsChannelUsagePanel(props: {
  upstream: OpsUpstream[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const rows = props.upstream.filter((row) => row.quota > 0 || row.count > 0)
  const total = rows.reduce((sum, row) => sum + row.quota, 0)
  const largest = rows[0]?.quota ?? 0
  const shown = rows.slice(0, CHANNEL_LIMIT)

  return (
    <PanelWrapper
      title={t('Upstream channel usage')}
      description={t('Usage amount, calls and task success rate per channel')}
      loading={props.loading}
      empty={shown.length === 0}
      height='h-72'
      className='min-w-0'
    >
      <ul className='space-y-3'>
        {shown.map((row) => (
          <li key={row.channel_id}>
            <div className='flex justify-between gap-3 text-sm'>
              <span className='truncate' title={row.name}>
                {row.name}
              </span>
              <span className='shrink-0 font-mono tabular-nums'>
                {formatOpsMoney(row.quota)}{' '}
                <span className='text-muted-foreground'>
                  {formatPercent(percentOf(row.quota, total))}
                </span>
              </span>
            </div>
            <Progress
              value={largest > 0 ? (row.quota / largest) * 100 : 0}
              aria-label={row.name}
              className='mt-1.5'
            />
            <div className='text-muted-foreground mt-1 flex gap-3 text-xs'>
              <span>
                {t('Calls {{value}}', {
                  value: formatNumber(row.count, locale),
                })}
              </span>
              {row.task_success + row.task_failure > 0 && (
                <span>
                  {t('Task success {{rate}}', {
                    rate: formatPercent(
                      percentOf(
                        row.task_success,
                        row.task_success + row.task_failure
                      )
                    ),
                  })}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </PanelWrapper>
  )
}
