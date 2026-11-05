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
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  formatDynamicUnitPrice,
  formatTaskUsageUnitPrice,
  type DynamicPriceOptions,
} from '../lib/dynamic-price'
import { getConfiguredGroupRatio } from '../lib/model-helpers'
import { taskEnumLabel } from '../lib/task-price-display'
import {
  getReferenceOrderExample,
  VIDEO_PRICE_FRACTION_DIGITS,
  type VideoPricing,
  type VideoPricingRow,
} from '../lib/video-pricing'
import type { PricingModel } from '../types'

/** Worked example shown under the group table: 5s reference, 15s 720p output. */
const EXAMPLE_REFERENCE_SECONDS = 5
const EXAMPLE_OUTPUT_SECONDS = 15
const EXAMPLE_OPTION = '720p'

type VideoPricingTablesProps = {
  model: PricingModel
  /** Charged price; the group table multiplies it by each group ratio. */
  pricing: VideoPricing
  /** Vendor's published price shown above the group table; hidden when absent. */
  officialPricing: VideoPricing | null
  groups: string[]
  groupRatio: Record<string, number>
  priceRate: number
  usdExchangeRate: number
  showRechargePrice: boolean
}

type GroupRow = VideoPricingRow & { group: string; ratio: number }

export function VideoPricingTables(props: VideoPricingTablesProps) {
  const { t, i18n } = useTranslation()
  // Prices are formatted in the site currency; re-render when it changes.
  useSystemConfigStore((state) => state.config.currency)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const optionDefinition =
    props.model.billing_usage_schema?.[props.pricing.optionField]
  const priceOptions = (ratio: number): DynamicPriceOptions => ({
    tokenUnit: 'M',
    showRechargePrice: props.showRechargePrice,
    priceRate: props.priceRate,
    usdExchangeRate: props.usdExchangeRate,
    groupRatioMultiplier: ratio,
    fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
  })

  function columns<TRow extends VideoPricingRow>(
    pricing: VideoPricing,
    ratioOf: (row: TRow) => number
  ): StaticDataTableColumn<TRow>[] {
    const range = pricing.durationRange
    const list: StaticDataTableColumn<TRow>[] = [
      {
        id: 'option',
        header: t('Resolution'),
        cell: (row) =>
          taskEnumLabel(optionDefinition, row.option, i18n.language),
      },
      {
        id: 'second',
        header: t('Price per second'),
        cellClassName: 'font-mono tabular-nums',
        cell: (row) =>
          formatTaskUsageUnitPrice(row.secondPrice, priceOptions(ratioOf(row))),
      },
    ]
    if (pricing.hasReferencePricing) {
      list.push({
        id: 'reference',
        header: t('Reference video order price'),
        cell: (row) => {
          if (row.referenceSecondPrice !== undefined) {
            return (
              <span className='font-mono tabular-nums'>
                {formatTaskUsageUnitPrice(
                  row.referenceSecondPrice,
                  priceOptions(ratioOf(row))
                )}
                {t('/second')}
              </span>
            )
          }
          if (row.referencePricePerMillion === undefined) return '-'
          return (
            <div className='flex flex-col'>
              <span className='font-mono tabular-nums'>
                {t('{{price}} / 1M tokens', {
                  price: formatDynamicUnitPrice(
                    row.referencePricePerMillion,
                    priceOptions(ratioOf(row))
                  ),
                })}
              </span>
              {row.tokensPerSecond !== undefined && (
                <span className='text-muted-foreground font-mono text-xs tabular-nums'>
                  {t('{{count}} tokens per second', {
                    count: formatNumber(row.tokensPerSecond, locale),
                  })}
                </span>
              )}
            </div>
          )
        },
      })
    }
    if (range) {
      list.push({
        id: 'duration',
        header: t('Available durations (seconds)'),
        cellClassName: 'font-mono tabular-nums',
        cell: () => `${range[0]}～${range[1]}`,
      })
    }
    return list
  }

  function referenceNotes(pricing: VideoPricing) {
    if (pricing.rows.some((row) => row.referenceSecondPrice !== undefined)) {
      return (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'With reference videos, only the output seconds are billed, at the reference price.'
          )}
        </p>
      )
    }
    return (
      <div className='text-muted-foreground mt-2 space-y-1 text-xs'>
        <p>
          {t(
            'Reference video tokens = seconds × width × height × 24 / 1024 (by output resolution)'
          )}
        </p>
        <p>
          {t(
            'With reference videos, the whole order (output + reference seconds) is billed at the reference price. References shorter than 2/3 of the output count as 2/3, rounded up to whole seconds.'
          )}
        </p>
      </div>
    )
  }

  const groupRows: GroupRow[] = props.groups.flatMap((group) => {
    const ratio = getConfiguredGroupRatio(props.groupRatio, group)
    return props.pricing.rows.map((row) => ({ ...row, group, ratio }))
  })
  const example = getReferenceOrderExample(
    props.pricing,
    EXAMPLE_REFERENCE_SECONDS,
    EXAMPLE_OUTPUT_SECONDS,
    EXAMPLE_OPTION
  )

  return (
    <>
      {props.officialPricing && (
        <section>
          <h4 className='text-muted-foreground mb-2 text-xs font-medium'>
            {t('Official Price')}
          </h4>
          <StaticDataTable
            tableClassName='text-sm'
            headerRowClassName='hover:bg-transparent'
            data={props.officialPricing.rows}
            getRowKey={(row) => row.option}
            columns={columns<VideoPricingRow>(props.officialPricing, () => 1)}
          />
          {props.officialPricing.hasReferencePricing &&
            referenceNotes(props.officialPricing)}
        </section>
      )}
      {groupRows.length > 0 && (
        <section>
          <h4 className='text-muted-foreground mb-2 text-xs font-medium'>
            {t('Pricing by Group')}
          </h4>
          <StaticDataTable
            tableClassName='text-sm'
            headerRowClassName='hover:bg-transparent'
            data={groupRows}
            getRowKey={(row) => `${row.group}-${row.option}`}
            columns={[
              {
                id: 'group',
                header: t('Group'),
                cell: (row) => <GroupBadge group={row.group} size='sm' />,
              },
              ...columns<GroupRow>(props.pricing, (row) => row.ratio),
            ]}
          />
          {props.pricing.hasReferencePricing && referenceNotes(props.pricing)}
          {example &&
            props.groups.map((group) => {
              const options = priceOptions(
                getConfiguredGroupRatio(props.groupRatio, group)
              )
              return (
                <p
                  key={group}
                  className='bg-muted/30 text-muted-foreground mt-2 rounded-md px-3 py-2 text-xs'
                >
                  {t(
                    'Example ({{group}}): {{reference}}s reference video, {{output}}s {{resolution}} output. Reference seconds = max({{reference}}, ⌈{{output}} × 2/3⌉) = {{billedReference}}s; tokens = ({{output}} + {{billedReference}}) × {{tokensPerSecond}} = {{tokens}}; cost = {{tokens}} × {{price}} / 1M tokens = {{cost}}',
                    {
                      group,
                      reference: example.referenceSeconds,
                      output: example.outputSeconds,
                      resolution: taskEnumLabel(
                        optionDefinition,
                        example.option,
                        i18n.language
                      ),
                      billedReference: example.billedReferenceSeconds,
                      tokensPerSecond: formatNumber(
                        example.tokensPerSecond,
                        locale
                      ),
                      tokens: formatNumber(example.tokens, locale),
                      price: formatDynamicUnitPrice(
                        example.pricePerMillion,
                        options
                      ),
                      cost: formatTaskUsageUnitPrice(example.cost, options),
                      interpolation: { escapeValue: false },
                    }
                  )}
                </p>
              )
            })}
        </section>
      )}
    </>
  )
}
