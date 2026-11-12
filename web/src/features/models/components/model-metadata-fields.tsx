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
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { LanguageBlocksTextarea } from '@/components/language-blocks-textarea'
import { LobeIconField } from '@/components/lobe-icon-field'
import { TagInput } from '@/components/tag-input'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { LANGUAGE_BLOCKS_HINT } from '@/lib/language-blocks'

import type { ModelFormInput, ModelFormValues } from '../lib/model-form'
import type { Vendor } from '../types'

const MAX_TAG_SUGGESTIONS = 16

/**
 * Description, icon, vendor and tag fields shared by the model drawer and the
 * onboarding workbench. Must render inside a react-hook-form `Form`.
 */
export function ModelMetadataFields(props: {
  form: UseFormReturn<ModelFormInput, unknown, ModelFormValues>
  vendors: Vendor[]
  /** Remounts the icon picker when the edited model changes. */
  iconKey: string
  /** Existing tags offered as one-click additions. */
  tagSuggestions?: string[]
  descriptionRows?: number
  /** Shown beside the description label. */
  descriptionAction?: ReactNode
  /** False leaves out the vendor and tag fields; their stored values stay. */
  showVendorAndTags?: boolean
}) {
  const { t } = useTranslation()
  const selectedVendor = props.vendors.find(
    (vendor) => vendor.id === props.form.watch('vendor_id')
  )
  const tags = props.form.watch('tags') ?? []
  const suggestions = (props.tagSuggestions ?? [])
    .filter((tag) => !tags.includes(tag))
    .slice(0, MAX_TAG_SUGGESTIONS)

  return (
    <>
      <FormField
        control={props.form.control}
        name='display_name'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Display name')}</FormLabel>
            <FormControl>
              <Input
                placeholder={props.form.watch('model_name')}
                maxLength={128}
                {...field}
              />
            </FormControl>
            <FormDescription>
              {t(
                'Shown to visitors instead of the model ID. API calls still use the model ID. Leave empty to show the model ID.'
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={props.form.control}
        name='description'
        render={({ field }) => (
          <FormItem>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <FormLabel>{t('Description')}</FormLabel>
              {props.descriptionAction}
            </div>
            <FormControl>
              <LanguageBlocksTextarea
                placeholder={t('Describe this model...')}
                rows={props.descriptionRows ?? 3}
                {...field}
              />
            </FormControl>
            <FormDescription>{t(LANGUAGE_BLOCKS_HINT)}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={props.form.control}
        name='icon'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Icon')}</FormLabel>
            <FormControl>
              <LobeIconField
                key={props.iconKey}
                value={field.value ?? ''}
                onChange={field.onChange}
                allowInheritance
                inheritedIcon={selectedVendor?.icon}
                inheritedName={selectedVendor?.name}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {props.showVendorAndTags !== false && (
        <>
          <FormField
            control={props.form.control}
            name='vendor_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Vendor')}</FormLabel>
                <FormControl>
                  <Combobox
                    options={props.vendors.map((vendor) => ({
                      value: String(vendor.id),
                      label: vendor.name,
                    }))}
                    onValueChange={(value) =>
                      field.onChange(value ? Number.parseInt(value) : undefined)
                    }
                    value={field.value ? String(field.value) : null}
                    className='w-full'
                    placeholder={t('Select vendor')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={props.form.control}
            name='tags'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Tags')}</FormLabel>
                <FormControl>
                  <TagInput
                    value={field.value || []}
                    onChange={field.onChange}
                    placeholder={t('Add tags...')}
                  />
                </FormControl>
                <FormDescription>
                  {t('Press Enter or comma to add tags')}
                </FormDescription>
                {suggestions.length > 0 && (
                  <div
                    className='flex flex-wrap gap-1.5'
                    role='group'
                    aria-label={t('Existing tags')}
                  >
                    {suggestions.map((tag) => (
                      <Button
                        key={tag}
                        type='button'
                        variant='outline'
                        size='xs'
                        onClick={() =>
                          field.onChange([...(field.value ?? []), tag])
                        }
                      >
                        <Plus aria-hidden className='size-3' />
                        {tag}
                      </Button>
                    ))}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </>
  )
}
