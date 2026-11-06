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
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  joinLanguageBlocks,
  LANGUAGE_BLOCK_LOCALES,
  parseLanguageBlocks,
} from '@/lib/language-blocks'

/** Tab holding the text shown in every language (before the first marker). */
const SHARED_TAB = '*'

/** Language names are shown in their own language, so they are not translated. */
const LOCALE_LABELS: Record<string, string> = {
  zh: '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  ru: 'Русский',
  vi: 'Tiếng Việt',
}

function sameLocale(left: string, right: string): boolean {
  const normalize = (locale: string) =>
    locale.replaceAll('_', '-').toLowerCase()
  return normalize(left) === normalize(right)
}

type LanguageBlocksTextareaProps = Omit<
  React.ComponentProps<'textarea'>,
  'value' | 'defaultValue' | 'onChange'
> & {
  /** Stored content with `<!-- lang:xx -->` markers. */
  value: string | null | undefined
  onChange: (value: string) => void
}

/**
 * Edits admin-written content one language at a time while storing it as
 * `<!-- lang:xx -->` language blocks. Chinese is selected by default; legacy
 * content without markers opens on the shared "All languages" text.
 */
export function LanguageBlocksTextarea({
  value,
  onChange,
  ...textareaProps
}: LanguageBlocksTextareaProps) {
  const { t } = useTranslation()
  const content = value ?? ''
  const parsed = parseLanguageBlocks(content)
  const [picked, setPicked] = React.useState<string | null>(null)
  // Stored blocks are trimmed, so the text being typed is kept as typed until
  // the value changes from outside (form reset, autofill).
  const [draft, setDraft] = React.useState<{
    tab: string
    text: string
    content: string
  } | null>(null)

  // Replaced from outside: fall back to the tab that fits the new content, or
  // the picked tab could show an empty box while the text sits elsewhere.
  const [seenContent, setSeenContent] = React.useState(content)
  if (content !== seenContent) {
    setSeenContent(content)
    if (content !== draft?.content) setPicked(null)
  }

  const legacy = parsed.blocks.length === 0 && content.trim() !== ''
  const active = picked ?? (legacy ? SHARED_TAB : LANGUAGE_BLOCK_LOCALES[0])

  const extraLocales = parsed.blocks
    .map((block) => block.locale)
    .filter(
      (locale, index, all) =>
        !LANGUAGE_BLOCK_LOCALES.some((known) => sameLocale(known, locale)) &&
        all.findIndex((other) => sameLocale(other, locale)) === index
    )
  const tabs = [SHARED_TAB, ...LANGUAGE_BLOCK_LOCALES, ...extraLocales]

  // A repeated marker resolves to its last block, like selectLanguageBlock.
  const blockFor = (tab: string) =>
    [...parsed.blocks].reverse().find((block) => sameLocale(block.locale, tab))
  const textOf = (tab: string) =>
    tab === SHARED_TAB ? parsed.shared : (blockFor(tab)?.text ?? '')

  const shownText =
    draft && draft.tab === active && draft.content === content
      ? draft.text
      : textOf(active)

  const handleChange = (text: string) => {
    let next: string
    if (active === SHARED_TAB) {
      next = joinLanguageBlocks({ ...parsed, shared: text })
    } else {
      const others = parsed.blocks.filter(
        (block) => !sameLocale(block.locale, active)
      )
      const locale = blockFor(active)?.locale ?? active
      next = joinLanguageBlocks({
        shared: parsed.shared,
        blocks: [...others, { locale, text }],
      })
    }
    setPicked(active)
    setDraft({ tab: active, text, content: next })
    onChange(next)
  }

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <Tabs value={active} onValueChange={(tab) => setPicked(String(tab))}>
        <TabsList className='no-scrollbar w-full justify-start overflow-x-auto'>
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} className='flex-none px-2'>
              {tab === SHARED_TAB
                ? t('All languages')
                : (LOCALE_LABELS[tab] ?? tab)}
              {textOf(tab).trim() !== '' && (
                <span
                  aria-hidden='true'
                  className='bg-primary size-1.5 rounded-full'
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Textarea
        {...textareaProps}
        value={shownText}
        onChange={(event) => handleChange(event.target.value)}
      />
    </div>
  )
}
