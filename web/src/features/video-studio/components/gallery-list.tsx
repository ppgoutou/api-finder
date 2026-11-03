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
import { Film, Play, ScrollText, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useStatus } from '@/hooks/use-status'

import { useStudioGallery } from '../hooks/use-studio-gallery'
import { useStudioModels } from '../hooks/use-studio-models'
import { draftFromGalleryItem, parseGallerySpec } from '../lib/gallery-draft'
import {
  DEFAULT_GALLERY_RATIO,
  masonryColumns,
  specAspectRatio,
} from '../lib/gallery-masonry'
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

function galleryCover(card: GalleryCard): string {
  return card.poster.trim() || card.image.trim()
}

/**
 * Cover of a work in a box of its own width / height, so portrait and
 * landscape works keep their shape. Reports the media's real ratio once
 * known; a click opens the work's details.
 */
function GalleryTile(props: {
  card: GalleryCard
  ratio: number
  onRatio: (ratio: number) => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const card = props.card
  const cover = galleryCover(card)
  const label = card.title || t('Video preview')

  let media
  if (cover) {
    media = (
      <img
        src={cover}
        alt={label}
        loading='lazy'
        className='size-full object-cover'
        onLoad={(event) => {
          const image = event.currentTarget
          if (image.naturalWidth && image.naturalHeight) {
            props.onRatio(image.naturalWidth / image.naturalHeight)
          }
        }}
      />
    )
  } else if (card.video) {
    media = (
      <video
        src={card.video}
        muted
        playsInline
        preload='metadata'
        className='size-full bg-black object-cover'
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (video.videoWidth && video.videoHeight) {
            props.onRatio(video.videoWidth / video.videoHeight)
          }
        }}
      />
    )
  } else {
    media = (
      <span className='text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-xs'>
        <Film className='size-5' aria-hidden />
        {t('No preview')}
      </span>
    )
  }

  return (
    <button
      type='button'
      className='bg-muted/40 group relative block w-full overflow-hidden'
      style={{ aspectRatio: props.ratio }}
      onClick={props.onOpen}
      aria-label={t('View details: {{title}}', { title: label })}
    >
      {media}
      {card.video && (
        <span className='pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25'>
          <span className='bg-background/90 text-foreground flex size-10 items-center justify-center rounded-full shadow'>
            <Play className='size-4 fill-current' aria-hidden />
          </span>
        </span>
      )}
    </button>
  )
}

function GalleryWorkCard(props: {
  card: GalleryCard
  ratio: number
  onRatio: (ratio: number) => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const card = props.card

  return (
    <article className='bg-card border-border/60 overflow-hidden rounded-xl border'>
      <GalleryTile
        card={card}
        ratio={props.ratio}
        onRatio={props.onRatio}
        onOpen={props.onOpen}
      />
      <div className='flex items-end gap-2 p-3'>
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          {card.title && (
            <p className='line-clamp-2 text-sm font-medium'>{card.title}</p>
          )}
          <p className='text-muted-foreground truncate text-xs'>
            {card.spec || t('Gallery')}
          </p>
        </div>
        {card.prompt.trim() && (
          <Button
            variant='secondary'
            size='sm'
            className='shrink-0'
            onClick={props.onOpen}
            aria-label={t('View prompt: {{title}}', {
              title: card.title || card.spec || t('Gallery'),
            })}
          >
            <ScrollText className='size-3.5' aria-hidden />
            {t('Prompt words')}
          </Button>
        )}
      </div>
    </article>
  )
}

/**
 * Details of one gallery work: the clip beside its prompt and parameters,
 * with one action that takes the prompt into the composer.
 */
function GalleryDetailsDialog(props: {
  card: GalleryCard | null
  onOpenChange: (open: boolean) => void
  onUsePrompt: (card: GalleryCard) => void
}) {
  const { t } = useTranslation()
  const card = props.card
  const spec = parseGallerySpec(card?.spec ?? '')
  const params = [
    { label: t('Model'), value: spec.model },
    { label: t('Resolution'), value: spec.resolution },
    { label: t('Aspect ratio'), value: spec.ratio },
    {
      label: t('Video duration'),
      value: spec.seconds === undefined ? undefined : `${spec.seconds}s`,
    },
  ].filter((param) => param.value)
  const cover = card ? galleryCover(card) : ''

  let media = null
  if (card?.video) {
    media = (
      <video
        key={card.key}
        src={card.video}
        poster={cover || undefined}
        controls
        autoPlay
        playsInline
        preload='metadata'
        className='max-h-[70vh] w-full object-contain'
      />
    )
  } else if (cover) {
    media = (
      <img
        src={cover}
        alt={card?.title || t('Video preview')}
        className='max-h-[70vh] w-full object-contain'
      />
    )
  }

  return (
    <Dialog
      open={card !== null}
      onOpenChange={props.onOpenChange}
      title={card?.title || t('Video details')}
      contentClassName='sm:max-w-5xl'
    >
      {card && (
        <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]'>
          <div className='flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-black'>
            {media ?? (
              <span className='text-muted-foreground flex flex-col items-center gap-1 text-xs'>
                <Film className='size-5' aria-hidden />
                {t('No preview')}
              </span>
            )}
          </div>
          <div className='flex min-w-0 flex-col gap-4'>
            {card.prompt.trim() && (
              <section className='flex flex-col gap-2'>
                <h3 className='text-muted-foreground text-sm font-medium'>
                  {t('Prompt words')}
                </h3>
                <p className='bg-muted/50 max-h-64 overflow-y-auto rounded-lg p-3 text-sm leading-relaxed break-words whitespace-pre-wrap'>
                  {card.prompt}
                </p>
              </section>
            )}
            {params.length > 0 && (
              <section className='flex flex-col gap-2'>
                <h3 className='text-muted-foreground text-sm font-medium'>
                  {t('Parameters')}
                </h3>
                <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm'>
                  {params.map((param) => (
                    <div key={param.label} className='contents'>
                      <dt className='text-muted-foreground'>{param.label}</dt>
                      <dd className='truncate text-end font-medium'>
                        {param.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {card.prompt.trim() && (
              <Button
                className='mt-auto w-full'
                onClick={() => props.onUsePrompt(card)}
              >
                <Sparkles className='size-4' aria-hidden />
                {t('Use prompt')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Curated studio gallery works from the admin StudioGallery option.
 * Category filters sit under the gallery tab. Works fill 2–4 columns in
 * reading order, each tile keeping its own width / height; a card shows the
 * title and parameters, and the clip, prompt and parameters open in a dialog.
 */
export function GalleryList(props: {
  onReuse: (draft: Partial<StudioDraft>) => void
}) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const models = useStudioModels()
  const studio = {
    serverAddress:
      (status?.server_address as string | undefined) || window.location.origin,
    models,
  }
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [openCard, setOpenCard] = useState<GalleryCard | null>(null)
  const wide = useMediaQuery('(min-width: 1024px)')
  const medium = useMediaQuery('(min-width: 768px)')
  let columnCount = 2
  if (wide) columnCount = 4
  else if (medium) columnCount = 3
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
  const ratioOf = (card: GalleryCard) =>
    ratios[card.key] ?? specAspectRatio(card.spec) ?? DEFAULT_GALLERY_RATIO
  const columns = masonryColumns(visibleCards.map(ratioOf), columnCount)

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
        <div className='grid grid-cols-2 items-start gap-3 md:grid-cols-3 lg:grid-cols-4'>
          {/* Empty columns only trail a gallery shorter than one row. */}
          {columns
            .filter((column) => column.length > 0)
            .map((column) => (
              <div
                key={column.map((index) => visibleCards[index].key).join('|')}
                className='flex min-w-0 flex-col gap-3'
              >
                {column.map((index) => {
                  const card = visibleCards[index]
                  return (
                    <GalleryWorkCard
                      key={card.key}
                      card={card}
                      ratio={ratioOf(card)}
                      onRatio={(ratio) =>
                        setRatios((current) =>
                          Math.abs((current[card.key] ?? 0) - ratio) < 0.01
                            ? current
                            : { ...current, [card.key]: ratio }
                        )
                      }
                      onOpen={() => setOpenCard(card)}
                    />
                  )
                })}
              </div>
            ))}
        </div>
      )}
      <GalleryDetailsDialog
        card={openCard}
        onOpenChange={(open) => {
          if (!open) setOpenCard(null)
        }}
        onUsePrompt={(card) => {
          setOpenCard(null)
          props.onReuse(
            draftFromGalleryItem(
              { prompt: card.prompt, spec: card.spec, image: card.image },
              studio
            )
          )
        }}
      />
    </div>
  )
}
