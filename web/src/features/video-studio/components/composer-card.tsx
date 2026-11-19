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
import { Clock, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { ASSET_RETENTION_DAYS } from '../constants'
import { promptLength, type PromptGuide } from '../lib/prompt-guide'

interface ComposerCardProps {
  /** Reference panel and prompt box. */
  children: ReactNode
  /** Mode, model and parameter menus, cost and the generate button. */
  toolbar: ReactNode
  /** Shown under the toolbar, such as the unavailable model notice. */
  notice?: ReactNode
  /** Prompt as the model reads it, for the character counter. */
  prompt: string
  guide: PromptGuide
  /**
   * Prefix of the ids of the model advice ("-advice") and the character
   * counter ("-count"); the prompt box names both in aria-describedby.
   */
  hintId: string
}

/**
 * Studio prompt card: a white area for references and the prompt, over a
 * gray bar with the toolbar and the prompt advice, file retention and
 * character counter. The counter and advice stay visible while typing.
 */
export function ComposerCard(props: ComposerCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const length = promptLength(props.prompt)
  const max = formatNumber(props.guide.maxLength, locale)

  return (
    <div
      data-testid='composer-card'
      className='bg-card border-foreground/20 focus-within:border-primary focus-within:ring-primary/15 rounded-2xl border shadow-sm transition-[border-color,box-shadow] focus-within:ring-3'
    >
      <div className='flex flex-col gap-3 p-3 sm:flex-row'>
        {props.children}
      </div>
      <div className='bg-muted/60 rounded-b-[15px] border-t px-3 pt-2 pb-2.5'>
        <div className='flex flex-wrap items-center gap-1'>{props.toolbar}</div>
        {props.notice}
        <div className='text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs'>
          {props.guide.hint && (
            <span className='inline-flex items-center gap-1.5'>
              <Info className='size-3.5 shrink-0' aria-hidden />
              <span id={`${props.hintId}-advice`}>
                {t(props.guide.hint, { max })}
              </span>
            </span>
          )}
          <span className='inline-flex items-center gap-1.5'>
            <Clock className='size-3.5 shrink-0' aria-hidden />
            {t(
              'Reference files are kept for {{days}} days and then deleted automatically. Uploading requires a positive balance.',
              { days: ASSET_RETENTION_DAYS }
            )}
          </span>
          <span
            id={`${props.hintId}-count`}
            className={cn(
              'ml-auto tabular-nums',
              length > props.guide.maxLength && 'text-destructive'
            )}
          >
            {t('{{count}} / {{max}} characters', {
              count: formatNumber(length, locale),
              max,
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
