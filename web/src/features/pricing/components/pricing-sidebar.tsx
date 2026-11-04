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
import { ChevronDown, RotateCcw } from 'lucide-react'
import { memo, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import {
  FILTER_ALL,
  MODEL_TYPES,
  QUOTA_TYPES,
  getModelTypeLabels,
  getQuotaTypeLabels,
} from '../constants'
import { UNCATEGORIZED_CATEGORY } from '../lib/categories'
import { getModelQuotaType, getModelType } from '../lib/filters'
import type { PricingCategory, PricingModel } from '../types'

type FilterOption = {
  value: string
  label: string
  count?: number
  suffix?: string
  icon?: ReactNode
}

type FilterSectionProps = {
  title: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}

export interface PricingSidebarProps {
  quotaTypeFilter: string
  modelTypeFilter: string
  categoryFilter: string
  onQuotaTypeChange: (value: string) => void
  onModelTypeChange: (value: string) => void
  onCategoryChange: (value: string) => void
  categories: PricingCategory[]
  models: PricingModel[]
  hasActiveFilters: boolean
  onClearFilters: () => void
  className?: string
}

function FilterChip(props: {
  option: FilterOption
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type='button'
      variant={props.active ? 'secondary' : 'outline'}
      size='sm'
      onClick={props.onClick}
      aria-pressed={props.active}
      className='h-auto max-w-full gap-1.5 px-2 py-1 text-xs'
      title={props.option.label}
    >
      {props.option.icon && (
        <span className='shrink-0'>{props.option.icon}</span>
      )}
      <span className='truncate'>{props.option.label}</span>
      {(props.option.suffix || props.option.count != null) && (
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[12px]',
            props.active
              ? 'bg-background text-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {props.option.suffix ?? props.option.count}
        </span>
      )}
    </Button>
  )
}

function FilterSection(props: FilterSectionProps) {
  return (
    <Collapsible
      defaultOpen
      className='border-border/70 border-b pb-3 last:border-b-0'
    >
      <CollapsibleTrigger className='group flex w-full items-center justify-between py-2.5 text-left'>
        <span className='text-foreground text-sm font-semibold'>
          {props.title}
        </span>
        <ChevronDown className='text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180' />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='flex flex-wrap gap-1.5'>
          {props.options.map((option) => (
            <FilterChip
              key={option.value}
              option={option}
              active={props.value === option.value}
              onClick={() => props.onChange(option.value)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const PricingSidebar = memo(function PricingSidebar(
  props: PricingSidebarProps
) {
  const { t } = useTranslation()
  const counts = useMemo(() => {
    const quotas = { token: 0, request: 0, task: 0 }
    const modelTypes = { video: 0, image: 0 }
    for (const model of props.models) {
      const quotaType = getModelQuotaType(model)
      if (quotaType === QUOTA_TYPES.TASK) quotas.task++
      if (quotaType === QUOTA_TYPES.TOKEN) quotas.token++
      if (quotaType === QUOTA_TYPES.REQUEST) quotas.request++
      if (getModelType(model) === MODEL_TYPES.IMAGE) modelTypes.image++
      else modelTypes.video++
    }
    return { quotas, modelTypes }
  }, [props.models])
  const categoryOptions = useMemo((): FilterOption[] => {
    if (props.categories.length === 0) return []
    const visible = new Set(props.models.map((model) => model.model_name))
    const categorized = new Set<string>()
    const options: FilterOption[] = [
      { value: FILTER_ALL, label: t('All Categories'), count: visible.size },
    ]
    for (const category of props.categories) {
      let count = 0
      for (const name of category.models) {
        categorized.add(name)
        if (visible.has(name)) count++
      }
      if (count > 0) {
        options.push({ value: category.id, label: category.name, count })
      }
    }
    const rest = [...visible].filter((name) => !categorized.has(name)).length
    if (rest > 0) {
      options.push({
        value: UNCATEGORIZED_CATEGORY,
        label: t('Other models'),
        count: rest,
      })
    }
    return options
  }, [props.categories, props.models, t])
  const quotaTypeLabels = getQuotaTypeLabels(t)
  const modelTypeLabels = getModelTypeLabels(t)

  const quotaOptions: FilterOption[] = [
    {
      value: QUOTA_TYPES.ALL,
      label: quotaTypeLabels[QUOTA_TYPES.ALL],
      count: props.models.length,
    },
    {
      value: QUOTA_TYPES.TOKEN,
      label: quotaTypeLabels[QUOTA_TYPES.TOKEN],
      count: counts.quotas.token,
    },
    {
      value: QUOTA_TYPES.REQUEST,
      label: quotaTypeLabels[QUOTA_TYPES.REQUEST],
      count: counts.quotas.request,
    },
    {
      value: QUOTA_TYPES.TASK,
      label: quotaTypeLabels[QUOTA_TYPES.TASK],
      count: counts.quotas.task,
    },
  ]

  const modelTypeOptions: FilterOption[] = [
    {
      value: MODEL_TYPES.ALL,
      label: modelTypeLabels[MODEL_TYPES.ALL],
      count: props.models.length,
    },
    {
      value: MODEL_TYPES.VIDEO,
      label: modelTypeLabels[MODEL_TYPES.VIDEO],
      count: counts.modelTypes.video,
    },
    {
      value: MODEL_TYPES.IMAGE,
      label: modelTypeLabels[MODEL_TYPES.IMAGE],
      count: counts.modelTypes.image,
    },
  ]

  return (
    <aside className={cn('bg-card rounded-xl border p-3', props.className)}>
      <div className='mb-2.5 flex items-center justify-between gap-2'>
        <div>
          <h2 className='text-foreground text-sm font-bold'>{t('Filter')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('Refine models by category, pricing type, and model type.')}
          </p>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={props.onClearFilters}
          disabled={!props.hasActiveFilters}
          className='h-7 gap-1.5 px-2 text-xs'
        >
          <RotateCcw className='size-3.5' />
          {t('Reset')}
        </Button>
      </div>

      {props.hasActiveFilters && (
        <Badge variant='secondary' className='mb-3'>
          {t('Filters active')}
        </Badge>
      )}

      <div className='space-y-1'>
        {categoryOptions.length > 0 && (
          <FilterSection
            title={t('Categories')}
            value={props.categoryFilter}
            options={categoryOptions}
            onChange={props.onCategoryChange}
          />
        )}
        <FilterSection
          title={t('Pricing Type')}
          value={props.quotaTypeFilter}
          options={quotaOptions}
          onChange={props.onQuotaTypeChange}
        />
        <FilterSection
          title={t('Model Type')}
          value={props.modelTypeFilter}
          options={modelTypeOptions}
          onChange={props.onModelTypeChange}
        />
      </div>
    </aside>
  )
})
