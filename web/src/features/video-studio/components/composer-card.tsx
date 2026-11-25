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
import { Check, Clock, Info, Upload } from 'lucide-react'
import {
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { ASSET_RETENTION_DAYS } from '../constants'
import { promptLength, type PromptGuide } from '../lib/prompt-guide'

interface ComposerCardProps {
  /** Mode tabs above the prompt. */
  header?: ReactNode
  /** Reference panel and prompt box. */
  children: ReactNode
  /** File limits and upload problems, under the prompt. */
  files?: ReactNode
  /** Mode, model and parameter menus. */
  toolbar: ReactNode
  /** Cost and the generate button; stays on screen on phones. */
  action: ReactNode
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
  /** Whether there is anything to clear. */
  hasContent: boolean
  /** Whether this browser keeps the draft. */
  saved: boolean
  onClear: () => void
  /** Files dropped on the card or pasted into it. */
  onFiles: (files: File[]) => void
}

/**
 * Studio prompt card: the mode tabs, a white area for references and the
 * prompt, and a gray bar with the toolbar, the prompt advice, file retention
 * and character counter. Files can be dropped anywhere on it or pasted. On
 * phones the cost and the generate button stay at the bottom of the screen.
 */
export function ComposerCard(props: ComposerCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const length = promptLength(props.prompt)
  const max = formatNumber(props.guide.maxLength, locale)
  const [dragging, setDragging] = useState(false)

  const isFileDrag = (event: DragEvent) =>
    [...event.dataTransfer.types].includes('Files')
  const handleDrop = (event: DragEvent) => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    setDragging(false)
    const files = [...event.dataTransfer.files]
    if (files.length) props.onFiles(files)
  }
  const handlePaste = (event: ClipboardEvent) => {
    const files = [...event.clipboardData.files]
    // Text copied from office apps carries a picture of itself; keep the text.
    if (!files.length || event.clipboardData.getData('text/plain')) return
    event.preventDefault()
    props.onFiles(files)
  }

  return (
    <div
      data-testid='composer-card'
      className='bg-card border-foreground/20 focus-within:border-primary focus-within:ring-primary/15 relative rounded-2xl border shadow-sm transition-[border-color,box-shadow] focus-within:ring-3'
      onDragEnter={(event) => {
        if (isFileDrag(event)) setDragging(true)
      }}
      onDragOver={(event) => {
        if (isFileDrag(event)) event.preventDefault()
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null
        if (!next || !event.currentTarget.contains(next)) setDragging(false)
      }}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {dragging && (
        <div className='border-primary bg-brand-soft/95 text-primary dark:bg-card/95 pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed'>
          <Upload className='size-7' aria-hidden />
          <span className='text-section-title'>
            {t('Drop to add the files')}
          </span>
        </div>
      )}
      {props.header && (
        <div className='border-b px-2.5 py-2'>{props.header}</div>
      )}
      <div className='flex flex-col gap-3 p-3 sm:flex-row'>
        {props.children}
      </div>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2.5 text-xs'>
        {props.files}
        {props.hasContent && (
          <span className='ml-auto inline-flex items-center gap-3'>
            {props.saved && (
              <span className='text-success inline-flex items-center gap-1'>
                <Check className='size-3.5' aria-hidden />
                {t('Draft saved')}
              </span>
            )}
            <Button
              type='button'
              variant='ghost'
              size='xs'
              onClick={props.onClear}
            >
              {t('Clear')}
            </Button>
          </span>
        )}
      </div>
      <div className='bg-muted/60 rounded-b-[15px] border-t px-3 pt-2 pb-2.5'>
        <div className='flex flex-wrap items-center gap-1'>
          {props.toolbar}
          <div className='max-md:bg-background max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:px-4 max-md:pt-2.5 max-md:pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:ml-auto'>
            <div className='flex items-center justify-between gap-3 md:justify-end'>
              {props.action}
            </div>
          </div>
        </div>
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
          <span className='inline-flex items-center gap-1.5 max-md:hidden'>
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
