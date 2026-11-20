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
import { Activity01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
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

const STAT_CARD =
  'bg-card flex min-w-0 items-center gap-2.5 rounded-card border px-3 py-2.5 text-left sm:gap-3 sm:px-4 sm:py-3'
const STAT_ICON =
  'relative flex size-8 shrink-0 items-center justify-center rounded-control sm:size-10'
// Staggered so the three bars rise one after another.
const LIVE_BAR_DELAYS = [
  '[animation-delay:0ms]',
  '[animation-delay:250ms]',
  '[animation-delay:500ms]',
]
const STAT_VALUE =
  'font-display text-xl leading-tight font-bold tracking-tight tabular-nums sm:text-2xl'

/**
 * The success rate and average generation time under the model plaza title,
 * each with a moving icon that marks it as live.
 */
export function PricingLiveStats(props: { className?: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = useLiveStats()
  const successRate = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(stats.successRate)
  const duration = t('{{minutes}} min {{seconds}} s', {
    minutes: Math.floor(stats.durationSeconds / 60),
    seconds: stats.durationSeconds % 60,
  })

  return (
    <dl className={cn('grid grid-cols-2 gap-2 sm:gap-3', props.className)}>
      <div className={STAT_CARD}>
        <span className={cn(STAT_ICON, 'bg-success/10 text-success')}>
          <span
            aria-hidden
            className='bg-success absolute top-1.5 right-1.5 size-1.5 animate-ping rounded-full motion-reduce:animate-none'
          />
          <span
            aria-hidden
            className='bg-success absolute top-1.5 right-1.5 size-1.5 rounded-full'
          />
          <HugeiconsIcon icon={Activity01Icon} className='size-5' aria-hidden />
        </span>
        <div className='min-w-0'>
          <dt className='text-muted-foreground text-xs'>
            {t('Success rate, last 24 h')}
          </dt>
          <dd className={cn(STAT_VALUE, 'text-success')}>{successRate}%</dd>
        </div>
      </div>
      <div className={STAT_CARD}>
        <span
          aria-hidden
          className={cn(STAT_ICON, 'bg-brand-soft items-end gap-0.5 pb-2.5')}
        >
          {LIVE_BAR_DELAYS.map((delay) => (
            <span
              key={delay}
              className={cn(
                'bg-brand live-stat-bar h-4 w-1 rounded-full',
                delay
              )}
            />
          ))}
        </span>
        <div className='min-w-0'>
          <dt className='text-muted-foreground text-xs'>
            {t('Avg. generation time')}
          </dt>
          <dd className={cn(STAT_VALUE, 'text-brand dark:text-brand-on-dark')}>
            {duration}
          </dd>
        </div>
      </div>
    </dl>
  )
}
