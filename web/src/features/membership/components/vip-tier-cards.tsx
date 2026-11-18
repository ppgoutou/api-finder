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
import {
  CrownIcon,
  MinusSignIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

import { getVipBenefits, getVipUpgradeRule } from '../lib/benefits'
import { getVipSavingPercent } from '../lib/progress'
import {
  VIP_DISPLAY_FONT,
  VIP_LIME_FILL,
  VIP_LIME_TEXT,
  VIP_NIGHT_PANEL,
} from '../lib/vip-style'
import type { MembershipInfo } from '../types'
import { VipActions } from './vip-actions'

interface VipTierCardsProps {
  info: MembershipInfo
  className?: string
}

/**
 * Standard and VIP as two plan cards on the dark VIP page, the VIP card lit
 * in lime. Both list the same benefits in the same order so rows line up.
 */
export function VipTierCards(props: VipTierCardsProps) {
  const { t } = useTranslation()
  const info = props.info
  const benefits = getVipBenefits(info, t).filter(
    (benefit) => benefit.id !== 'no-fee'
  )
  const rule = getVipUpgradeRule(info, t)
  const savingPercent = getVipSavingPercent(info)

  let standardAction = (
    <Button
      size='lg'
      className='h-11 w-full rounded-xl bg-white font-semibold text-[#111214] hover:bg-white/90'
      render={
        <Link
          to='/sign-up'
          onClick={() =>
            trackEvent('vip_cta_click', {
              source: 'vip-page-tiers',
              target: 'sign-up',
            })
          }
        />
      }
    >
      {t('Create a free account')}
    </Button>
  )
  if (info.signed_in) {
    standardAction = (
      <span className='flex h-11 w-full items-center justify-center rounded-xl border border-white/10 text-sm text-white/55'>
        {info.is_vip ? t('Included in VIP') : t('Your current tier')}
      </span>
    )
  }

  return (
    <div className={cn('grid gap-4 md:grid-cols-2', props.className)}>
      <article
        className={cn(
          'flex flex-col rounded-[32px] p-6 sm:p-8',
          VIP_NIGHT_PANEL
        )}
      >
        <h3 className='text-[34px] leading-none font-medium tracking-[-0.04em]'>
          {t('Standard')}
        </h3>
        <p className='mt-3 text-sm text-white/50'>
          {t('Every account after sign-up')}
        </p>
        <p className={cn('mt-8 text-4xl leading-none', VIP_DISPLAY_FONT)}>
          {t('No fee')}
        </p>
        <div className='mt-8'>{standardAction}</div>
        <ul className='mt-8 space-y-1 border-t border-white/10 pt-6'>
          {benefits.map((benefit) => (
            <li key={benefit.id} className='flex min-h-14 gap-3'>
              <HugeiconsIcon
                icon={MinusSignIcon}
                className='mt-0.5 size-4 shrink-0 text-white/25'
                aria-hidden
              />
              <div className='min-w-0'>
                <p className='text-xs text-white/40'>{benefit.label}</p>
                <p className='text-sm text-white/75'>{benefit.standard}</p>
              </div>
            </li>
          ))}
        </ul>
      </article>

      <article className='relative flex flex-col overflow-hidden rounded-[32px] border border-[#d1fe17]/45 bg-[#11130a] p-6 shadow-[0_0_90px_-25px_rgba(209,254,23,0.55)] sm:p-8'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(209,254,23,0.26),transparent_62%)]'
        />
        <div className='relative flex items-start justify-between gap-3'>
          <h3 className='flex items-center gap-2 text-[34px] leading-none font-medium tracking-[-0.04em]'>
            <HugeiconsIcon
              icon={CrownIcon}
              className={cn('size-7', VIP_LIME_TEXT)}
              aria-hidden
            />
            VIP
          </h3>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              VIP_LIME_FILL
            )}
          >
            {t('Recommended')}
          </span>
        </div>
        <p className='relative mt-3 text-sm text-white/65'>
          {rule ?? t('No membership fee')}
        </p>
        <p
          className={cn(
            'relative mt-8 text-4xl leading-none',
            VIP_DISPLAY_FONT,
            VIP_LIME_TEXT
          )}
        >
          {savingPercent > 0 ? `-${savingPercent}%` : t('No fee')}
        </p>
        <VipActions
          info={info}
          source='vip-page-tiers'
          night
          className='relative mt-8 [&>*]:w-full'
        />
        <ul className='relative mt-8 space-y-1 border-t border-[#d1fe17]/20 pt-6'>
          {benefits.map((benefit) => (
            <li key={benefit.id} className='flex min-h-14 gap-3'>
              <HugeiconsIcon
                icon={Tick02Icon}
                className={cn('mt-0.5 size-4 shrink-0', VIP_LIME_TEXT)}
                aria-hidden
              />
              <div className='min-w-0'>
                <p className='text-xs text-white/45'>{benefit.label}</p>
                <p className='text-sm font-medium text-white'>{benefit.vip}</p>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </div>
  )
}
