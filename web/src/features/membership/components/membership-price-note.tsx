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

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

import { getVipUpgradeRule } from '../lib/benefits'
import { getVipSavingPercent } from '../lib/progress'
import { VIP_FILL, VIP_SURFACE } from '../lib/vip-style'
import type { MembershipInfo } from '../types'
import { VipCompareButton } from './vip-compare-button'

interface MembershipPriceNoteProps {
  info?: MembershipInfo
}

/**
 * The violet VIP banner at the top of the pricing page: VIP users learn the
 * prices shown are theirs, everyone else how much VIP saves and how to get it.
 */
export function MembershipPriceNote(props: MembershipPriceNoteProps) {
  const { t } = useTranslation()
  const info = props.info
  if (!info?.enabled) return null
  const savingPercent = getVipSavingPercent(info)
  const rule = getVipUpgradeRule(info, t)

  let title = t('VIP members get lower prices and higher concurrency')
  if (savingPercent > 0) {
    title = t('VIP members save {{percent}}% on every model', {
      percent: savingPercent,
    })
  }
  let detail = rule
    ? t('{{rule}} to upgrade automatically. Redemption codes count too.', {
        rule,
      })
    : ''
  if (info.is_vip) {
    title = t('You are VIP')
    detail =
      savingPercent > 0
        ? t('The prices below already include your {{percent}}% saving.', {
            percent: savingPercent,
          })
        : t('Your VIP benefits apply to every request automatically.')
  }

  return (
    <section
      aria-label={t('VIP membership')}
      className={cn(
        'mx-auto mt-4 flex max-w-3xl flex-col gap-3 rounded-2xl border px-4 py-3 text-left sm:flex-row sm:items-center sm:px-5',
        VIP_SURFACE
      )}
    >
      <span className='bg-vip text-vip-foreground flex size-9 shrink-0 items-center justify-center rounded-full shadow-sm max-sm:hidden'>
        <HugeiconsIcon icon={CrownIcon} className='size-5' aria-hidden />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-vip text-sm font-semibold sm:text-base'>{title}</p>
        {detail && (
          <p className='text-muted-foreground mt-0.5 text-xs sm:text-sm'>
            {detail}
          </p>
        )}
      </div>
      <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2'>
        <VipCompareButton source='pricing-banner' className='text-sm' />
        <Button
          size='sm'
          className={cn('rounded-full px-3 font-semibold', VIP_FILL)}
          render={
            <Link
              to='/vip'
              onClick={() =>
                trackEvent('vip_cta_click', {
                  source: 'pricing-banner',
                  target: 'vip-page',
                })
              }
            />
          }
        >
          {t('Learn about VIP')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='size-3.5'
            aria-hidden
          />
        </Button>
      </div>
    </section>
  )
}
