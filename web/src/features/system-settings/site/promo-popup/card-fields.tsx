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
import { Plus, Trash2 } from 'lucide-react'
import {
  type Control,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { LobeIconField } from '@/components/lobe-icon-field'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  PROMO_DEFAULT_HREF,
  PROMO_POPUP_MAX_DEALS,
  PROMO_POPUP_MAX_TIERS,
} from '@/features/home/lib/promo-popup'

import { ShowcaseTextField } from '../home-showcase/item-fields'
import { PromoModelPicker, type PromoModelSelection } from './model-picker'
import { getPromoModelDescriptions } from './model-snapshot'
import type { PromoPopupFormValues } from './schema'

type PromoCardFieldsProps = {
  control: Control<PromoPopupFormValues>
  index: number
}

const SET_OPTIONS = { shouldDirty: true, shouldValidate: true }

function LogoField(props: {
  control: Control<PromoPopupFormValues>
  name: `cards.${number}.icon` | `cards.${number}.deals.${number}.icon`
}) {
  const { t } = useTranslation()
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('Logo')}</FormLabel>
          <FormControl>
            <LobeIconField value={field.value} onChange={field.onChange} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function ModelFields(props: PromoCardFieldsProps) {
  const { t } = useTranslation()
  const form = useFormContext<PromoPopupFormValues>()
  const card = `cards.${props.index}` as const
  const applyModel = (selection: PromoModelSelection) => {
    const descriptions = getPromoModelDescriptions(selection.model)
    const model = selection.model
    form.setValue(`${card}.modelName`, model.model_name, SET_OPTIONS)
    form.setValue(
      `${card}.icon`,
      model.icon || model.vendor_icon || '',
      SET_OPTIONS
    )
    form.setValue(`${card}.description`, descriptions.description, SET_OPTIONS)
    form.setValue(
      `${card}.descriptionZh`,
      descriptions.descriptionZh,
      SET_OPTIONS
    )
    form.setValue(
      `${card}.salePrice`,
      selection.price?.salePrice ?? '',
      SET_OPTIONS
    )
    form.setValue(
      `${card}.originalPrice`,
      selection.price?.originalPrice ?? '',
      SET_OPTIONS
    )
    form.setValue(`${card}.unit`, selection.price?.unit ?? '', SET_OPTIONS)
  }
  return (
    <>
      <PromoModelPicker
        currentName={form.getValues(`${card}.modelName`)}
        onSelect={applyModel}
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <ShowcaseTextField
          control={props.control}
          name={`${card}.modelName`}
          label={t('Model name')}
        />
        <ShowcaseTextField
          control={props.control}
          name={`${card}.unit`}
          label={t('Price unit')}
        />
        <ShowcaseTextField
          control={props.control}
          name={`${card}.salePrice`}
          label={t('Sale price')}
        />
        <ShowcaseTextField
          control={props.control}
          name={`${card}.originalPrice`}
          label={t('Original price')}
        />
      </div>
      <LogoField control={props.control} name={`${card}.icon`} />
    </>
  )
}

function TierFields(props: PromoCardFieldsProps) {
  const { t } = useTranslation()
  const tiers = useFieldArray({
    control: props.control,
    name: `cards.${props.index}.tiers`,
  })
  return (
    <div className='flex flex-col gap-3'>
      {tiers.fields.map((tier, tierIndex) => (
        <div key={tier.id} className='flex items-start gap-2'>
          <div className='grid flex-1 gap-3 sm:grid-cols-2'>
            <ShowcaseTextField
              control={props.control}
              name={`cards.${props.index}.tiers.${tierIndex}.pay`}
              label={t('Top-up amount')}
              placeholder='¥100'
            />
            <ShowcaseTextField
              control={props.control}
              name={`cards.${props.index}.tiers.${tierIndex}.bonus`}
              label={t('Bonus')}
              placeholder='¥10'
            />
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='mt-6'
            aria-label={t('Remove tier {{number}}', { number: tierIndex + 1 })}
            onClick={() => tiers.remove(tierIndex)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='self-start'
        disabled={tiers.fields.length >= PROMO_POPUP_MAX_TIERS}
        onClick={() => tiers.append({ pay: '', bonus: '' })}
      >
        <Plus data-icon='inline-start' />
        {t('Add tier')}
      </Button>
    </div>
  )
}

function DealFields(props: PromoCardFieldsProps) {
  const { t } = useTranslation()
  const form = useFormContext<PromoPopupFormValues>()
  const deals = useFieldArray({
    control: props.control,
    name: `cards.${props.index}.deals`,
  })
  return (
    <div className='flex flex-col gap-4'>
      {deals.fields.map((deal, dealIndex) => {
        const path = `cards.${props.index}.deals.${dealIndex}` as const
        return (
          <div key={deal.id} className='flex flex-col gap-3 border-b pb-4'>
            <div className='flex items-start gap-2'>
              <div className='min-w-0 flex-1'>
                <PromoModelPicker
                  currentName={form.getValues(`${path}.modelName`)}
                  onSelect={(selection) => {
                    const model = selection.model
                    form.setValue(
                      `${path}.modelName`,
                      model.model_name,
                      SET_OPTIONS
                    )
                    form.setValue(
                      `${path}.icon`,
                      model.icon || model.vendor_icon || '',
                      SET_OPTIONS
                    )
                    form.setValue(
                      `${path}.salePrice`,
                      selection.price?.salePrice ?? '',
                      SET_OPTIONS
                    )
                    form.setValue(
                      `${path}.originalPrice`,
                      selection.price?.originalPrice ?? '',
                      SET_OPTIONS
                    )
                    form.setValue(
                      `${path}.unit`,
                      selection.price?.unit ?? '',
                      SET_OPTIONS
                    )
                  }}
                />
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t('Remove model {{number}}', {
                  number: dealIndex + 1,
                })}
                onClick={() => deals.remove(dealIndex)}
              >
                <Trash2 />
              </Button>
            </div>
            <div className='grid gap-3 sm:grid-cols-4'>
              <ShowcaseTextField
                control={props.control}
                name={`${path}.modelName`}
                label={t('Model name')}
              />
              <ShowcaseTextField
                control={props.control}
                name={`${path}.salePrice`}
                label={t('Sale price')}
              />
              <ShowcaseTextField
                control={props.control}
                name={`${path}.originalPrice`}
                label={t('Original price')}
              />
              <ShowcaseTextField
                control={props.control}
                name={`${path}.unit`}
                label={t('Price unit')}
              />
            </div>
            <LogoField control={props.control} name={`${path}.icon`} />
          </div>
        )
      })}
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='self-start'
        disabled={deals.fields.length >= PROMO_POPUP_MAX_DEALS}
        onClick={() =>
          deals.append({
            modelName: '',
            salePrice: '',
            originalPrice: '',
            unit: '',
            icon: '',
          })
        }
      >
        <Plus data-icon='inline-start' />
        {t('Add model')}
      </Button>
    </div>
  )
}

/** The editor of one popup card; the fields follow the card's kind. */
export function PromoCardFields(props: PromoCardFieldsProps) {
  const { t } = useTranslation()
  const kind = useWatch({
    control: props.control,
    name: `cards.${props.index}.kind`,
  })
  return (
    <>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={props.control}
          name={`cards.${props.index}.kind`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Card type')}</FormLabel>
              <FormControl>
                <NativeSelect {...field} className='w-full'>
                  <NativeSelectOption value='model'>
                    {t('Single model price')}
                  </NativeSelectOption>
                  <NativeSelectOption value='recharge'>
                    {t('Top-up offer')}
                  </NativeSelectOption>
                  <NativeSelectOption value='list'>
                    {t('List of model prices')}
                  </NativeSelectOption>
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={props.control}
          name={`cards.${props.index}.endsAt`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Last day (optional)')}</FormLabel>
              <FormControl>
                <Input type='date' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {kind === 'model' && <ModelFields {...props} />}
      {kind === 'recharge' && <TierFields {...props} />}
      {kind === 'list' && <DealFields {...props} />}

      <div className='grid gap-4 sm:grid-cols-2'>
        <ShowcaseTextField
          control={props.control}
          name={`cards.${props.index}.title`}
          label={t('Title')}
        />
        <ShowcaseTextField
          control={props.control}
          name={`cards.${props.index}.titleZh`}
          label={t('Title (Chinese)')}
        />
        <ShowcaseTextField
          control={props.control}
          name={`cards.${props.index}.description`}
          label={t('Description')}
          multiline
        />
        <ShowcaseTextField
          control={props.control}
          name={`cards.${props.index}.descriptionZh`}
          label={t('Description (Chinese)')}
          multiline
        />
      </div>
      <ShowcaseTextField
        control={props.control}
        name={`cards.${props.index}.href`}
        label={t('Link (optional)')}
        placeholder={PROMO_DEFAULT_HREF[kind ?? 'model']}
      />
    </>
  )
}
