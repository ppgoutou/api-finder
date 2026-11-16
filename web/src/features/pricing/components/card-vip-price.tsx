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
import { Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CardVipPriceProps {
  /** VIP price, already formatted. */
  vipPrice: string
  /** Price before the VIP saving, already formatted; shown to VIP users. */
  standardPrice: string
  /** Billing unit after the price, such as "/s" or "/ request". */
  unit: string
  savingPercent: number
  /** VIP users see their saving; everyone else sees the VIP price. */
  isVip: boolean
}

/**
 * The VIP line under a model card's headline price. Standard users see what
 * the model costs as VIP; VIP users, whose headline already is the VIP
 * price, see the standard price it replaces.
 */
export function CardVipPrice(props: CardVipPriceProps) {
  const { t } = useTranslation()
  if (props.isVip) {
    return (
      <p className='col-span-full flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
        <span className='inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-800 dark:text-amber-300'>
          <Crown aria-hidden className='size-3' />
          {t('VIP price')}
        </span>
        <span className='sr-only'>{t('Standard price')}</span>
        <s className='text-muted-foreground font-mono tabular-nums'>
          {props.standardPrice}
        </s>
        <span className='text-muted-foreground'>
          {t('You save {{percent}}%', { percent: props.savingPercent })}
        </span>
      </p>
    )
  }
  return (
    <p className='col-span-full flex min-w-0 items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300'>
      <Crown aria-hidden className='size-3.5 shrink-0' />
      <span className='min-w-0'>
        {t('VIP price')}{' '}
        <span className='font-mono font-bold tabular-nums'>
          {props.vipPrice}
        </span>
        {props.unit}
      </span>
      <span className='ml-auto shrink-0 font-semibold'>
        {t('Save {{percent}}%', { percent: props.savingPercent })}
      </span>
    </p>
  )
}
