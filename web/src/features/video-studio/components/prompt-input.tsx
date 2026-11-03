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

import type { PromptGuide } from '../lib/prompt-guide'

export interface MentionOption {
  token: string
  fileName: string
}

interface PromptInputProps {
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
 * picking one inserts its token, such as "@图片1". Ctrl/⌘ + Enter submits.
 */
export function PromptInput(props: PromptInputProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const hintId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Caret position right after the "@" that opened the list.
  const [mentionAt, setMentionAt] = useState<number | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const menuOpen = mentionAt !== null

  const closeMenu = () => {
    setMentionAt(null)
    setHighlighted(0)
  }

  const insertMention = (option: MentionOption) => {
    if (mentionAt === null) return
    const before = props.value.slice(0, mentionAt)
    const after = props.value.slice(mentionAt)
    const inserted = `${option.token} `
    props.onChange(before + inserted + after)
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
      <Textarea
        ref={textareaRef}
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label ?? t('Video prompt')}
        maxLength={props.guide.maxLength}
        aria-describedby={hintId}
        rows={3}
        className='min-h-20 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0 dark:bg-transparent'
        onChange={(event) => {
          const next = event.target.value
          const caret = event.target.selectionStart
          props.onChange(next)
          const typedAt =
            next.length > props.value.length && next[caret - 1] === '@'
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
      {/* Shown until the user starts typing; screen readers keep it. */}
      <p
        id={hintId}
        className={cn(
          'text-muted-foreground px-1 text-[11px]',
          props.value && 'sr-only'
        )}
      >
        {t(props.guide.hint, {
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
                <span className='font-semibold'>@{option.token}</span>
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
