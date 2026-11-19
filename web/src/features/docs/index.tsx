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

import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { Markdown } from '@/components/ui/markdown'
import { useStatus } from '@/hooks/use-status'
import { normalizeInterfaceLanguage } from '@/i18n/languages'

import { EN_DOCS } from './content/en'
import { ZH_DOCS } from './content/zh'
import type { DocBlock } from './types'

function CodeSample(props: { label: string; code: string }) {
  const { t } = useTranslation()
  return (
    <figure className='border-border/60 my-4 overflow-hidden rounded-xl border bg-slate-950 text-slate-200'>
      <figcaption className='flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-1.5'>
        <span className='truncate text-xs text-slate-400'>{props.label}</span>
        <CopyButton
          value={props.code}
          className='text-slate-300 hover:bg-slate-800 hover:text-white'
          aria-label={t('Copy code')}
        />
      </figcaption>
      <pre className='text-body-sm overflow-x-auto p-4 font-mono leading-relaxed'>
        <code>{props.code}</code>
      </pre>
    </figure>
  )
}

/**
 * Developer documentation for the video API. Chinese interfaces read the
 * Chinese version; every other language reads the English one.
 */
export function Docs() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const language = normalizeInterfaceLanguage(
    i18n.resolvedLanguage || i18n.language
  )
  const content = language === 'zhCN' || language === 'zhTW' ? ZH_DOCS : EN_DOCS
  const baseUrl = (
    (status?.server_address as string | undefined) || window.location.origin
  ).replace(/\/+$/, '')
  const fill = (text: string) => text.replaceAll('{{BASE_URL}}', baseUrl)

  const renderBlock = (block: DocBlock, key: number) => {
    if (block.type === 'code') {
      return (
        <CodeSample key={key} label={block.label} code={fill(block.code)} />
      )
    }
    // Keep header cells and inline code on one line; narrow screens scroll
    // the table sideways instead of breaking words. The page sits on the
    // site backdrop, so tables get a solid surface and inline code is set
    // apart by the brand color rather than a background chip.
    return (
      <Markdown
        key={key}
        className='[&_code]:text-brand dark:[&_code]:text-brand-on-dark [&_table]:bg-card [&_code]:bg-transparent [&_code]:px-0 [&_table]:w-fit [&_table]:max-w-full [&_td_code]:whitespace-nowrap [&_th]:whitespace-nowrap'
      >
        {fill(block.text)}
      </Markdown>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto flex max-w-6xl gap-10 px-4 py-12 md:px-6'>
        <nav
          aria-label={t('On this page')}
          className='sticky top-20 hidden max-h-[calc(100vh-6rem)] w-52 shrink-0 self-start overflow-y-auto lg:block'
        >
          <p className='text-muted-foreground text-eyebrow mb-3 uppercase'>
            {t('On this page')}
          </p>
          <ul className='flex flex-col gap-1 text-sm'>
            {content.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className='text-muted-foreground hover:text-foreground hover:bg-muted block rounded-md px-2 py-1.5 transition-colors'
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className='min-w-0 flex-1'>
          <header className='mb-8'>
            <h1 className='font-display text-heading-1'>{content.title}</h1>
            <p className='text-muted-foreground mt-3 max-w-3xl leading-relaxed'>
              {content.intro}
            </p>
            <ul className='mt-5 flex flex-wrap gap-2 lg:hidden'>
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className='border-border/60 text-muted-foreground hover:text-foreground block rounded-full border px-3 py-1 text-xs'
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </header>

          {content.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className='border-border/50 scroll-mt-20 border-t py-8 first-of-type:border-t-0 first-of-type:pt-0'
            >
              <h2
                id={`${section.id}-title`}
                className='mb-4 text-2xl font-semibold tracking-tight'
              >
                {section.title}
              </h2>
              {section.blocks.map(renderBlock)}
            </section>
          ))}
        </article>
      </div>
    </PublicLayout>
  )
}
