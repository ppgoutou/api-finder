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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { getVipSavingPercent } from '../lib/progress'
import {
  VIP_DISPLAY_FONT,
  VIP_NIGHT_TEXT,
  VIP_NIGHT_PANEL,
} from '../lib/vip-style'
import type { MembershipInfo } from '../types'

interface VipHighlightsProps {
  info: MembershipInfo
  /** Large figures for the VIP page hero, small ones for dialogs. */
  size?: 'sm' | 'lg'
  /** Leave the saving out, where a headline already shows it. */
  omitSaving?: boolean
  className?: string
}

interface Highlight {
  id: string
  value: string
  label: string
  hint?: string
}

/**
 * The three VIP figures worth a glance: the saving, concurrency, support.
 * Drawn as glassy tiles for the dark VIP page and dialog.
 */
export function VipHighlights(props: VipHighlightsProps) {
  const { t } = useTranslation()
  const info = props.info
  const large = props.size === 'lg'
  const highlights: Highlight[] = []

  const savingPercent = getVipSavingPercent(info)
  if (savingPercent > 0 && !props.omitSaving) {
    highlights.push({
      id: 'price',
      value: `${savingPercent}%`,
      label: t('Off every model'),
    })
  }
  const standardConcurrency = info.standard_concurrency ?? 0
  const vipConcurrency = info.vip_concurrency ?? 0
  if (standardConcurrency > 0 && vipConcurrency > 0) {
    highlights.push({
      id: 'concurrency',
      value: String(vipConcurrency),
      label: t('Tasks at once'),
      hint: t('Standard: about {{count}}', { count: standardConcurrency }),
    })
  }
  highlights.push({
    id: 'support',
    value: t('24/7'),
    label: t('Dedicated support'),
  })

  return (
    <dl
      className={cn(
        'grid gap-2',
        highlights.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
        large && 'gap-3 sm:gap-4',
        props.className
      )}
    >
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          className={cn(
            'flex min-w-0 flex-col-reverse items-center justify-end rounded-2xl px-2 py-4 text-center',
            VIP_NIGHT_PANEL,
            large && 'rounded-3xl px-3 py-6 sm:py-8'
          )}
        >
          <dt className='mt-2 text-xs leading-snug text-white/55 sm:text-sm'>
            {highlight.label}
            {highlight.hint && (
              <span className='text-caption block text-white/50'>
                {highlight.hint}
              </span>
            )}
          </dt>
          <dd
            className={cn(
              'text-3xl leading-none tabular-nums',
              VIP_DISPLAY_FONT,
              large && 'text-4xl sm:text-6xl',
              highlight.id === 'price' ? VIP_NIGHT_TEXT : 'text-white'
            )}
          >
            {highlight.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
