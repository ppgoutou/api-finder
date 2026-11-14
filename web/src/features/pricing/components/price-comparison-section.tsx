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

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  formatDynamicUnitPrice,
  formatTaskUsageUnitPrice,
  type DynamicPriceOptions,
} from '../lib/dynamic-price'
import { getConfiguredGroupRatio } from '../lib/model-helpers'
import {
  COMPARISON_ORDER_SECONDS,
  isReferenceVideoFact,
  rowPriceRatio,
  type PriceComparison,
  type PriceComparisonRow,
} from '../lib/price-comparison'
import { evaluateTaskUsageExamples } from '../lib/task-expr'
import { taskEnumLabel } from '../lib/task-price-display'
import {
  getModelDurationRange,
  VIDEO_PRICE_FRACTION_DIGITS,
} from '../lib/video-pricing'
import type { PricingModel } from '../types'

/** Ratios this close to 1 read as the official price. */
const SAME_PRICE_TOLERANCE = 0.005

type PriceComparisonSectionProps = {
  model: PricingModel
  comparison: PriceComparison
  groups: string[]
  groupRatio: Record<string, number>
  priceRate: number
  usdExchangeRate: number
  showRechargePrice: boolean
}

/** Equal-width, centered columns; a phone keeps them within the screen. */
const tableClass = 'table-fixed text-sm'
const headClass =
  'h-auto px-1 py-2 text-center text-xs font-medium whitespace-normal sm:px-2'
const cellClass = 'px-1 py-2.5 text-center whitespace-normal sm:px-2'
const priceCellClass = 'font-mono text-xs tabular-nums sm:text-sm'

function DiscountBadge(props: { ratio: number | undefined }) {
  const { t } = useTranslation()
  if (props.ratio === undefined) {
    return <span className='text-muted-foreground'>-</span>
  }
  if (Math.abs(props.ratio - 1) < SAME_PRICE_TOLERANCE) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('Same as official')}
      </span>
    )
  }
  if (props.ratio > 1) {
    return (
      <span className='text-xs font-medium text-amber-700 dark:text-amber-300'>
        {t('{{percent}}% above official', {
          percent: Math.round((props.ratio - 1) * 100),
        })}
      </span>
    )
  }
  // Chinese reads a discount as "x 折" (price as tenths of the original);
  // other languages read the amount saved.
  const fold = (Math.round(props.ratio * 100) / 10).toString()
  return (
    <span className='bg-success/10 text-success inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap'>
      {t('{{percent}}% off', {
        percent: Math.round((1 - props.ratio) * 100),
        fold,
      })}
    </span>
  )
}

export function PriceComparisonSection(props: PriceComparisonSectionProps) {
  const { t } = useTranslation()
  const groups = props.groups.length > 0 ? props.groups : ['default']
  const durationRange = getModelDurationRange(props.model)
  const referenceRows = props.comparison.rows.filter((row) => row.withVideo)
  const tokenBilled = referenceRows.some(
    (row) => row.ours?.billsReferenceTokens
  )
  const outputSecondsOnly = referenceRows.some(
    (row) => row.ours && !row.ours.billsReferenceTokens
  )

  return (
    <section
      aria-label={t('Price comparison')}
      className='space-y-5'
      data-testid='price-comparison'
    >
      {groups.map((group) => (
        <div key={group} className='space-y-5'>
          {props.groups.length > 1 && <GroupBadge group={group} size='sm' />}
          <GroupComparisonTables
            {...props}
            ratio={getConfiguredGroupRatio(props.groupRatio, group)}
          />
        </div>
      ))}
      <div className='text-muted-foreground space-y-1 text-xs'>
        {durationRange && (
          <p>
            {t('Available durations: {{min}}～{{max}} seconds', {
              min: durationRange[0],
              max: durationRange[1],
            })}
          </p>
        )}
        {tokenBilled && (
          <p>
            {t(
              'Orders with a reference video bill the reference seconds too, at the with-video token price; the per-second price counts one output second.'
            )}
          </p>
        )}
        {outputSecondsOnly && (
          <p>
            {t(
              'Orders with a reference video are billed by output seconds only; their discount compares a whole {{seconds}}s output + {{seconds}}s reference order.',
              { seconds: COMPARISON_ORDER_SECONDS }
            )}
          </p>
        )}
        <p>
          {t(
            'Video tokens per second = width × height × 24 / 1024. Examples assume 16:9; the final charge follows the usage the upstream reports.'
          )}
        </p>
      </div>
    </section>
  )
}

function GroupComparisonTables(
  props: PriceComparisonSectionProps & { ratio: number }
) {
  const { t, i18n } = useTranslation()
  // Prices follow the site currency; re-render when it changes.
  useSystemConfigStore((state) => state.config.currency)
  const siteName = useSystemConfigStore((state) => state.config.systemName)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const optionDefinition =
    props.model.billing_usage_schema?.[props.comparison.optionField]
  const options = (ratio: number): DynamicPriceOptions => ({
    tokenUnit: 'M',
    showRechargePrice: props.showRechargePrice,
    priceRate: props.priceRate,
    usdExchangeRate: props.usdExchangeRate,
    groupRatioMultiplier: ratio,
    fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
  })
  const ours = options(props.ratio)
  const official = options(1)
  const rows = props.comparison.rows

  // Languages with short condition words name both conditions in the header
  // and keep the rows short; the others spell the condition out per row.
  const headerWithout = t('Resolution header without video')
  const headerWith = t('Resolution header with video')
  const rowCondition = (row: PriceComparisonRow) =>
    row.withVideo ? t('Row with video') : t('Row without video')
  const conditionColumn: StaticDataTableColumn<PriceComparisonRow> = {
    id: 'condition',
    header: (
      <>
        {t('Resolution')}
        {headerWithout && ` ${headerWithout}`}
        {headerWith && <VideoText> {headerWith}</VideoText>}
      </>
    ),
    // A phone gives the condition column room for one bracketed label line;
    // wider screens split the four columns evenly.
    className: cn(headClass, 'w-[30%] sm:w-1/4'),
    cellClassName: cellClass,
    cell: (row) => (
      <>
        <span className='inline-block font-medium'>
          {taskEnumLabel(optionDefinition, row.option, i18n.language)}
        </span>
        <span
          className={cn(
            'inline-block whitespace-nowrap',
            // Latin brackets read with a space before them; CJK ones carry
            // their own.
            rowCondition(row).startsWith('(') && 'ms-1'
          )}
        >
          {row.withVideo ? (
            <VideoText>{rowCondition(row)}</VideoText>
          ) : (
            rowCondition(row)
          )}
        </span>
      </>
    ),
  }

  const priceColumns = (
    unit: 'second' | 'perMillion',
    format: (value: number, priceOptions: DynamicPriceOptions) => string
  ): StaticDataTableColumn<PriceComparisonRow>[] => [
    {
      id: 'ours',
      header: (
        <ResponsiveHeader
          short={siteName}
          full={
            unit === 'second'
              ? t('{{site}} price / second', { site: siteName })
              : t('{{site}} price / 1M tokens', { site: siteName })
          }
        />
      ),
      className: headClass,
      cellClassName: cn(cellClass, priceCellClass, 'font-semibold'),
      cell: (row) => {
        const value = row.ours?.[unit]
        return value === undefined ? '-' : format(value, ours)
      },
    },
    {
      id: 'official',
      header: (
        <ResponsiveHeader
          short={t('Official order price')}
          full={
            unit === 'second'
              ? t('Official price / second')
              : t('Official price / 1M tokens')
          }
        />
      ),
      className: headClass,
      cellClassName: cn(cellClass, priceCellClass, 'text-muted-foreground'),
      cell: (row) => {
        const value = row.official?.[unit]
        return value === undefined ? '-' : format(value, official)
      },
    },
    {
      id: 'discount',
      header: t('Discount rate'),
      className: headClass,
      cellClassName: cellClass,
      cell: (row) => (
        <DiscountBadge ratio={rowPriceRatio(row, unit, props.ratio)} />
      ),
    },
  ]

  const tokenRows = rows.filter(
    (row) =>
      row.ours?.perMillion !== undefined ||
      row.official?.perMillion !== undefined
  )
  const tokensPerSecond = [
    ...new Map(
      tokenRows.flatMap((row) =>
        row.tokensPerSecond ? [[row.option, row.tokensPerSecond] as const] : []
      )
    ),
  ]
  const exampleRows = usageExampleRows(props.model)

  return (
    <>
      <ComparisonTable title={t('Per-second prices')}>
        <StaticDataTable
          tableClassName={tableClass}
          headerRowClassName='hover:bg-transparent'
          data={rows}
          getRowKey={(row) => row.key}
          columns={[conditionColumn, ...priceColumns('second', formatTaskUsageUnitPrice)]}
        />
      </ComparisonTable>

      {tokenRows.length > 0 && (
        <ComparisonTable title={t('Per-token prices')}>
          <StaticDataTable
            tableClassName={tableClass}
            headerRowClassName='hover:bg-transparent'
            data={tokenRows}
            getRowKey={(row) => row.key}
            columns={[
              conditionColumn,
              ...priceColumns('perMillion', formatDynamicUnitPrice),
            ]}
          />
          {tokensPerSecond.length > 0 && (
            <p className='text-muted-foreground mt-2 text-xs'>
              {t('Video tokens per second: {{list}}', {
                list: tokensPerSecond
                  .map(
                    ([option, count]) =>
                      `${taskEnumLabel(optionDefinition, option, i18n.language)} ${formatNumber(Math.round(count), locale)}`
                  )
                  .join(' · '),
              })}
            </p>
          )}
        </ComparisonTable>
      )}

      {exampleRows.length > 0 && (
        <ComparisonTable title={t('Price examples')}>
          <StaticDataTable
            tableClassName={tableClass}
            headerRowClassName='hover:bg-transparent'
            data={exampleRows}
            getRowKey={(row) => row.label}
            columns={[
              {
                id: 'spec',
                header: t('Spec'),
                className: headClass,
                cellClassName: cellClass,
                cell: (row) => (
                  // Spec labels wrap rather than truncate on a narrow screen.
                  <span className='break-words'>
                    {row.withVideo ? (
                      <VideoText>{row.label}</VideoText>
                    ) : (
                      <span>{row.label}</span>
                    )}
                  </span>
                ),
              },
              {
                id: 'price',
                header: t('Example price'),
                className: headClass,
                cellClassName: cn(cellClass, priceCellClass),
                cell: (row) => `≈ ${formatTaskUsageUnitPrice(row.total, ours)}`,
              },
            ]}
          />
          <p className='text-muted-foreground mt-2 text-xs'>
            {t('Approximate prices for common specs.')}
          </p>
        </ComparisonTable>
      )}
    </>
  )
}

/**
 * The plugin's display examples priced by the model's expression, marking the
 * ones made from a reference video.
 */
function usageExampleRows(
  model: PricingModel
): { label: string; total: number; withVideo: boolean }[] {
  const examples = model.billing_usage_examples ?? []
  const withVideo = new Map(
    examples.map((example) => [
      example.label,
      Object.entries(example.facts).some(([field, value]) =>
        isReferenceVideoFact(field, value)
      ),
    ])
  )
  return evaluateTaskUsageExamples(
    model.billing_expr,
    model.billing_usage_schema,
    examples
  ).map((row) => ({ ...row, withVideo: withVideo.get(row.label) ?? false }))
}

/** Text about orders made from a reference video, shown in red in every language. */
function VideoText(props: { children: React.ReactNode }) {
  return <span className='text-destructive'>{props.children}</span>
}

/** A short column header on phones and the full one from the `sm` breakpoint. */
function ResponsiveHeader(props: { short: string; full: string }) {
  return (
    <>
      <span className='sm:hidden'>{props.short}</span>
      <span className='hidden sm:inline'>{props.full}</span>
    </>
  )
}

function ComparisonTable(props: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={props.title}>
      <h4 className='text-muted-foreground mb-2 text-xs font-medium'>
        {props.title}
      </h4>
      {props.children}
    </section>
  )
}
