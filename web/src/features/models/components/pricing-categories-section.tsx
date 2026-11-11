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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getEnabledModels } from '@/features/channels/api'
import type { PricingCategory } from '@/features/pricing/types'
import { updateSystemOption } from '@/features/system-settings/api'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'
import {
  ADMIN_PREVIEW_LANGUAGE,
  selectLanguageBlock,
} from '@/lib/language-blocks'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  moveOneStep,
  newPricingCategoryId,
  parsePricingCategories,
  PRICING_CATEGORIES_OPTION_KEY,
  pricingCategoryOwners,
  selectedModelBadges,
  type PricingCategoryFormValues,
} from '../lib/pricing-categories'
import { PricingCategoryDialog } from './dialogs/pricing-category-dialog'

const VISIBLE_MODEL_BADGES = 12

export function PricingCategoriesSection() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const options = useSystemOptions()
  const enabledModels = useQuery({
    queryKey: ['enabled-models'],
    queryFn: async () => requireServerSuccess(await getEnabledModels()),
  })
  const [editing, setEditing] = useState<PricingCategory | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<PricingCategory | null>(null)

  const categories = useMemo(
    () =>
      parsePricingCategories(
        options.data?.data.find(
          (option) => option.key === PRICING_CATEGORIES_OPTION_KEY
        )?.value
      ),
    [options.data]
  )

  const takenModels = useMemo(
    () => pricingCategoryOwners(categories, editing?.id),
    [categories, editing]
  )

  const save = useMutation({
    mutationFn: async (next: PricingCategory[]) => {
      const response = await updateSystemOption({
        key: PRICING_CATEGORIES_OPTION_KEY,
        value: next.length > 0 ? JSON.stringify(next) : '',
      })
      if (!response.success) {
        throw createServerError(response, t('Failed to save categories'))
      }
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['system-options'] }),
        client.invalidateQueries({ queryKey: ['pricing'] }),
      ])
      toast.success(t('Categories saved'))
    },
  })

  const submitCategory = (values: PricingCategoryFormValues) => {
    const category: PricingCategory = {
      id: editing?.id ?? newPricingCategoryId(categories),
      name: values.name.trim(),
      description: values.description.trim(),
      models: values.models,
      badges: selectedModelBadges(values.models, values.badges),
      ...(values.officialPriceExpr.trim()
        ? { official_price_expr: values.officialPriceExpr.trim() }
        : {}),
    }
    const next = editing
      ? categories.map((item) => (item.id === editing.id ? category : item))
      : [...categories, category]
    save.mutate(next, { onSuccess: () => setDialogOpen(false) })
  }

  const openDialog = (category: PricingCategory | null) => {
    setEditing(category)
    setDialogOpen(true)
  }

  if (options.isLoading) return <LoadingState />
  if (options.isError) {
    return <ErrorState onRetry={() => void options.refetch()} />
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-4 overflow-y-auto'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground max-w-2xl text-sm'>
          {t(
            'Categories group models on the pricing page in the order shown here. Models outside every category appear last under Other models.'
          )}
        </p>
        <Button size='sm' onClick={() => openDialog(null)}>
          <Plus className='size-4' />
          {t('Add category')}
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          bordered
          title={t('No categories yet')}
          description={t(
            'The pricing page lists every model without grouping until a category is added.'
          )}
        />
      ) : (
        <ol className='space-y-3'>
          {categories.map((category, index) => (
            <li key={category.id} className='bg-card rounded-xl border p-4'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0 space-y-1'>
                  <div className='flex flex-wrap items-baseline gap-x-3'>
                    <h3 className='text-foreground font-semibold'>
                      {category.name}
                    </h3>
                    <span className='text-muted-foreground text-xs'>
                      {t('{{count}} models', {
                        count: category.models.length,
                      })}
                    </span>
                  </div>
                  {category.description && (
                    <p className='text-muted-foreground text-sm'>
                      {selectLanguageBlock(
                        category.description,
                        ADMIN_PREVIEW_LANGUAGE
                      )}
                    </p>
                  )}
                </div>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Move up')}
                    disabled={index === 0 || save.isPending}
                    onClick={() =>
                      save.mutate(moveOneStep(categories, index, -1))
                    }
                  >
                    <ArrowUp className='size-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Move down')}
                    disabled={index === categories.length - 1 || save.isPending}
                    onClick={() =>
                      save.mutate(moveOneStep(categories, index, 1))
                    }
                  >
                    <ArrowDown className='size-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Edit')}
                    disabled={save.isPending}
                    onClick={() => openDialog(category)}
                  >
                    <Pencil className='size-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Delete')}
                    disabled={save.isPending}
                    onClick={() => setDeleting(category)}
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </div>
              </div>
              {category.models.length > 0 && (
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {category.models
                    .slice(0, VISIBLE_MODEL_BADGES)
                    .map((name) => (
                      <Badge key={name} variant='secondary'>
                        {name}
                      </Badge>
                    ))}
                  {category.models.length > VISIBLE_MODEL_BADGES && (
                    <Badge variant='outline'>
                      +{category.models.length - VISIBLE_MODEL_BADGES}
                    </Badge>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <PricingCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        enabledModels={enabledModels.data?.data ?? []}
        takenModels={takenModels}
        isSaving={save.isPending}
        onSubmit={submitCategory}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete category')}
        desc={t(
          'Delete category {{name}}? Its models move to Other models on the pricing page.',
          { name: deleting?.name ?? '' }
        )}
        destructive
        confirmText={t('Delete')}
        isLoading={save.isPending}
        handleConfirm={() => {
          if (!deleting) return
          save.mutate(
            categories.filter((item) => item.id !== deleting.id),
            { onSuccess: () => setDeleting(null) }
          )
        }}
      />
    </div>
  )
}
