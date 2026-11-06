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
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { Table } from '@tanstack/react-table'
import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks'

import { BILLING_LOG_TYPE_FILTERS, LOG_TYPE_ALL_VALUE } from '../constants'
import { buildSearchParams } from '../lib/filter'
import { getDefaultTimeRange } from '../lib/utils'
import { CommonLogsStats } from './common-logs-stats'
import { CompactDateTimeRangePicker } from './compact-date-time-range-picker'
import { ExportLogsDialog } from './dialogs/export-logs-dialog'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from './logs-filter-toolbar'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

type BillingFilterEdits = {
  sourceKey: string
  startTime?: Date
  endTime?: Date
  logType?: string
  username?: string
}

/** Billing records search by time and type; administrators also by user. */
export function BillingRecordsFilterBar<TData>(props: { table: Table<TData> }) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchParams = route.useSearch()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const { sensitiveVisible, setSensitiveVisible } = useUsageLogsContext()
  const fetchingLogs = useIsFetching({ queryKey: ['logs'] })

  const applied = useMemo(() => {
    const { start, end } = getDefaultTimeRange()
    const urlType = searchParams.type?.length === 1 ? searchParams.type[0] : ''
    const logType = BILLING_LOG_TYPE_FILTERS.some(
      (type) => type.value === urlType
    )
      ? urlType
      : LOG_TYPE_ALL_VALUE
    return {
      sourceKey: [
        searchParams.startTime,
        searchParams.endTime,
        searchParams.username,
        logType,
      ].join('\u001f'),
      startTime: searchParams.startTime
        ? new Date(searchParams.startTime)
        : start,
      endTime: searchParams.endTime ? new Date(searchParams.endTime) : end,
      username: searchParams.username || '',
      logType,
    }
  }, [
    searchParams.startTime,
    searchParams.endTime,
    searchParams.username,
    searchParams.type,
  ])
  const [edits, setEdits] = useState<BillingFilterEdits | null>(null)
  const draft =
    edits?.sourceKey === applied.sourceKey ? { ...applied, ...edits } : applied
  const username = isAdmin ? draft.username : ''

  const edit = useCallback(
    (change: Omit<BillingFilterEdits, 'sourceKey'>) => {
      setEdits((current) => ({
        ...(current?.sourceKey === applied.sourceKey ? current : {}),
        ...change,
        sourceKey: applied.sourceKey,
      }))
    },
    [applied.sourceKey]
  )

  const search = (next: {
    startTime: Date
    endTime: Date
    logType: string
  }) => {
    void navigate({
      to: '/usage-logs/$section',
      params: { section: 'billing' },
      search: {
        ...buildSearchParams(
          { startTime: next.startTime, endTime: next.endTime, username },
          'billing'
        ),
        type: [next.logType],
        page: 1,
      },
    })
    void queryClient.invalidateQueries({ queryKey: ['logs'] })
    void queryClient.invalidateQueries({ queryKey: ['usage-logs-stats'] })
  }

  const handleReset = () => {
    const { start, end } = getDefaultTimeRange()
    setEdits(null)
    void navigate({
      to: '/usage-logs/$section',
      params: { section: 'billing' },
      search: {
        page: 1,
        type: [LOG_TYPE_ALL_VALUE],
        startTime: start.getTime(),
        endTime: end.getTime(),
      },
    })
    void queryClient.invalidateQueries({ queryKey: ['logs'] })
    void queryClient.invalidateQueries({ queryKey: ['usage-logs-stats'] })
  }

  const typeItems = BILLING_LOG_TYPE_FILTERS.map((type) => ({
    value: type.value,
    label: t(type.label),
  }))
  const hasTypeFilter = draft.logType !== LOG_TYPE_ALL_VALUE

  const dateRangeFilter = (
    <LogsFilterField wide>
      <CompactDateTimeRangePicker
        start={draft.startTime}
        end={draft.endTime}
        onChange={({ start, end }) => {
          edit({ startTime: start, endTime: end })
          if (isMobile && start && end) {
            search({ startTime: start, endTime: end, logType: draft.logType })
          }
        }}
      />
    </LogsFilterField>
  )
  const typeFilter = (
    <LogsFilterField>
      <Select
        items={typeItems}
        value={draft.logType}
        onValueChange={(value) =>
          edit({ logType: value ?? LOG_TYPE_ALL_VALUE })
        }
      >
        <SelectTrigger aria-label={t('Type')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {typeItems.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </LogsFilterField>
  )
  const usernameFilter = isAdmin && (
    <LogsFilterField>
      <LogsFilterInput
        placeholder={t('Username')}
        className={
          sensitiveVisible ? undefined : '[-webkit-text-security:disc]'
        }
        value={draft.username}
        onChange={(e) => edit({ username: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') search(draft)
        }}
      />
    </LogsFilterField>
  )

  return (
    <LogsFilterToolbar
      table={props.table}
      compactMobile
      stats={<CommonLogsStats logCategory='billing' />}
      actionStart={
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setSensitiveVisible(!sensitiveVisible)}
                aria-label={sensitiveVisible ? t('Hide') : t('Show')}
                className='text-muted-foreground hover:text-foreground size-7 max-sm:size-11'
              />
            }
          >
            {sensitiveVisible ? <Eye /> : <EyeOff />}
          </TooltipTrigger>
          <TooltipContent>
            {sensitiveVisible ? t('Hide') : t('Show')}
          </TooltipContent>
        </Tooltip>
      }
      actionEnd={<ExportLogsDialog />}
      primaryFilters={
        <>
          {dateRangeFilter}
          {typeFilter}
          {usernameFilter}
        </>
      }
      mobilePinnedFilters={dateRangeFilter}
      mobileFilters={
        <>
          {typeFilter}
          {usernameFilter}
        </>
      }
      mobileFilterCount={[hasTypeFilter, !!username].filter(Boolean).length}
      hasActiveFilters={hasTypeFilter || !!username}
      onSearch={() => search(draft)}
      searchLoading={fetchingLogs > 0}
      onReset={handleReset}
    />
  )
}
