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

import { VIP_BENEFIT_ICONS } from '../lib/benefit-icons'
import { getVipUpgradeRule, type VipBenefitId } from '../lib/benefits'
import { getVipSavingPercent } from '../lib/progress'
import { VIP_DISPLAY_FONT } from '../lib/vip-style'
import type { MembershipInfo } from '../types'
import { VipCompareButton } from './vip-compare-button'

interface MembershipPriceCardProps {
  info?: MembershipInfo
  className?: string
}

interface CardBenefit {
  id: VipBenefitId
  title: string
  text: string
  /** The short figure on the right, such as "-8%" or "10×". */
  stat: string
}

/**
 * The VIP card beside the model plaza title: what VIP saves, how much more it
 * runs at once and which lines it uses. VIP users see the same card as a
 * reminder that the prices below are already theirs.
 */
export function MembershipPriceCard(props: MembershipPriceCardProps) {
  const { t } = useTranslation()
  const info = props.info
  if (!info?.enabled) return null
  const isVip = Boolean(info.is_vip)
  const savingPercent = getVipSavingPercent(info)
  const rule = getVipUpgradeRule(info, t)

  const benefits: CardBenefit[] = []
  if (savingPercent > 0) {
    benefits.push({
      id: 'price',
      title: t('Lower price on every call'),
      text: t('Video, image and chat models alike'),
      stat: `-${savingPercent}%`,
    })
  }
  const standardConcurrency = info.standard_concurrency ?? 0
  const vipConcurrency = info.vip_concurrency ?? 0
  if (standardConcurrency > 0 && vipConcurrency > standardConcurrency) {
    const ratio = Math.round(vipConcurrency / standardConcurrency)
    benefits.push({
      id: 'concurrency',
      title: t('High concurrency'),
      text: t('{{vip}} tasks at once, standard is {{standard}}', {
        vip: vipConcurrency,
        standard: standardConcurrency,
      }),
      stat: ratio >= 2 ? `${ratio}×` : String(vipConcurrency),
    })
  }
  benefits.push({
    id: 'lines',
    title: t('Dedicated lines, served first'),
    text: t('More stable upstream, priority at peak hours'),
    stat: t('Served first'),
  })

  let footnote = rule
    ? t('{{rule}} to upgrade automatically. Redemption codes count too.', {
        rule,
      })
    : ''
  if (isVip) {
    footnote =
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
        'dark rounded-panel from-vip-deep via-vip-deep-mid to-vip-to-hover relative isolate flex flex-col gap-3 overflow-hidden bg-linear-150 p-5 text-left text-white shadow-[0_30px_60px_-30px_rgba(76,29,149,0.7)] sm:px-6',
        props.className
      )}
    >
      <div
        aria-hidden
        className='pointer-events-none absolute -top-20 -right-20 -z-10 size-64 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.55),transparent_70%)]'
      />
      <div
        aria-hidden
        className='pointer-events-none absolute -bottom-24 -left-16 -z-10 size-56 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.45),transparent_70%)]'
      />

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='inline-flex h-6.5 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2.5 text-xs font-semibold'>
          <HugeiconsIcon
            icon={CrownIcon}
            className='text-vip size-3.5'
            aria-hidden
          />
          {isVip ? t('You are VIP') : t('VIP membership')}
        </span>
        {!isVip && (
          <span className='text-xs text-white/75'>
            {t('Unlocked by top-ups · no monthly fee')}
          </span>
        )}
      </div>

      {savingPercent > 0 ? (
        <p className='flex items-end gap-3'>
          <span
            className={cn(
              'to-vip bg-linear-to-b from-white bg-clip-text text-5xl leading-[0.9] text-transparent',
              VIP_DISPLAY_FONT
            )}
          >
            {savingPercent}%
          </span>
          <span className='flex flex-col pb-0.5 text-base leading-snug font-semibold'>
            <span>{t('off every model')}</span>
            <span>{isVip ? t('already applied') : t('on every request')}</span>
          </span>
        </p>
      ) : (
        <p className='text-lg font-semibold'>
          {t('VIP members get lower prices and higher concurrency')}
        </p>
      )}

      <ul className='flex flex-col gap-1.5'>
        {benefits.map((benefit) => (
          <li
            key={benefit.id}
            className='rounded-control flex items-center gap-2.5 border border-white/12 bg-white/8 px-2.5 py-1.5'
          >
            <span className='flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-white/14'>
              <HugeiconsIcon
                icon={VIP_BENEFIT_ICONS[benefit.id]}
                className='text-vip size-4'
                aria-hidden
              />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-semibold'>{benefit.title}</p>
              <p className='text-xs leading-snug text-white/72'>
                {benefit.text}
              </p>
            </div>
            <span className='font-display text-vip shrink-0 text-base font-bold'>
              {benefit.stat}
            </span>
          </li>
        ))}
      </ul>

      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <Button
          size='lg'
          className='text-vip-deep min-w-0 flex-1 bg-white font-semibold hover:bg-white/90'
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
          {isVip ? t('View my benefits') : t('Learn about VIP')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='size-3.5'
            aria-hidden
          />
        </Button>
        <VipCompareButton source='pricing-banner' className='text-sm' />
      </div>
      {footnote && (
        <p className='-mt-0.5 text-xs leading-snug text-white/70'>{footnote}</p>
      )}
    </section>
  )
}
