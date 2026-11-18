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
import { VIP_LIME_TEXT, VIP_NIGHT_PANEL } from '../lib/vip-style'
import type { MembershipInfo } from '../types'

interface VipBenefitGridProps {
  info: MembershipInfo
  /** Show only the first few benefits, such as on the home page. */
  limit?: number
  /** Glassy cards with lime icons, for the dark VIP page. */
  night?: boolean
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
          className={
            props.night
              ? cn('flex gap-4 rounded-3xl p-5 sm:p-6', VIP_NIGHT_PANEL)
              : 'bg-card border-border/60 flex gap-3 rounded-2xl border p-4 shadow-sm sm:p-5'
          }
        >
          <span
            className={
              props.night
                ? cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d1fe17]/10',
                    VIP_LIME_TEXT
                  )
                : 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }
          >
            <HugeiconsIcon
              icon={VIP_BENEFIT_ICONS[benefit.id]}
              className='size-5'
              aria-hidden
            />
          </span>
          <div className='min-w-0'>
            <h3 className='font-semibold'>{benefit.title}</h3>
            <p
              className={cn(
                'text-muted-foreground mt-1 text-sm leading-relaxed',
                props.night && 'text-white/50'
              )}
            >
              {benefit.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
