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
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  canonicalMentions,
  localizeMentions,
  splitMentions,
} from '../lib/mention-names'
import {
  PROMPT_INPUT_CAP,
  promptLength,
  type PromptGuide,
} from '../lib/prompt-guide'

/** Box and type the prompt textarea and its mention layer share. */
const PROMPT_TEXT_BOX =
  'px-1 py-1 text-base leading-6 break-words whitespace-pre-wrap [scrollbar-gutter:stable] md:text-sm md:leading-6'

export interface MentionOption {
  /** Token the model reads, such as "图片1". */
  token: string
  fileName: string
}

interface PromptInputProps {
  /** Prompt as the model reads it, mentions such as "@图片1" included. */
  value: string
  onChange: (value: string) => void
  /** References the prompt can mention; typing "@" lists them. */
  mentions: MentionOption[]
  placeholder: string
  onSubmit: () => void
  /** Accessible name of the textarea; "Video prompt" by default. */
  label?: string
  /** Length limit and advice of the selected model. */
  guide: PromptGuide
}

/**
 * Prompt textarea. Typing "@" opens a list of the uploaded references and
 * picking one inserts its mention. Mentions show in the interface language,
 * such as "@Image1", and reach onChange as the model's "@图片1". Mentions of
 * an uploaded reference stand out: the textarea text is transparent and a
 * layer underneath draws the same text with the mentions marked.
 * Ctrl/⌘ + Enter submits.
 */
export function PromptInput(props: PromptInputProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const locale = toIntlLocale(language)
  const shown = localizeMentions(props.value, language)
  const mentionName = (option: MentionOption) =>
    localizeMentions(`@${option.token}`, language).slice(1)
  const change = (text: string) =>
    props.onChange(canonicalMentions(text, language))
  const hintId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const parts = splitMentions(
    shown,
    props.mentions.map((option) => mentionName(option))
  )
  // Caret position right after the "@" that opened the list.
  const [mentionAt, setMentionAt] = useState<number | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const menuOpen = mentionAt !== null
  const length = promptLength(props.value)
  const tooLong = length > props.guide.maxLength

  const closeMenu = () => {
    setMentionAt(null)
    setHighlighted(0)
  }

  const insertMention = (option: MentionOption) => {
    if (mentionAt === null) return
    const before = shown.slice(0, mentionAt)
    const after = shown.slice(mentionAt)
    const inserted = `${mentionName(option)} `
    change(before + inserted + after)
    closeMenu()
    const caret = mentionAt + inserted.length
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(caret, caret)
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && props.mentions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        const count = props.mentions.length
        setHighlighted((index) => (index + step + count) % count)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        insertMention(props.mentions[highlighted])
        return
      }
    }
    if (menuOpen && event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      props.onSubmit()
    }
  }

  return (
    <div className='relative min-w-0 flex-1'>
      <div className='relative'>
        {/* Same box and type as the textarea, so every glyph lines up. */}
        <div
          ref={layerRef}
          aria-hidden
          data-testid='prompt-mention-layer'
          className={cn(
            PROMPT_TEXT_BOX,
            'pointer-events-none absolute inset-0 overflow-hidden'
          )}
        >
          {parts.map((part) =>
            part.mention ? (
              <mark
                key={part.start}
                className='bg-primary/15 text-primary rounded-sm'
              >
                {part.text}
              </mark>
            ) : (
              <span key={part.start}>{part.text}</span>
            )
          )}
          {/* Keeps the height of a trailing empty line. */}
          {'\u200b'}
        </div>
        <Textarea
          ref={textareaRef}
          value={shown}
          placeholder={props.placeholder}
          aria-label={props.label ?? t('Video prompt')}
          maxLength={PROMPT_INPUT_CAP}
          aria-describedby={hintId}
          aria-invalid={tooLong}
          rows={3}
          className={cn(
            PROMPT_TEXT_BOX,
            'caret-foreground relative min-h-20 resize-none border-0 bg-transparent text-transparent shadow-none focus-visible:ring-0 dark:bg-transparent'
          )}
          onScroll={(event) => {
            if (layerRef.current) {
              layerRef.current.scrollTop = event.currentTarget.scrollTop
            }
          }}
          onChange={(event) => {
            const next = event.target.value
            const caret = event.target.selectionStart
            change(next)
            const typedAt =
              next.length > shown.length && next[caret - 1] === '@'
            if (typedAt) {
              setMentionAt(caret)
              setHighlighted(0)
            } else if (menuOpen) {
              closeMenu()
            }
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => closeMenu()}
        />
      </div>
      {/* The advice until the user types, then a character counter. */}
      <p
        id={hintId}
        className={cn(
          'text-muted-foreground px-1 text-caption',
          tooLong && 'text-destructive'
        )}
      >
        {props.value
          ? t('{{count}} / {{max}} characters', {
              count: formatNumber(length, locale),
              max: formatNumber(props.guide.maxLength, locale),
            })
          : t(props.guide.hint, {
              max: formatNumber(props.guide.maxLength, locale),
            })}
      </p>
      {menuOpen && (
        <div
          role='listbox'
          aria-label={t('Mention a reference')}
          className='bg-popover text-popover-foreground absolute top-full left-0 z-20 mt-1 max-h-60 w-64 overflow-y-auto rounded-lg border p-1 shadow-md'
        >
          {props.mentions.length === 0 ? (
            <p className='text-muted-foreground px-2 py-1.5 text-xs'>
              {t('Upload a reference file first, then mention it here.')}
            </p>
          ) : (
            props.mentions.map((option, index) => (
              <button
                key={option.token}
                type='button'
                role='option'
                aria-selected={index === highlighted}
                // Keep focus in the textarea so the caret position survives.
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertMention(option)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  index === highlighted && 'bg-accent text-accent-foreground'
                )}
              >
                <span className='font-semibold'>@{mentionName(option)}</span>
                <span className='text-muted-foreground truncate text-xs'>
                  {option.fileName}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
