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
import { Calculator01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import {
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
  getCurrencyDisplay,
} from '@/lib/currency'
import { useSystemConfigStore } from '@/stores/system-config-store'

interface VipSavingsCalculatorProps {
  /** VIP price as a share of the standard price, below 1. */
  priceRate: number
}

const DEFAULT_MONTHLY_SPEND = 1000

/** Turns a monthly spend into what VIP prices save per month and per year. */
export function VipSavingsCalculator(props: VipSavingsCalculatorProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [input, setInput] = useState(String(DEFAULT_MONTHLY_SPEND))
  const spend = Number(input)
  const valid = input.trim() !== '' && Number.isFinite(spend) && spend >= 0
  const monthly = valid ? spend * (1 - props.priceRate) : 0
  // The spend is typed in the currency the site shows prices in.
  useSystemConfigStore((state) => state.config.currency)
  const { meta } = getCurrencyDisplay()
  const options = { digitsLarge: 2, digitsSmall: 2, abbreviate: false }
  let symbol = '$'
  // Token display has no money symbol; amounts then read in billing dollars.
  let format = (amount: number) => formatLocalCurrencyAmount(amount, options)
  if (meta.kind !== 'tokens') {
    symbol = meta.symbol
    const exchangeRate = meta.exchangeRate > 0 ? meta.exchangeRate : 1
    format = (amount: number) =>
      formatCurrencyFromUSD(amount / exchangeRate, options)
  }

  return (
    <div className='bg-card border-border/60 rounded-2xl border p-5 shadow-sm sm:p-6'>
      <div className='flex items-center gap-2'>
        <HugeiconsIcon
          icon={Calculator01Icon}
          className='size-5 text-amber-600 dark:text-amber-300'
          aria-hidden
        />
        <h3 className='font-semibold'>{t('How much would VIP save you?')}</h3>
      </div>
      <label
        htmlFor={inputId}
        className='text-muted-foreground mt-4 block text-sm'
      >
        {t('Your monthly spend')} ({symbol})
      </label>
      <Input
        id={inputId}
        type='number'
        inputMode='decimal'
        min={0}
        step='any'
        value={input}
        onChange={(event) => setInput(event.target.value)}
        className='mt-1.5 max-w-xs'
      />
      <dl className='mt-5 grid grid-cols-2 gap-3'>
        <div className='rounded-xl bg-amber-500/10 p-3'>
          <dt className='text-muted-foreground text-xs'>
            {t('Saved per month')}
          </dt>
          <dd
            className='mt-1 text-xl font-bold text-amber-700 tabular-nums dark:text-amber-300'
            aria-live='polite'
          >
            {format(monthly)}
          </dd>
        </div>
        <div className='rounded-xl bg-amber-500/10 p-3'>
          <dt className='text-muted-foreground text-xs'>
            {t('Saved per year')}
          </dt>
          <dd className='mt-1 text-xl font-bold text-amber-700 tabular-nums dark:text-amber-300'>
            {format(monthly * 12)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
