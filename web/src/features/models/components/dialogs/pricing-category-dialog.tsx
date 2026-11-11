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
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageBlocksTextarea } from '@/components/language-blocks-textarea'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCanEditModelPricing } from '@/features/model-pricing/api'
import {
  modelBadgeLabel,
  PRICING_MODEL_BADGES,
} from '@/features/pricing/lib/categories'
import type { PricingCategory } from '@/features/pricing/types'
import { LANGUAGE_BLOCKS_HINT } from '@/lib/language-blocks'
import { cn } from '@/lib/utils'

import {
  PRICING_CATEGORY_NAME_MAX,
  moveOneStep,
  pricingCategoryFormSchema,
  type PricingCategoryFormValues,
  PRESSED_BADGE_CLASSES,
} from '../../lib/pricing-categories'
import { CategoryOfficialPrice } from './category-official-price'

export function PricingCategoryDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: PricingCategory | null
  /** Models enabled on channels, offered for selection. */
  enabledModels: string[]
  /** Models held by other categories, which this one cannot take. */
  takenModels: Map<string, string>
  isSaving: boolean
  onSubmit: (values: PricingCategoryFormValues) => void
}) {
  const { t } = useTranslation()
  const form = useForm<PricingCategoryFormValues>({
    resolver: zodResolver(pricingCategoryFormSchema),
    defaultValues: {
      name: '',
      description: '',
      models: [],
      badges: {},
      officialPriceExpr: '',
      officialPrice: null,
    },
  })
  const canEditPricing = useCanEditModelPricing()
  const [officialBlocked, setOfficialBlocked] = useState(false)

  useEffect(() => {
    if (!props.open) return
    form.reset({
      name: props.category?.name ?? '',
      description: props.category?.description ?? '',
      models: props.category?.models ?? [],
      badges: props.category?.badges ?? {},
      officialPriceExpr: props.category?.official_price_expr ?? '',
      officialPrice: props.category?.official_price ?? null,
    })
  }, [props.open, props.category, form])

  // Saved models that are no longer enabled stay listed so they can be removed.
  const options = useMemo(() => {
    const names = new Set([
      ...props.enabledModels,
      ...(props.category?.models ?? []),
    ])
    return [...names]
      .filter((name) => !props.takenModels.has(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        label: name,
        value: name,
        hint: props.enabledModels.includes(name)
          ? undefined
          : t('Not enabled on any channel'),
      }))
  }, [props.enabledModels, props.category, props.takenModels, t])
  const selectedModels = form.watch('models')

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.isSaving) props.onOpenChange(open)
      }}
      title={props.category ? t('Edit category') : t('Add category')}
      description={t(
        'Each model can belong to one category. Models already used by another category are not listed.'
      )}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={props.isSaving}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='pricing-category-form'
            disabled={props.isSaving || officialBlocked}
          >
            {props.isSaving ? t('Saving...') : t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='pricing-category-form'
          className='space-y-4'
          onSubmit={form.handleSubmit(props.onSubmit)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Category name')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    maxLength={PRICING_CATEGORY_NAME_MAX}
                    placeholder='Seedance 2.0'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Description')}</FormLabel>
                <FormControl>
                  <LanguageBlocksTextarea {...field} rows={3} />
                </FormControl>
                <FormDescription>{t(LANGUAGE_BLOCKS_HINT)}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='models'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Models')}</FormLabel>
                <FormControl>
                  <MultiSelect
                    options={options}
                    selected={field.value}
                    onChange={field.onChange}
                    placeholder={t('Select models')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {selectedModels.length > 0 && (
            <FormField
              control={form.control}
              name='badges'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Order and badges')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Models are shown on the pricing page in this order. Badges appear on their cards.'
                    )}
                  </FormDescription>
                  <ol className='divide-y rounded-lg border'>
                    {selectedModels.map((name, index) => (
                      <li
                        key={name}
                        className='flex flex-wrap items-center gap-2 px-3 py-2'
                      >
                        <span className='text-muted-foreground w-5 shrink-0 text-xs tabular-nums'>
                          {index + 1}
                        </span>
                        <span
                          className='min-w-0 flex-1 truncate font-mono text-sm'
                          title={name}
                        >
                          {name}
                        </span>
                        <ToggleGroup
                          multiple
                          variant='outline'
                          size='sm'
                          spacing={1}
                          aria-label={t('Badges for {{name}}', { name })}
                          value={field.value[name] ?? []}
                          onValueChange={(value) =>
                            field.onChange({
                              ...field.value,
                              [name]: PRICING_MODEL_BADGES.filter((badge) =>
                                value.includes(badge)
                              ),
                            })
                          }
                        >
                          {PRICING_MODEL_BADGES.map((badge) => (
                            <ToggleGroupItem
                              key={badge}
                              value={badge}
                              className={cn(
                                'h-7 px-2 text-xs font-semibold',
                                PRESSED_BADGE_CLASSES[badge]
                              )}
                            >
                              <Check
                                aria-hidden
                                className='hidden size-3 group-aria-pressed/toggle:block'
                              />
                              {modelBadgeLabel(badge, t)}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                        <div className='flex shrink-0 items-center'>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('Move {{name}} up', { name })}
                            disabled={index === 0}
                            onClick={() =>
                              form.setValue(
                                'models',
                                moveOneStep(selectedModels, index, -1)
                              )
                            }
                          >
                            <ArrowUp className='size-4' />
                          </Button>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('Move {{name}} down', { name })}
                            disabled={index === selectedModels.length - 1}
                            onClick={() =>
                              form.setValue(
                                'models',
                                moveOneStep(selectedModels, index, 1)
                              )
                            }
                          >
                            <ArrowDown className='size-4' />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </FormItem>
              )}
            />
          )}
          {canEditPricing && (
            <FormField
              control={form.control}
              name='officialPrice'
              render={({ field }) => (
                <FormItem>
                  <CategoryOfficialPrice
                    models={selectedModels}
                    value={field.value}
                    legacyExpression={form.watch('officialPriceExpr')}
                    onChange={(table) => {
                      field.onChange(table)
                      form.setValue('officialPriceExpr', '')
                    }}
                    onBlockedChange={setOfficialBlocked}
                    disabled={props.isSaving}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
    </Dialog>
  )
}
