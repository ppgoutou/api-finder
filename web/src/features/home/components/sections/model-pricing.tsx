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
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  staticDataTableClassNames,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import {
  useVideoSeriesPricing,
  type SeriesPriceRow,
  type VideoSeriesPricing,
} from '../../hooks/use-video-series-pricing'

const formatResolution = (option: string) => option.replace(/k$/i, 'K')
const formatPrice = (row: SeriesPriceRow) =>
  row.approximate ? `≈${row.price}` : row.price

export function ModelPricing() {
  const { t } = useTranslation()
  const seriesList = useVideoSeriesPricing()

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
          <div className='mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
            {seriesList.map((series) => (
              <SeriesCard key={series.name} series={series} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

type SeriesCardProps = {
  series: VideoSeriesPricing
}

function SeriesCard(props: SeriesCardProps) {
  const { t } = useTranslation()
  const series = props.series
  const first = series.rows[0]
  const last = series.rows.at(-1)
  const lowest = series.lowest
  // The deepest discount of any resolution, for the headline.
  const bestDiscount = series.rows.reduce<SeriesPriceRow['discount']>(
    (best, row) =>
      row.discount && (!best || row.discount.percentOff > best.percentOff)
        ? row.discount
        : best,
    null
  )

  const specs = [
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

  const columns: StaticDataTableColumn<SeriesPriceRow>[] = [
    {
      id: 'option',
      header: t('Resolution'),
      className: cn(staticDataTableClassNames.compactHeaderCell, 'w-[22%]'),
      cellClassName: 'py-2 font-medium',
      cell: (row) => formatResolution(row.option),
    },
    {
      id: 'price',
      header: t('Lowest per second'),
      className: cn(staticDataTableClassNames.compactHeaderCell, 'w-[26%]'),
      cellClassName:
        'py-2 font-mono font-semibold whitespace-nowrap tabular-nums',
      cell: formatPrice,
    },
    {
      id: 'official',
      header: t('Official price'),
      className: cn(staticDataTableClassNames.compactHeaderCell, 'w-[26%]'),
      cellClassName:
        'text-muted-foreground py-2 font-mono whitespace-nowrap tabular-nums',
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
      className: staticDataTableClassNames.compactHeaderCell,
      cellClassName: 'py-2 whitespace-nowrap',
      cell: (row) =>
        row.discount ? (
          <Badge className='bg-red-600 font-bold text-white dark:bg-red-500'>
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

  return (
    <article className='bg-card border-border/60 flex flex-col rounded-2xl border p-5 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-6'>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='text-lg font-semibold tracking-tight sm:text-xl'>
          {series.name}
        </h3>
        {series.isNew && <Badge>{t('New')}</Badge>}
      </div>
      {series.variants.length > 0 && (
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('Also in the series: {{models}}', {
            models: series.variants.join(' · '),
          })}
        </p>
      )}

      {lowest && (
        <p className='mt-4 flex flex-wrap items-baseline gap-1.5'>
          <span className='text-muted-foreground text-xs'>{t('From')}</span>
          <span className='text-3xl font-bold tracking-tight tabular-nums'>
            {formatPrice(lowest)}
          </span>
          <span className='text-muted-foreground text-sm'>{t('/ second')}</span>
          {bestDiscount && (
            <span className='ml-auto self-center rounded-full bg-gradient-to-r from-red-600 to-orange-500 px-3 py-1 text-sm font-bold whitespace-nowrap text-white shadow-sm shadow-red-500/30'>
              {t('{{percentOff}}% off official prices', {
                percentOff: bestDiscount.percentOff,
                zhe: bestDiscount.zhe,
              })}
            </span>
          )}
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
          tableClassName={cn(
            staticDataTableClassNames.compactTable,
            'table-fixed'
          )}
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
          · {series.perVideo.modelName}
        </p>
      )}
    </article>
  )
}
