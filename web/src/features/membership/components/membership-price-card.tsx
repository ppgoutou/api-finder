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
import { useCountUp } from '@/hooks/use-count-up'
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

/** The headline figure of a benefit: a number that counts up, or a word. */
type BenefitFigure =
  | { kind: 'number'; value: number; prefix?: string; suffix?: string }
  | { kind: 'text'; text: string }

interface CardBenefit {
  id: VipBenefitId
  figure: BenefitFigure
  title: string
  text: string
}

/** The icon motion of each benefit on the band. */
const BENEFIT_MOTION: Partial<Record<VipBenefitId, string>> = {
  price: 'plaza-icon-sway',
  concurrency: 'plaza-icon-flicker',
  lines: 'plaza-icon-slide',
}

function BenefitFigureText(props: { figure: BenefitFigure }) {
  const figure = props.figure
  const end = figure.kind === 'number' ? figure.value : 0
  const shown = useCountUp(end)
  if (figure.kind === 'text') return figure.text
  return (
    <>
      {figure.prefix}
      {Math.round(shown)}
      {figure.suffix}
    </>
  )
}

/**
 * The VIP band under the model plaza search: what VIP saves, how much more it
 * runs at once and which lines it uses, each led by a large figure. VIP users
 * see the same band as a reminder that the prices below are already theirs.
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
      figure: {
        kind: 'number',
        value: savingPercent,
        prefix: '-',
        suffix: '%',
      },
      title: t('Lower price on every call'),
      text: t('Video, image and chat models alike'),
    })
  }
  const standardConcurrency = info.standard_concurrency ?? 0
  const vipConcurrency = info.vip_concurrency ?? 0
  if (standardConcurrency > 0 && vipConcurrency > standardConcurrency) {
    const ratio = Math.round(vipConcurrency / standardConcurrency)
    benefits.push({
      id: 'concurrency',
      figure:
        ratio >= 2
          ? { kind: 'number', value: ratio, suffix: '×' }
          : { kind: 'number', value: vipConcurrency },
      title: t('High concurrency'),
      text: t('{{vip}} tasks at once, standard is {{standard}}', {
        vip: vipConcurrency,
        standard: standardConcurrency,
      }),
    })
  }
  benefits.push({
    id: 'lines',
    figure: { kind: 'text', text: t('Served first') },
    title: t('Dedicated lines'),
    text: t('More stable upstream, priority at peak hours'),
  })

  let note = rule
    ? t('{{rule}} to upgrade automatically. Redemption codes count too.', {
        rule,
      })
    : ''
  if (isVip) {
    note =
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
        'dark rounded-panel from-vip-deep via-vip-deep-mid to-vip-to-hover relative isolate flex flex-col gap-5 overflow-hidden bg-linear-150 p-5 text-left text-white shadow-[0_30px_60px_-30px_rgba(76,29,149,0.7)] sm:gap-6 sm:px-8 sm:pt-6 sm:pb-7',
        props.className
      )}
    >
      <div
        aria-hidden
        className='pointer-events-none absolute -top-28 right-40 -z-10 size-72 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.5),transparent_70%)]'
      />
      <div
        aria-hidden
        className='pointer-events-none absolute -bottom-36 -left-16 -z-10 size-72 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.45),transparent_70%)]'
      />
      <span
        aria-hidden
        className='plaza-vip-shine pointer-events-none absolute inset-y-0 -left-[12%] -z-10 w-[9%]'
      />

      <div className='flex flex-col gap-4 border-b border-white/14 pb-5 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-wrap items-center gap-x-3.5 gap-y-2'>
          <span className='text-caption inline-flex h-6.5 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2.5 font-semibold'>
            <HugeiconsIcon
              icon={CrownIcon}
              className='text-vip size-3.5'
              aria-hidden
            />
            {isVip ? t('You are VIP') : t('VIP membership')}
          </span>
          {!isVip && (
            <span className='text-caption text-white/75'>
              {t('Unlocked by top-ups · no monthly fee')}
            </span>
          )}
          {note && (
            <p className='text-body sm:text-body-lg font-medium text-white/85'>
              {note}
            </p>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-5'>
          <VipCompareButton source='pricing-banner' className='text-body' />
          <Button
            size='lg'
            className='text-vip-deep bg-white font-semibold hover:bg-white/90'
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
        </div>
      </div>

      <ul className='grid gap-5 sm:auto-cols-fr sm:grid-flow-col sm:gap-0'>
        {benefits.map((benefit) => (
          <li
            key={benefit.id}
            className='grid grid-cols-[2.75rem_minmax(0,1fr)] content-start gap-x-4 gap-y-1.5 sm:not-first:border-l sm:not-first:border-white/14 sm:not-first:pl-8 sm:not-last:pr-8'
          >
            <span className='rounded-control row-span-3 flex size-11 items-center justify-center bg-white/14'>
              <HugeiconsIcon
                icon={VIP_BENEFIT_ICONS[benefit.id]}
                className={cn('text-vip size-5.5', BENEFIT_MOTION[benefit.id])}
                aria-hidden
              />
            </span>
            <span
              className={cn(
                'plaza-vip-pop to-vip bg-linear-to-b from-white bg-clip-text text-4xl leading-none text-transparent tabular-nums sm:text-5xl',
                VIP_DISPLAY_FONT
              )}
            >
              <BenefitFigureText figure={benefit.figure} />
            </span>
            <p className='text-body-lg font-semibold'>{benefit.title}</p>
            <p className='text-body-sm text-white/80'>{benefit.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
