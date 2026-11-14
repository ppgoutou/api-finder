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
  comparisonOrderCost,
  priceRatio,
  rowPriceRatio,
  type PriceComparison,
  type PriceComparisonRow,
} from '../lib/price-comparison'
import { taskEnumLabel } from '../lib/task-price-display'
import {
  getModelDurationRange,
  VIDEO_PRICE_FRACTION_DIGITS,
} from '../lib/video-pricing'
import type { PricingModel } from '../types'

/** Example orders: a 5 s video, and a 5 s video made from a 5 s reference. */
const EXAMPLE_OUTPUT_SECONDS = COMPARISON_ORDER_SECONDS
const EXAMPLE_REFERENCE_SECONDS = COMPARISON_ORDER_SECONDS

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

type ExampleRow = PriceComparisonRow & {
  ourCost?: number
  officialCost?: number
}

const headClass =
  'h-auto px-1.5 py-2 text-xs font-medium whitespace-normal sm:px-2'
const priceCellClass = 'px-1.5 font-mono text-xs tabular-nums sm:px-2 sm:text-sm'

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

  const conditionCell = (
    row: PriceComparisonRow,
    detail?: React.ReactNode
  ) => (
    <div className='flex min-w-0 flex-col'>
      <span className='font-medium whitespace-nowrap'>
        {taskEnumLabel(optionDefinition, row.option, i18n.language)}
      </span>
      <span className='text-muted-foreground text-[11px] leading-tight whitespace-nowrap sm:text-xs'>
        {row.withVideo ? t('With video input') : t('Without video input')}
      </span>
      {detail}
    </div>
  )

  const conditionColumn = <TRow extends PriceComparisonRow>(
    detail?: (row: TRow) => React.ReactNode
  ): StaticDataTableColumn<TRow> => ({
    id: 'condition',
    header: t('Resolution'),
    className: headClass,
    cellClassName: 'px-1.5 py-2.5 align-top whitespace-normal sm:px-2',
    cell: (row) => conditionCell(row, detail?.(row)),
  })

  const priceColumns = <TRow extends PriceComparisonRow>(
    unit: 'second' | 'perMillion',
    ourValue: (row: TRow) => number | undefined,
    officialValue: (row: TRow) => number | undefined,
    format: (value: number, priceOptions: DynamicPriceOptions) => string
  ): StaticDataTableColumn<TRow>[] => [
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
      cellClassName: cn(priceCellClass, 'font-semibold'),
      cell: (row) => {
        const value = ourValue(row)
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
      cellClassName: cn(priceCellClass, 'text-muted-foreground'),
      cell: (row) => {
        const value = officialValue(row)
        return value === undefined ? '-' : format(value, official)
      },
    },
    {
      id: 'discount',
      header: t('Discount rate'),
      className: headClass,
      cellClassName: 'px-1.5 py-2.5 sm:px-2',
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
  const exampleRows: ExampleRow[] = rows.map((row) => {
    const referenceSeconds = row.withVideo ? EXAMPLE_REFERENCE_SECONDS : 0
    return {
      ...row,
      ourCost: comparisonOrderCost(
        row.ours,
        row.tokensPerSecond,
        EXAMPLE_OUTPUT_SECONDS,
        referenceSeconds
      ),
      officialCost: comparisonOrderCost(
        row.official,
        row.tokensPerSecond,
        EXAMPLE_OUTPUT_SECONDS,
        referenceSeconds
      ),
    }
  })

  return (
    <>
      <ComparisonTable title={t('Per-second prices')}>
        <StaticDataTable
          tableClassName='text-sm'
          headerRowClassName='hover:bg-transparent'
          data={rows}
          getRowKey={(row) => row.key}
          columns={[
            conditionColumn<PriceComparisonRow>(),
            ...priceColumns<PriceComparisonRow>(
              'second',
              (row) => row.ours?.second,
              (row) => row.official?.second,
              formatTaskUsageUnitPrice
            ),
          ]}
        />
      </ComparisonTable>

      {tokenRows.length > 0 && (
        <ComparisonTable title={t('Per-token prices')}>
          <StaticDataTable
            tableClassName='text-sm'
            headerRowClassName='hover:bg-transparent'
            data={tokenRows}
            getRowKey={(row) => row.key}
            columns={[
              conditionColumn<PriceComparisonRow>((row) =>
                row.tokensPerSecond ? (
                  <span className='text-muted-foreground font-mono text-[11px] leading-tight tabular-nums'>
                    {t('{{count}} tokens per second', {
                      count: formatNumber(Math.round(row.tokensPerSecond), locale),
                    })}
                  </span>
                ) : null
              ),
              ...priceColumns<PriceComparisonRow>(
                'perMillion',
                (row) => row.ours?.perMillion,
                (row) => row.official?.perMillion,
                formatDynamicUnitPrice
              ),
            ]}
          />
        </ComparisonTable>
      )}

      <ComparisonTable title={t('Example prices')}>
        <StaticDataTable
          tableClassName='text-sm'
          headerRowClassName='hover:bg-transparent'
          data={exampleRows}
          getRowKey={(row) => row.key}
          columns={[
            conditionColumn<ExampleRow>((row) => (
              <span className='text-muted-foreground text-[11px] leading-tight sm:text-xs'>
                {row.withVideo
                  ? t('{{output}}s output + {{reference}}s reference video', {
                      output: EXAMPLE_OUTPUT_SECONDS,
                      reference: EXAMPLE_REFERENCE_SECONDS,
                    })
                  : t('{{seconds}}s output', {
                      seconds: EXAMPLE_OUTPUT_SECONDS,
                    })}
              </span>
            )),
            {
              id: 'ours',
              header: (
                <ResponsiveHeader
                  short={siteName}
                  full={t('{{site}} price', { site: siteName })}
                />
              ),
              className: headClass,
              cellClassName: cn(priceCellClass, 'font-semibold'),
              cell: (row) =>
                row.ourCost === undefined
                  ? '-'
                  : formatTaskUsageUnitPrice(row.ourCost, ours),
            },
            {
              id: 'official',
              header: t('Official order price'),
              className: headClass,
              cellClassName: cn(priceCellClass, 'text-muted-foreground'),
              cell: (row) =>
                row.officialCost === undefined
                  ? '-'
                  : formatTaskUsageUnitPrice(row.officialCost, official),
            },
            {
              id: 'discount',
              header: t('Discount rate'),
              className: headClass,
              cellClassName: 'px-1.5 py-2.5 sm:px-2',
              cell: (row) => (
                <DiscountBadge
                  ratio={priceRatio(
                    row.ourCost === undefined
                      ? undefined
                      : row.ourCost * props.ratio,
                    row.officialCost
                  )}
                />
              ),
            },
          ]}
        />
      </ComparisonTable>
    </>
  )
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
