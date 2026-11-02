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
import { Film, Play, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { useStudioGallery } from '../hooks/use-studio-gallery'
import { draftFromGalleryItem } from '../lib/gallery-draft'
import type { StudioDraft } from '../types'

const ALL_CATEGORIES = 'all'

type GalleryCard = {
  key: string
  title: string
  category: string
  prompt: string
  spec: string
  video: string
  poster: string
  image: string
}

function GalleryMedia(props: { card: GalleryCard }) {
  const { t } = useTranslation()
  const card = props.card
  const cover = card.poster.trim() || card.image.trim()
  const [playing, setPlaying] = useState(false)

  if (playing && card.video) {
    return (
      <video
        src={card.video}
        poster={cover || undefined}
        controls
        playsInline
        autoPlay
        preload='metadata'
        className='h-auto w-full bg-black'
      />
    )
  }

  if (cover) {
    return (
      <button
        type='button'
        className='relative block w-full'
        onClick={() => {
          if (card.video) setPlaying(true)
        }}
        disabled={!card.video}
        aria-label={
          card.video
            ? t('Play {{title}} with sound', {
                title: card.title || t('Video preview'),
              })
            : card.title || t('Video preview')
        }
      >
        <img
          src={cover}
          alt={card.title || t('Video preview')}
          className='h-auto w-full'
        />
        {card.video && (
          <span className='pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20'>
            <span className='bg-background/90 text-foreground flex size-11 items-center justify-center rounded-full shadow'>
              <Play className='size-5 fill-current' aria-hidden />
            </span>
          </span>
        )}
      </button>
    )
  }

  if (card.video) {
    return (
      <video
        src={card.video}
        controls
        playsInline
        preload='metadata'
        className='h-auto w-full bg-black'
      />
    )
  }

  return (
    <div className='text-muted-foreground flex min-h-28 w-full flex-col items-center justify-center gap-1 bg-muted/40 px-3 py-8 text-xs'>
      <Film className='size-5' aria-hidden />
      {t('No preview')}
    </div>
  )
}

function GalleryWorkCard(props: {
  card: GalleryCard
  onReuse: (draft: Partial<StudioDraft>) => void
}) {
  const { t } = useTranslation()
  const card = props.card
  const canReuse = Boolean(card.prompt.trim())

  return (
    <article className='bg-card border-border/60 mb-4 break-inside-avoid overflow-hidden rounded-xl border'>
      <div className='bg-muted/40 relative w-full overflow-hidden'>
        <GalleryMedia card={card} />
      </div>
      <div className='flex flex-col gap-1 p-3'>
        {card.title && <p className='text-sm font-medium'>{card.title}</p>}
        <p className='text-muted-foreground line-clamp-3 text-sm'>
          {card.prompt || t('Video task')}
        </p>
        <div className='flex items-center gap-2 pt-1'>
          <p className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
            {card.spec || t('Gallery')}
          </p>
          {canReuse && (
            <Button
              variant='secondary'
              size='sm'
              className='shrink-0'
              onClick={() =>
                props.onReuse(
                  draftFromGalleryItem({
                    prompt: card.prompt,
                    spec: card.spec,
                    image: card.image,
                  })
                )
              }
              aria-label={t('Use this work: {{title}}', {
                title: card.title || card.prompt,
              })}
              title={t('Use this work')}
            >
              <Sparkles className='size-3.5' aria-hidden />
              {t('Use this work')}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * Curated studio gallery works from the admin StudioGallery option.
 * Category filters sit under the gallery tab; covers keep their natural size.
 */
export function GalleryList(props: {
  onReuse: (draft: Partial<StudioDraft>) => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const cards: GalleryCard[] = useStudioGallery()
    .items.filter((item) => item.video || item.prompt || item.poster)
    .map((item, index) => ({
      key: `${index}:${item.video || item.poster || item.title || item.prompt}`,
      title: item.title,
      category: item.category,
      prompt: item.prompt,
      spec: item.spec,
      video: item.video,
      poster: item.poster,
      image: item.image,
    }))

  const categories = [
    ...new Set(cards.map((card) => card.category).filter(Boolean)),
  ]
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

  if (cards.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Film aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('No gallery works yet')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Example videos appear here once the studio gallery is configured in site settings.'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
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
      {visibleCards.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Film aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('No gallery works yet')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='columns-1 gap-4 sm:columns-2 xl:columns-3'>
          {visibleCards.map((card) => (
            <GalleryWorkCard
              key={card.key}
              card={card}
              onReuse={props.onReuse}
            />
          ))}
        </div>
      )}
    </div>
  )
}
