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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  getPromoModelPrices,
  type PromoModelPrice,
} from '@/features/home/lib/promo-prices'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingModel } from '@/features/pricing/types'
import { getLobeIcon } from '@/lib/lobe-icon'

export type PromoModelSelection = {
  model: PricingModel
  /** Empty when the model's price can't be read automatically. */
  price: PromoModelPrice | null
  /** Whether the card should keep following this price. */
  autoPrice: boolean
}

type PromoModelPickerProps = {
  /** The model name stored on the card, selected again when it still exists. */
  currentName: string
  /** The price option stored on the card. */
  currentOption: string
  /** Whether the card follows the model's price. */
  autoPrice: boolean
  onSelect: (selection: PromoModelSelection) => void
}

/** Picks a listed model and copies its details into the card's fields. */
export function PromoModelPicker(props: PromoModelPickerProps) {
  const { t } = useTranslation()
  const pricing = usePricingData()
  const [picked, setPicked] = useState(props.currentName)
  const [option, setOption] = useState(props.currentOption)

  const options = useMemo(
    () =>
      pricing.models
        .filter((model) => !model.unavailable)
        .map((model) => ({
          value: model.model_name,
          label: model.model_name,
          icon: getLobeIcon(model.icon || model.vendor_icon || '', 18),
        })),
    [pricing.models]
  )
  const model = pricing.models.find((item) => item.model_name === picked)
  const prices = model
    ? getPromoModelPrices(model, {
        priceRate: pricing.priceRate,
        usdExchangeRate: pricing.usdExchangeRate,
        t,
      })
    : []

  const apply = (next: PricingModel, nextOption: string, auto: boolean) => {
    const nextPrices = getPromoModelPrices(next, {
      priceRate: pricing.priceRate,
      usdExchangeRate: pricing.usdExchangeRate,
      t,
    })
    const price =
      nextPrices.find((item) => item.option === nextOption) ??
      nextPrices[0] ??
      null
    props.onSelect({ model: next, price, autoPrice: auto && price !== null })
  }

  return (
    <div className='flex flex-col gap-2 rounded-md border border-dashed p-3'>
      <Label>{t('Choose from existing models')}</Label>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-56 flex-1'>
          <Combobox
            aria-label={t('Choose from existing models')}
            options={options}
            value={model ? picked : ''}
            className='w-full'
            placeholder={t('Search models')}
            onValueChange={(name) => {
              if (!name) return
              const next = pricing.models.find(
                (item) => item.model_name === name
              )
              if (!next) return
              setPicked(name)
              setOption('')
              apply(next, '', true)
            }}
          />
        </div>
        {prices.length > 1 && model && (
          <NativeSelect
            aria-label={t('Price option')}
            value={option || prices[0].option}
            onChange={(event) => {
              setOption(event.target.value)
              apply(model, event.target.value, props.autoPrice)
            }}
          >
            {prices.map((price) => (
              <NativeSelectOption key={price.option} value={price.option}>
                {price.option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {model && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => apply(model, option, props.autoPrice)}
          >
            <RefreshCw data-icon='inline-start' />
            {t('Sync again')}
          </Button>
        )}
      </div>
      <Label className='flex items-center gap-2 font-normal'>
        <Switch
          checked={props.autoPrice}
          disabled={!model || prices.length === 0}
          onCheckedChange={(checked) => {
            if (model) apply(model, option, checked)
          }}
        />
        {t('Keep price in sync with the model')}
      </Label>
      <p className='text-muted-foreground text-xs'>
        {model && prices.length === 0
          ? t("This model's price can't be read automatically. Enter it below.")
          : t(
              'Copies the current name, description and logo. With automatic pricing on, visitors always see the current selling price; turn it off to enter your own price.'
            )}
      </p>
    </div>
  )
}
