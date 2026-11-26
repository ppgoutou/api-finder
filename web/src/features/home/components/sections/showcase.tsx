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
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { handoffFromPrompt } from '@/features/video-studio/lib/prompt-handoff'
import { useStudioHandoff } from '@/stores/studio-handoff-store'

import { useShowcaseCards } from '../../hooks/use-showcase-cards'
import { ClipSpec } from '../clip-spec'
import { PlayableClip } from '../playable-clip'

const ALL_CATEGORIES = 'all'

interface ShowcaseProps {
  isAuthenticated?: boolean
}

export function Showcase(props: ShowcaseProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const startTarget = props.isAuthenticated ? '/video-studio' : '/sign-up'
  // Guests sign up first and are then sent on to the page.
  const startSearch = props.isAuthenticated ? {} : { redirect: '/video-studio' }
  const setHandoff = useStudioHandoff((state) => state.set)
  const cards = useShowcaseCards()
  const categories = [
    ...new Set(cards.map((card) => card.category).filter(Boolean)),
  ]
  // A category that no longer exists (settings changed) falls back to all.
  const activeCategory = categories.includes(category)
    ? category
    : ALL_CATEGORIES
  const filters = [
    { value: ALL_CATEGORIES, label: t('All') },
    ...categories.map((value) => ({ value, label: value })),
  ]
  const visibleCards = cards.filter(
    (card) =>
      activeCategory === ALL_CATEGORIES || card.category === activeCategory
  )

  return (
    <section
      id='showcase'
      className='relative z-10 scroll-mt-20 px-6 py-14 md:py-20'
    >
      <div className='mx-auto max-w-6xl'>
        <div className='flex flex-wrap items-end justify-between gap-6'>
          <div className='max-w-xl'>
            <h2 className='text-heading-2'>{t('Prompt → video')}</h2>
            <p className='text-muted-foreground mt-3'>
              {t(
                'Every clip here was made on this platform with Seedance. Copy a prompt to create the same effect.'
              )}
            </p>
          </div>
          <ToggleGroup
            value={[activeCategory]}
            onValueChange={(value) => {
              const next = value.find((item) => item !== activeCategory)
              if (next) setCategory(next)
            }}
            aria-label={t('Filter by category')}
            variant='outline'
            spacing={2}
            className='flex-wrap'
          >
            {filters.map((filter) => (
              <ToggleGroupItem
                key={filter.value}
                value={filter.value}
                className='rounded-full px-4'
              >
                {filter.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <ul className='mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          {visibleCards.map((card) => (
            <li
              key={card.key}
              className='bg-card border-border/60 flex flex-col overflow-hidden rounded-2xl border'
            >
              <div className='relative aspect-video'>
                <PlayableClip
                  src={card.video}
                  poster={card.poster}
                  title={card.title}
                />
                {card.spec && (
                  <ClipSpec
                    spec={card.spec}
                    className='text-micro pointer-events-none absolute right-2.5 bottom-2.5 px-2 py-0.5'
                  />
                )}
              </div>
              <div className='flex flex-1 flex-col gap-3 p-5'>
                <div className='flex items-center justify-between gap-3'>
                  <h3 className='font-semibold'>{card.title}</h3>
                  {card.category && (
                    <Badge variant='secondary'>{card.category}</Badge>
                  )}
                </div>
                {card.prompt && (
                  <p className='text-muted-foreground line-clamp-3 text-sm leading-relaxed'>
                    {card.prompt}
                  </p>
                )}
                <div className='mt-auto flex flex-wrap items-center gap-2 pt-1'>
                  {card.prompt && (
                    <CopyButton
                      value={card.prompt}
                      variant='outline'
                      size='sm'
                      aria-label={t('Copy prompt: {{title}}', {
                        title: card.title,
                      })}
                    >
                      {t('Copy prompt')}
                    </CopyButton>
                  )}
                  <Link
                    to={startTarget}
                    search={startSearch}
                    onClick={() => {
                      if (card.prompt) {
                        setHandoff(handoffFromPrompt(card.prompt, card.spec))
                      }
                    }}
                    className='text-brand dark:text-brand-on-dark px-2 text-sm font-semibold hover:underline'
                  >
                    {t('Generate with it')}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
