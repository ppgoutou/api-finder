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
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  staticDataTableClassNames,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
} from '@/components/ui/carousel'
import { useModelDisplayName } from '@/features/pricing/hooks'
import { cn } from '@/lib/utils'

import {
  useVideoSeriesPricing,
  type SeriesPriceRow,
  type VideoSeriesPricing,
} from '../../hooks/use-video-series-pricing'

const formatResolution = (option: string) => option.replace(/k$/i, 'K')
const formatPrice = (row: SeriesPriceRow) =>
  row.approximate ? `≈${row.price}` : row.price
// Short header words keep every language on one line in the narrowest card.
const HEADER_CELL =
  'text-muted-foreground h-auto px-1 py-2 text-[11px]! leading-tight font-medium whitespace-nowrap'

/** The deepest discount of any resolution, for the card headline. */
function getBestDiscount(series: VideoSeriesPricing) {
  return series.rows.reduce<SeriesPriceRow['discount']>(
    (best, row) =>
      row.discount && (!best || row.discount.percentOff > best.percentOff)
        ? row.discount
        : best,
    null
  )
}

export function ModelPricing() {
  const { t } = useTranslation()
  const seriesList = useVideoSeriesPricing()
  // Cards share one height and one layout: a slot one card fills is kept
  // open on the others, so their tables start at the same height.
  const showOfficialPrice = seriesList.some((series) =>
    series.rows.some((row) => row.officialPrice)
  )
  const reserveDiscount = seriesList.some((series) => getBestDiscount(series))
  const reserveVariants = seriesList.some(
    (series) => series.variants.length > 0
  )

  return (
    <section
      id='pricing'
      className='relative z-10 scroll-mt-20 px-6 py-14 md:py-20'
    >
      <div className='mx-auto max-w-6xl'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <p className='text-brand dark:text-brand-on-dark mb-2 text-sm font-semibold'>
              {t('Models and pricing')}
            </p>
            <h2 className='text-3xl font-bold tracking-tight md:text-4xl'>
              {t('Billed per second, as low as half the official price')}
            </h2>
            <p className='text-muted-foreground mt-3 max-w-2xl'>
              {t(
                'No monthly fee or minimum spend: pay only for what you generate. Each resolution shows the cheapest model in the series.'
              )}
            </p>
          </div>
          <Link
            to='/pricing'
            className='group text-brand dark:text-brand-on-dark inline-flex items-center text-sm font-semibold hover:underline'
          >
            {t('See prices in the model square')}
            <ArrowRight
              aria-hidden='true'
              className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5'
            />
          </Link>
        </div>

        {seriesList.length > 0 && (
          <Carousel
            className='mt-8'
            opts={{ align: 'start', containScroll: 'trimSnaps' }}
            aria-label={t('Models and pricing')}
          >
            <CarouselContent className='-ml-4 sm:-ml-5'>
              {seriesList.map((series) => (
                <CarouselItem
                  key={series.name}
                  // One card per screen on phones with the next one peeking,
                  // two on tablets, three on desktops; the rest slide in.
                  className='flex basis-[92%] pl-4 sm:basis-1/2 sm:pl-5 lg:basis-1/3'
                >
                  <SeriesCard
                    series={series}
                    showOfficialPrice={showOfficialPrice}
                    reserveDiscount={reserveDiscount}
                    reserveVariants={reserveVariants}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <SeriesCarouselControls />
          </Carousel>
        )}
      </div>
    </section>
  )
}

/**
 * Arrows and position dots under the cards, shown only when some cards are
 * off screen.
 */
function SeriesCarouselControls() {
  const carousel = useCarousel()
  const api = carousel.api
  const [snaps, setSnaps] = useState<number[]>([])
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (!api) return
    const sync = () => {
      setSnaps(api.scrollSnapList())
      setSelected(api.selectedScrollSnap())
    }
    sync()
    // Resizing changes how many cards fit, and with it the snap count.
    api.on('select', sync).on('reInit', sync).on('resize', sync)
    return () => {
      api.off('select', sync).off('reInit', sync).off('resize', sync)
    }
  }, [api])

  if (snaps.length < 2) return null
  return (
    <div className='mt-6 flex items-center justify-center gap-3'>
      <CarouselPrevious className='static translate-y-0' />
      <div className='flex items-center gap-1.5'>
        {snaps.map((snap, index) => (
          <button
            key={snap}
            type='button'
            aria-label={`${index + 1} / ${snaps.length}`}
            aria-current={index === selected}
            onClick={() => api?.scrollTo(index)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-200',
              index === selected
                ? 'bg-foreground w-5'
                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50 w-1.5'
            )}
          />
        ))}
      </div>
      <CarouselNext className='static translate-y-0' />
    </div>
  )
}

type SeriesCardProps = {
  series: VideoSeriesPricing
  /** Show the official price and discount columns. */
  showOfficialPrice: boolean
  /** Keep room for the headline discount even when this card has none. */
  reserveDiscount: boolean
  /** Keep room for the variants line even when this card has none. */
  reserveVariants: boolean
}

function SeriesCard(props: SeriesCardProps) {
  const { t } = useTranslation()
  const displayName = useModelDisplayName()
  const series = props.series
  const first = series.rows[0]
  const last = series.rows.at(-1)
  const lowest = series.lowest
  const bestDiscount = getBestDiscount(series)
  const isImage = series.unit === 'image'

  const specs = isImage
    ? [t('{{count}} models', { count: series.rows.length })]
    : [
        first && last && first !== last
          ? `${formatResolution(first.option)}–${formatResolution(last.option)}`
          : first && formatResolution(first.option),
        series.durationRange &&
          t('{{min}}–{{max}} seconds', {
            min: series.durationRange[0],
            max: series.durationRange[1],
          }),
        series.aspectRatioCount > 0 &&
          t('{{count}} ratios', { count: series.aspectRatioCount }),
      ].filter((spec): spec is string => Boolean(spec))

  const allColumns: StaticDataTableColumn<SeriesPriceRow>[] = [
    {
      id: 'option',
      header: isImage ? t('Model') : t('Resolution'),
      className: HEADER_CELL,
      cellClassName: isImage
        ? 'px-1 py-2 font-medium break-all'
        : 'px-1 py-2 font-medium',
      cell: (row) =>
        isImage ? displayName(row.modelName) : formatResolution(row.option),
    },
    {
      id: 'price',
      header: isImage ? t('Price / image') : t('Price / s'),
      className: HEADER_CELL,
      cellClassName:
        'px-1 py-2 font-mono font-semibold whitespace-nowrap tabular-nums',
      cell: formatPrice,
    },
    {
      id: 'official',
      header: t('List price'),
      className: HEADER_CELL,
      cellClassName:
        'text-muted-foreground px-1 py-2 font-mono whitespace-nowrap tabular-nums',
      cell: (row) =>
        row.officialPrice ? (
          <span className='line-through'>{row.officialPrice}</span>
        ) : (
          '—'
        ),
    },
    {
      id: 'discount',
      header: t('Discount'),
      className: HEADER_CELL,
      cellClassName: 'px-1 py-2 whitespace-nowrap',
      cell: (row) =>
        row.discount ? (
          <Badge className='bg-red-600 px-1.5 text-[11px] font-bold text-white dark:bg-red-500'>
            {t('{{percentOff}}% off', {
              percentOff: row.discount.percentOff,
              zhe: row.discount.zhe,
            })}
          </Badge>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
  ]
  // Without any configured official price the two comparison columns would
  // only hold dashes, so the tables keep resolution and price alone. Image
  // models have no official price to compare with.
  const columns =
    props.showOfficialPrice && !isImage
      ? allColumns
      : allColumns.filter(
          (column) => column.id !== 'official' && column.id !== 'discount'
        )

  return (
    <article className='bg-card border-border/60 flex w-full flex-col rounded-2xl border p-4 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-6 lg:p-5'>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='text-lg font-semibold tracking-tight sm:text-xl'>
          {series.name}
        </h3>
        {series.isNew && <Badge>{t('New')}</Badge>}
      </div>
      {series.variants.length > 0 ? (
        <p className='text-muted-foreground mt-1 min-h-4 text-xs'>
          {t('Also in the series: {{models}}', {
            models: series.variants.join(' · '),
          })}
        </p>
      ) : (
        props.reserveVariants && <div aria-hidden='true' className='mt-1 h-4' />
      )}

      {lowest && (
        <p className='mt-4 flex flex-wrap items-baseline gap-1.5'>
          <span className='text-muted-foreground text-xs'>{t('From')}</span>
          <span className='text-3xl font-bold tracking-tight tabular-nums'>
            {formatPrice(lowest)}
          </span>
          <span className='text-muted-foreground text-sm'>
            {isImage ? t('/ image') : t('/ second')}
          </span>
        </p>
      )}
      {!bestDiscount && props.reserveDiscount && (
        <div aria-hidden='true' className='mt-2 h-7' />
      )}
      {bestDiscount && (
        <p className='mt-2 min-h-7 w-fit max-w-full rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-3 py-1 text-sm leading-snug font-bold text-white shadow-sm shadow-red-500/30'>
          {t('{{percentOff}}% off official prices', {
            percentOff: bestDiscount.percentOff,
            zhe: bestDiscount.zhe,
          })}
        </p>
      )}

      {specs.length > 0 && (
        <ul className='mt-3 flex flex-wrap gap-1.5'>
          {specs.map((spec) => (
            <li key={spec}>
              <Badge variant='secondary'>{spec}</Badge>
            </li>
          ))}
        </ul>
      )}

      {series.rows.length > 0 && (
        <StaticDataTable
          className={cn(staticDataTableClassNames.sectionContainer, 'mt-5')}
          tableClassName={staticDataTableClassNames.compactTable}
          headerRowClassName={staticDataTableClassNames.mutedHeaderRow}
          getRowClassName={() => 'h-auto!'}
          columns={columns}
          data={series.rows}
          getRowKey={(row) => row.option}
        />
      )}

      {series.perVideo && (
        <p className='text-muted-foreground mt-auto pt-4 text-xs'>
          {t('Per video')}{' '}
          <span className='text-foreground font-mono font-semibold'>
            {t('{{price}} / video', { price: series.perVideo.price })}
          </span>{' '}
          · {displayName(series.perVideo.modelName)}
        </p>
      )}
    </article>
  )
}
