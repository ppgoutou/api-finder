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
import { Film, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useHomeShowcase } from '@/features/home/hooks/use-home-showcase'
import {
  getHomeMediaUrl,
  SHOWCASE_CATEGORY_LABELS,
  SHOWCASE_VIDEOS,
} from '@/features/home/lib/video-home'

import { draftFromGalleryItem } from '../lib/gallery-draft'
import type { StudioDraft } from '../types'

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

function GalleryWorkCard(props: {
  card: GalleryCard
  onReuse: (draft: Partial<StudioDraft>) => void
}) {
  const { t } = useTranslation()
  const card = props.card
  const canReuse = Boolean(card.prompt.trim())

  return (
    <article className='bg-card border-border/60 overflow-hidden rounded-xl border'>
      <div className='bg-muted/40 relative aspect-video'>
        {card.video ? (
          <video
            src={card.video}
            poster={card.poster || undefined}
            controls
            playsInline
            preload='metadata'
            className='size-full bg-black object-contain'
          />
        ) : (
          <div className='text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-xs'>
            <Film className='size-5' aria-hidden />
            {t('No preview')}
          </div>
        )}
      </div>
      <div className='flex flex-col gap-1 p-3'>
        {card.title && (
          <p className='truncate text-sm font-medium'>{card.title}</p>
        )}
        <p className='line-clamp-2 min-h-10 text-sm'>
          {card.prompt || t('Video task')}
        </p>
        <div className='flex items-center gap-2'>
          <p className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
            {[card.spec, card.category].filter(Boolean).join(' · ') ||
              t('Gallery')}
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
 * Curated example videos (admin HomeShowcase, else built-in home clips).
 * Each card can load its prompt and generation parameters into the composer.
 */
export function GalleryList(props: {
  onReuse: (draft: Partial<StudioDraft>) => void
}) {
  const { t } = useTranslation()
  const configured = useHomeShowcase().showcase.filter(
    (item) => item.video || item.prompt
  )
  const cards: GalleryCard[] =
    configured.length > 0
      ? configured.map((item, index) => ({
          key: `${index}:${item.video || item.title || item.prompt}`,
          title: item.title,
          category: item.category,
          prompt: item.prompt,
          spec: item.spec,
          video: item.video,
          poster: item.poster,
          image: item.image,
        }))
      : SHOWCASE_VIDEOS.map((video) => ({
          key: video.name,
          title: t(video.title),
          category: t(SHOWCASE_CATEGORY_LABELS[video.category]),
          prompt: t(video.prompt),
          spec: video.spec,
          video: getHomeMediaUrl(`${video.name}.mp4`),
          poster: getHomeMediaUrl(`${video.name}.jpg`),
          image: '',
        }))

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
              'Example videos appear here once the site showcase is configured.'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
      {cards.map((card) => (
        <GalleryWorkCard key={card.key} card={card} onReuse={props.onReuse} />
      ))}
    </div>
  )
}
