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
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { VIP_SURFACE, VIP_TEXT } from '@/features/membership/lib/vip-style'
import { VIDEO_PRICE_FRACTION_DIGITS } from '@/features/pricing/lib/video-pricing'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { cn } from '@/lib/utils'

import type { StudioPrice } from '../hooks/use-studio-price'

const formatShortfall = (usd: number) =>
  formatBillingCurrencyFromUSD(usd, {
    digitsLarge: VIDEO_PRICE_FRACTION_DIGITS,
    digitsSmall: VIDEO_PRICE_FRACTION_DIGITS,
    abbreviate: false,
  })

interface StudioCostProps {
  price: StudioPrice | null
  /** What the fee covers, such as "≈ ¥0.78/s × 5s × 2", shown in the breakdown. */
  detail?: string
  /** Opens the top-up on this page; without it the link leads to the wallet. */
  onTopUp?: () => void
  /** How much the wallet lacks for the price in USD, or null when it is enough. */
  shortfallUSD: number | null
}

/**
 * Estimated fee next to the generate button: the total and the VIP price,
 * with how it adds up and any top-up gap behind the info button.
 */
export function StudioCost(props: StudioCostProps) {
  const { t } = useTranslation()
  if (!props.price) return null

  return (
    <div className='flex flex-col items-end gap-1'>
      <span className='flex items-center gap-1'>
        <span className='text-muted-foreground text-xs'>
          {t('Estimated fee')}
        </span>
        <span className='text-foreground text-base font-semibold tabular-nums'>
          {props.price.label}
        </span>
        {props.detail && (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  className='text-muted-foreground'
                  aria-label={t('Fee breakdown')}
                />
              }
            >
              <Info aria-hidden />
            </PopoverTrigger>
            <PopoverContent side='top' align='end' className='w-64 text-xs'>
              <div className='flex justify-between gap-3'>
                <span className='text-muted-foreground'>
                  {t('Fee breakdown')}
                </span>
                <span className='tabular-nums'>{props.detail}</span>
              </div>
              <div className='flex justify-between gap-3 border-t pt-2 font-medium'>
                <span>{t('Estimated fee')}</span>
                <span className='tabular-nums'>{props.price.label}</span>
              </div>
              {props.price.vipLabel && (
                <div className={cn('flex justify-between gap-3', VIP_TEXT)}>
                  <span>{t('VIP price')}</span>
                  <span className='tabular-nums'>{props.price.vipLabel}</span>
                </div>
              )}
              {props.shortfallUSD !== null && (
                <div className='text-destructive'>
                  {t('Insufficient balance, {{amount}} short.', {
                    amount: formatShortfall(props.shortfallUSD),
                  })}{' '}
                  {props.onTopUp ? (
                    <Button
                      type='button'
                      variant='link'
                      size='inline'
                      className='text-destructive font-medium underline underline-offset-2'
                      onClick={props.onTopUp}
                    >
                      {t('Go to top up')}
                    </Button>
                  ) : (
                    <Link
                      to='/wallet'
                      className='font-medium underline underline-offset-2'
                    >
                      {t('Go to top up')}
                    </Link>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
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
    </div>
  )
}

/**
 * The top-up gap pinned to the generate button's corner; place it inside a
 * relatively positioned wrapper around the button.
 */
export function StudioShortfallBadge(props: { shortfallUSD: number | null }) {
  const { t } = useTranslation()
  if (props.shortfallUSD === null) return null
  const amount = formatShortfall(props.shortfallUSD)

  return (
    <Badge
      role='alert'
      className='bg-destructive pointer-events-none absolute -top-2.5 -right-2 text-white tabular-nums shadow-sm'
    >
      <span aria-hidden>{t('{{amount}} short', { amount })}</span>
      <span className='sr-only'>
        {t('Insufficient balance, {{amount}} short.', { amount })}
      </span>
    </Badge>
  )
}
