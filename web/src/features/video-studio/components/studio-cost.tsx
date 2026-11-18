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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { VipCompareButton } from '@/features/membership'
import { VIDEO_PRICE_FRACTION_DIGITS } from '@/features/pricing/lib/video-pricing'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import type { StudioPrice } from '../hooks/use-studio-price'

interface StudioCostProps {
  price: StudioPrice | null
  /** How much the wallet lacks for the price in USD, or null when it is enough. */
  shortfallUSD: number | null
}

/** Estimated cost next to the generate button, with the top-up gap when the wallet falls short. */
export function StudioCost(props: StudioCostProps) {
  const { t } = useTranslation()
  if (!props.price) return null

  return (
    <div className='flex flex-col items-end gap-0.5 text-xs'>
      <span className='text-muted-foreground'>
        {t('Estimated cost')}{' '}
        <span className='text-foreground font-semibold'>
          {props.price.label}
        </span>
      </span>
      {props.price.vipLabel && (
        <span className='text-amber-700 dark:text-amber-300'>
          {t('VIP price {{price}}', { price: props.price.vipLabel })}
          {' · '}
          <VipCompareButton
            source='studio-cost'
            label={t('Become VIP')}
            standardOnly
          />
        </span>
      )}
      {props.shortfallUSD !== null && (
        <span role='alert' className='text-destructive'>
          {t('Insufficient balance, {{amount}} short.', {
            amount: formatBillingCurrencyFromUSD(props.shortfallUSD, {
              digitsLarge: VIDEO_PRICE_FRACTION_DIGITS,
              digitsSmall: VIDEO_PRICE_FRACTION_DIGITS,
              abbreviate: false,
            }),
          })}{' '}
          <Link
            to='/wallet'
            className='font-medium underline underline-offset-2'
          >
            {t('Go to top up')}
          </Link>
        </span>
      )}
    </div>
  )
}
