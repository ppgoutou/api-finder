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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  OPS_CHANNEL_ALL,
  opsChannelLabel,
  type OpsCustomRange,
  type OpsRangeKey,
} from '../../lib/ops'

const RANGE_OPTIONS: { value: OpsRangeKey; labelKey: string }[] = [
  { value: 'today', labelKey: 'Today' },
  { value: 'yesterday', labelKey: 'Yesterday' },
  { value: '7d', labelKey: 'Last 7 days' },
  { value: '30d', labelKey: 'Last 30 days' },
  { value: 'month', labelKey: 'Month to date' },
  { value: 'custom', labelKey: 'Custom' },
]

const FILTER_LIST_CLASS =
  'max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'

export function OpsFilterBar(props: {
  range: OpsRangeKey
  onRangeChange: (range: OpsRangeKey) => void
  custom: OpsCustomRange
  onCustomChange: (custom: OpsCustomRange) => void
  channel: string
  channels: string[]
  onChannelChange: (channel: string) => void
  excludeInternal: boolean
  onExcludeInternalChange: (exclude: boolean) => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className='bg-card flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-lg border px-3 py-2.5 sm:px-4'>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-xs'>{t('Time')}</span>
        <Tabs
          value={props.range}
          onValueChange={(value) => props.onRangeChange(value as OpsRangeKey)}
        >
          <TabsList className={FILTER_LIST_CLASS}>
            {RANGE_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {t(option.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {props.range === 'custom' && (
        <div className='flex flex-wrap items-center gap-2'>
          <DateTimePicker
            value={props.custom.start}
            onChange={(start) =>
              props.onCustomChange({ ...props.custom, start })
            }
            placeholder={t('Start date')}
          />
          <DateTimePicker
            value={props.custom.end}
            onChange={(end) => props.onCustomChange({ ...props.custom, end })}
            placeholder={t('End date')}
          />
        </div>
      )}
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-xs'>
          {t('Order channel')}
        </span>
        <Tabs value={props.channel} onValueChange={props.onChannelChange}>
          <TabsList className={FILTER_LIST_CLASS}>
            <TabsTrigger value={OPS_CHANNEL_ALL}>{t('All')}</TabsTrigger>
            {props.channels.map((channel) => (
              <TabsTrigger key={channel} value={channel}>
                {opsChannelLabel(channel)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Label className='cursor-pointer text-sm font-normal'>
        <Checkbox
          checked={props.excludeInternal}
          onCheckedChange={(checked) =>
            props.onExcludeInternalChange(checked === true)
          }
        />
        {t('Exclude admin accounts')}
      </Label>
      <Button
        variant='ghost'
        size='icon'
        className='ml-auto size-8'
        onClick={props.onRefresh}
        disabled={props.refreshing}
        aria-label={t('Refresh')}
      >
        <RefreshCw className={props.refreshing ? 'animate-spin' : undefined} />
      </Button>
    </div>
  )
}
