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
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  VIP_DISPLAY_FONT,
  VIP_LIME_TEXT,
  VIP_NIGHT_PANEL,
} from '../lib/vip-style'

interface VipSavingsCalculatorProps {
  /** VIP price as a share of the standard price, below 1. */
  priceRate: number
}

const DEFAULT_MONTHLY_SPEND = 1000

/**
 * Turns a monthly spend into what VIP prices save per month and per year,
 * drawn for the dark VIP page.
 */
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
    <div className={cn('rounded-[32px] p-6 sm:p-8', VIP_NIGHT_PANEL)}>
      <div className='flex items-center gap-2'>
        <HugeiconsIcon
          icon={Calculator01Icon}
          className={cn('size-5', VIP_LIME_TEXT)}
          aria-hidden
        />
        <h3 className='text-lg font-semibold tracking-tight'>
          {t('How much would VIP save you?')}
        </h3>
      </div>
      <label htmlFor={inputId} className='mt-5 block text-sm text-white/50'>
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
        className='mt-2 h-12 rounded-xl border-white/10 bg-white/5 text-lg tabular-nums'
      />
      <dl className='mt-5 grid grid-cols-2 gap-3'>
        <div className='rounded-2xl border border-white/10 bg-black/30 p-4'>
          <dt className='text-xs text-white/45'>{t('Saved per month')}</dt>
          <dd
            className={cn(
              'mt-2 text-2xl leading-none tabular-nums',
              VIP_DISPLAY_FONT,
              VIP_LIME_TEXT
            )}
            aria-live='polite'
          >
            {format(monthly)}
          </dd>
        </div>
        <div className='rounded-2xl border border-white/10 bg-black/30 p-4'>
          <dt className='text-xs text-white/45'>{t('Saved per year')}</dt>
          <dd
            className={cn(
              'mt-2 text-2xl leading-none text-white tabular-nums',
              VIP_DISPLAY_FONT
            )}
          >
            {format(monthly * 12)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
