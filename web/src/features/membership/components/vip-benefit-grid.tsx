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
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { VIP_BENEFIT_ICONS } from '../lib/benefit-icons'
import { getVipBenefits } from '../lib/benefits'
import type { MembershipInfo } from '../types'

interface VipBenefitGridProps {
  info: MembershipInfo
  /** Show only the first few benefits, such as on the home page. */
  limit?: number
  /** Add what a standard member gets under each benefit, for the VIP page. */
  showStandard?: boolean
  className?: string
}

/** The VIP benefits as cards, each with an icon and an explanation. */
export function VipBenefitGrid(props: VipBenefitGridProps) {
  const { t } = useTranslation()
  const benefits = getVipBenefits(props.info, t).slice(0, props.limit)
  return (
    <ul
      className={cn(
        'grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3',
        props.className
      )}
    >
      {benefits.map((benefit) => (
        <li
          key={benefit.id}
          className='bg-card border-border/60 flex gap-3 rounded-2xl border p-4 shadow-sm sm:p-5'
        >
          <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300'>
            <HugeiconsIcon
              icon={VIP_BENEFIT_ICONS[benefit.id]}
              className='size-5'
              aria-hidden
            />
          </span>
          <div className='flex min-w-0 flex-1 flex-col'>
            <h3 className='font-semibold'>{benefit.title}</h3>
            <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
              {benefit.description}
            </p>
            {props.showStandard && (
              <div className='mt-auto pt-4'>
                <p className='text-muted-foreground border-border/60 flex gap-1.5 border-t border-dashed pt-3 text-xs'>
                  <span className='shrink-0'>{t('Standard members')}</span>
                  <span className='text-foreground/70'>{benefit.standard}</span>
                </p>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
