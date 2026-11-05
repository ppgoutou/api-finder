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
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import type { OnboardingFilter, OnboardingStatus } from '../../lib/onboarding'
import type { OnboardingModel } from '../../types'

export type OnboardingRow = {
  item: OnboardingModel
  status: OnboardingStatus
}

export function OnboardingList(props: {
  rows: OnboardingRow[]
  counts: Record<OnboardingFilter, number>
  filter: OnboardingFilter
  onFilterChange: (filter: OnboardingFilter) => void
  search: string
  onSearchChange: (search: string) => void
  selected: string | null
  onSelect: (name: string) => void
  checked: Set<string>
  onCheckedChange: (checked: Set<string>) => void
}) {
  const { t } = useTranslation()
  const allChecked =
    props.rows.length > 0 &&
    props.rows.every((row) => props.checked.has(row.item.model_name))

  const toggle = (name: string, value: boolean) => {
    const next = new Set(props.checked)
    if (value) next.add(name)
    else next.delete(name)
    props.onCheckedChange(next)
  }

  return (
    <div className='flex flex-col gap-3 lg:min-h-0'>
      <Tabs
        value={props.filter}
        onValueChange={(value) =>
          props.onFilterChange(value as OnboardingFilter)
        }
      >
        <TabsList className='grid w-full grid-cols-3 group-data-horizontal/tabs:h-auto'>
          <TabsTrigger value='todo'>
            {t('To do')} ({props.counts.todo})
          </TabsTrigger>
          <TabsTrigger value='pending'>
            {t('New upstream')} ({props.counts.pending})
          </TabsTrigger>
          <TabsTrigger value='removed'>
            {t('Delisted upstream')} ({props.counts.removed})
          </TabsTrigger>
          <TabsTrigger value='priced'>
            {t('Upstream repriced')} ({props.counts.priced})
          </TabsTrigger>
          <TabsTrigger value='ignored'>
            {t('Ignored')} ({props.counts.ignored})
          </TabsTrigger>
          <TabsTrigger value='all'>
            {t('All')} ({props.counts.all})
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className='relative'>
        <Search
          aria-hidden
          className='text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2'
        />
        <Input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder={t('Search models...')}
          aria-label={t('Search models...')}
          className='pl-8'
        />
      </div>
      {props.rows.length > 0 && (
        <label className='text-muted-foreground flex items-center gap-2 px-1 text-xs'>
          <Checkbox
            checked={allChecked}
            onCheckedChange={(value) =>
              props.onCheckedChange(
                value
                  ? new Set(props.rows.map((row) => row.item.model_name))
                  : new Set()
              )
            }
          />
          {t('Select all {{count}} shown', { count: props.rows.length })}
        </label>
      )}
      <div className='max-h-[50vh] overflow-auto rounded-md border lg:max-h-none lg:min-h-0 lg:flex-1'>
        {props.rows.length === 0 ? (
          <EmptyState
            className='min-h-[200px]'
            title={
              props.filter === 'ignored'
                ? t('No ignored models')
                : t('Nothing to onboard')
            }
            description={
              props.filter === 'ignored'
                ? t('Models you set aside wait here until you restore them.')
                : t('New upstream models appear here after a channel check.')
            }
          />
        ) : (
          <ul className='divide-y'>
            {props.rows.map((row) => {
              const name = row.item.model_name
              const active = props.selected === name
              return (
                <li
                  key={name}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2',
                    active && 'bg-muted'
                  )}
                >
                  <Checkbox
                    className='mt-1'
                    aria-label={t('Select {{name}}', { name })}
                    checked={props.checked.has(name)}
                    onCheckedChange={(value) => toggle(name, value)}
                  />
                  <button
                    type='button'
                    aria-current={active ? 'true' : undefined}
                    onClick={() => props.onSelect(name)}
                    className='min-w-0 flex-1 text-left'
                  >
                    <span className='block truncate font-mono text-sm'>
                      {name}
                    </span>
                    <OnboardingStatusBadges status={row.status} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function OnboardingStatusBadges(props: { status: OnboardingStatus }) {
  const { t } = useTranslation()
  const status = props.status
  return (
    <span className='mt-1 flex flex-wrap gap-1'>
      {status.ignored && (
        <StatusBadge size='sm' variant='neutral' label={t('Ignored')} />
      )}
      {status.pending && (
        <StatusBadge size='sm' variant='warning' label={t('New upstream')} />
      )}
      {status.removed && (
        <StatusBadge
          size='sm'
          variant='danger'
          label={t('Delisted upstream')}
        />
      )}
      {status.priceChanged && (
        <StatusBadge
          size='sm'
          variant='warning'
          label={t('Upstream repriced')}
        />
      )}
      {!status.onChannel && (
        <StatusBadge size='sm' variant='danger' label={t('No channel')} />
      )}
      {!status.hasMetadata && (
        <StatusBadge size='sm' variant='danger' label={t('No metadata')} />
      )}
      {status.hasPrice === false && (
        <StatusBadge size='sm' variant='danger' label={t('No price')} />
      )}
      {status.category && (
        <StatusBadge size='sm' variant='info' label={status.category} />
      )}
    </span>
  )
}
