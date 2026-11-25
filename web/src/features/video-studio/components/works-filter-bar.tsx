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

import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { WorkFilter } from '../lib/work-retention'

/** Narrows the loaded works by state or by words of their prompt or model. */
export function WorksFilterBar(props: {
  filter: WorkFilter
  onFilterChange: (filter: WorkFilter) => void
  search: string
  onSearchChange: (search: string) => void
}) {
  const { t } = useTranslation()
  const filters: { value: WorkFilter; label: string }[] = [
    { value: 'all', label: t('All') },
    { value: 'running', label: t('Generating') },
    { value: 'done', label: t('Completed') },
    { value: 'expiring', label: t('Expiring soon') },
    { value: 'failed', label: t('Failed') },
    { value: 'expired', label: t('Expired') },
  ]
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <ToggleGroup
        aria-label={t('Filter works')}
        value={[props.filter]}
        onValueChange={(values: string[]) => {
          const next = filters.find(
            (filter) =>
              values.includes(filter.value) && filter.value !== props.filter
          )
          if (next) props.onFilterChange(next.value)
        }}
        variant='outline'
        spacing={2}
        className='flex-wrap'
      >
        {filters.map((filter) => (
          <ToggleGroupItem
            key={filter.value}
            value={filter.value}
            className='rounded-full px-4'
          >
            {filter.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Input
        type='search'
        value={props.search}
        onChange={(event) => props.onSearchChange(event.target.value)}
        placeholder={t('Search by prompt or model')}
        aria-label={t('Search by prompt or model')}
        className='w-full sm:ml-auto sm:w-60'
      />
    </div>
  )
}
