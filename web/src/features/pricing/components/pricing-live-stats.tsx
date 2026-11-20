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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCountUp } from '@/hooks/use-count-up'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { getLiveStats, msUntilNextMinute } from '../lib/live-stats'

/** Re-reads the figures at the start of every minute. */
function useLiveStats() {
  const [stats, setStats] = useState(() => getLiveStats(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setStats(getLiveStats(Date.now()))
        schedule()
      }, msUntilNextMinute(Date.now()))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return stats
}

const STAT =
  'flex min-w-0 items-center gap-2.5 border-border not-first:border-l not-first:pl-4 sm:gap-3 sm:not-first:pl-6 sm:not-last:pr-6 not-last:pr-4'
const STAT_ICON =
  'relative hidden size-9 shrink-0 items-center justify-center rounded-control border bg-card sm:flex'
const STAT_LABEL = 'text-muted-foreground text-caption'
const STAT_VALUE =
  'font-display text-body-lg sm:text-heading-3 font-semibold tracking-tight whitespace-nowrap tabular-nums'
const ICON_SVG = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-4.5',
  'aria-hidden': true,
} as const

/**
 * The live figures beside the model plaza title: how many models are online,
 * the success rate and the average generation time, each with an icon that
 * keeps moving so the row reads as live. Figures count up the first time.
 */
export function PricingLiveStats(props: {
  modelCount: number
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = useLiveStats()
  const modelCount = useCountUp(props.modelCount)
  const successRate = useCountUp(stats.successRate)
  const shownRate = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(successRate)
  const duration = t('{{minutes}} min {{seconds}} s', {
    minutes: Math.floor(stats.durationSeconds / 60),
    seconds: stats.durationSeconds % 60,
  })

  return (
    <dl
      className={cn(
        'grid grid-cols-[repeat(3,auto)] justify-start',
        props.className
      )}
    >
      <div className={STAT}>
        <span className={cn(STAT_ICON, 'text-brand')}>
          <svg {...ICON_SVG}>
            <path
              className='plaza-icon-drift-up'
              d='M12 3 3 7.5 12 12l9-4.5z'
            />
            <g className='plaza-icon-drift-down'>
              <path d='m3 12 9 4.5 9-4.5' opacity={0.75} />
              <path d='m3 16.5 9 4.5 9-4.5' opacity={0.5} />
            </g>
          </svg>
        </span>
        <div className='min-w-0'>
          <dt className={STAT_LABEL}>{t('Models online')}</dt>
          <dd className={STAT_VALUE}>
            {formatNumber(Math.round(modelCount), locale)}
          </dd>
        </div>
      </div>
      <div className={STAT}>
        <span className={cn(STAT_ICON, 'text-success')}>
          <span
            aria-hidden
            className='plaza-icon-ring border-success absolute inset-1.5 rounded-full border-2'
          />
          <svg {...ICON_SVG}>
            <circle cx='12' cy='12' r='9' opacity={0.35} />
            <path className='plaza-icon-check' d='m8 12.5 2.8 2.8L16.5 9.5' />
          </svg>
        </span>
        <div className='min-w-0'>
          <dt className={STAT_LABEL}>{t('Success rate, last 24 h')}</dt>
          <dd className={cn(STAT_VALUE, 'text-success')}>{shownRate}%</dd>
        </div>
      </div>
      <div className={STAT}>
        <span className={cn(STAT_ICON, 'text-vip')}>
          <svg {...ICON_SVG}>
            <circle cx='12' cy='12' r='9' />
            <path className='plaza-icon-hand' d='M12 12V7' />
            <circle cx='12' cy='12' r='1' fill='currentColor' />
          </svg>
        </span>
        <div className='min-w-0'>
          <dt className={STAT_LABEL}>{t('Avg. generation time')}</dt>
          <dd className={STAT_VALUE}>{duration}</dd>
        </div>
      </div>
    </dl>
  )
}
