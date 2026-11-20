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
import { ArrowRight01Icon, CrownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { VIP_SURFACE, VIP_TEXT } from '@/features/membership/lib/vip-style'
import { VIDEO_PRICE_FRACTION_DIGITS } from '@/features/pricing/lib/video-pricing'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { cn } from '@/lib/utils'

import type { StudioPrice } from '../hooks/use-studio-price'

interface StudioCostProps {
  price: StudioPrice | null
  /** How much the wallet lacks for the price in USD, or null when it is enough. */
  shortfallUSD: number | null
}

/** Estimated fee next to the generate button, with the top-up gap when the wallet falls short. */
export function StudioCost(props: StudioCostProps) {
  const { t } = useTranslation()
  if (!props.price) return null

  return (
    <div className='flex flex-col items-end gap-1'>
      <span className='flex items-baseline gap-1.5'>
        <span className='text-muted-foreground text-xs'>
          {t('Estimated fee')}
        </span>
        <span className='text-foreground text-base font-semibold tabular-nums'>
          {props.price.label}
        </span>
      </span>
      {props.price.vipLabel && (
        <Link
          to='/wallet'
          aria-label={`${t('VIP price')} ${props.price.vipLabel}, ${t('Top up to upgrade')}`}
          title={t('Top up to upgrade')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium hover:brightness-95',
            VIP_SURFACE,
            VIP_TEXT
          )}
        >
          <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
          {t('VIP price')}
          <span className='font-semibold tabular-nums'>
            {props.price.vipLabel}
          </span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='size-3'
            aria-hidden
          />
        </Link>
      )}
      {props.shortfallUSD !== null && (
        <span role='alert' className='text-destructive text-xs'>
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
