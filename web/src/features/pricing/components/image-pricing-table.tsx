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
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { formatTaskUsageUnitPrice } from '../lib/dynamic-price'
import { getConfiguredGroupRatio } from '../lib/model-helpers'
import { taskEnumLabel, taskUsageUnitLabel } from '../lib/task-price-display'
import {
  IMAGE_COUNT_FIELD,
  IMAGE_PRICE_FRACTION_DIGITS,
  type ImagePricing,
} from '../lib/video-pricing'
import {
  getCardVipRatios,
  type CardVipRatios,
  type VipPriceContext,
} from '../lib/vip-price'
import type { PricingModel } from '../types'
import { CardVipFootnote } from './card-vip-price'

type ImagePricingTableProps = {
  model: PricingModel
  pricing: ImagePricing
  /** Standard groups the viewer can use; each has its own table. */
  groups: string[]
  groupRatio: Record<string, number>
  /** The ratios the model's card compares, for a viewer of VIP groups only. */
  vipRatios: CardVipRatios | null
  vip?: VipPriceContext
  priceRate: number
  usdExchangeRate: number
  showRechargePrice: boolean
}

type ImagePricingRow = ImagePricing['rows'][number]
type ImagePricingGroup = {
  group: string
  ratio: number
  vipRatios: CardVipRatios | null
}

/** Equal-width, centered columns; a phone keeps them within the screen. */
const headClass =
  'h-auto px-1 py-2 text-center text-xs font-medium whitespace-normal sm:px-2'
const cellClass = 'px-1 py-2.5 text-center whitespace-normal sm:px-2'
const priceCellClass = 'font-mono text-xs tabular-nums sm:text-sm'

/** Standard and VIP price of one image, for each option such as resolution. */
export function ImagePricingTable(props: ImagePricingTableProps) {
  const { t, i18n } = useTranslation()
  // Prices follow the site currency; re-render when it changes.
  useSystemConfigStore((state) => state.config.currency)
  const schema = props.model.billing_usage_schema
  const optionField = props.pricing.optionField
  const unit = schema?.[IMAGE_COUNT_FIELD]
    ? taskUsageUnitLabel(schema[IMAGE_COUNT_FIELD], i18n.language, t('image'))
    : t('request')

  const groups = props.groups.map((group): ImagePricingGroup => {
    const vipRatios = getCardVipRatios(props.model, group, props.vip)
    return {
      group,
      ratio:
        vipRatios?.standardRatio ??
        getConfiguredGroupRatio(props.groupRatio, group),
      vipRatios,
    }
  })
  if (groups.length === 0 && props.vipRatios) {
    groups.push({
      group: 'default',
      ratio: props.vipRatios.standardRatio,
      vipRatios: props.vipRatios,
    })
  }
  const formatPrice = (price: number, ratio: number) =>
    formatTaskUsageUnitPrice(price, {
      tokenUnit: 'M',
      showRechargePrice: props.showRechargePrice,
      priceRate: props.priceRate,
      usdExchangeRate: props.usdExchangeRate,
      groupRatioMultiplier: ratio,
      fractionDigits: IMAGE_PRICE_FRACTION_DIGITS,
    })

  function columns(
    entry: ImagePricingGroup
  ): StaticDataTableColumn<ImagePricingRow>[] {
    const list: StaticDataTableColumn<ImagePricingRow>[] = []
    if (optionField) {
      list.push({
        id: 'option',
        header: t('Resolution'),
        className: headClass,
        cellClassName: cn(cellClass, 'font-medium'),
        cell: (row) =>
          taskEnumLabel(schema?.[optionField], row.option ?? '', i18n.language),
      })
    }
    list.push({
      id: 'standard',
      header: `${t('Standard price')} / ${unit}`,
      className: headClass,
      cellClassName: cn(
        cellClass,
        priceCellClass,
        entry.vipRatios ? 'text-muted-foreground' : 'font-semibold'
      ),
      cell: (row) => formatPrice(row.price, entry.ratio),
    })
    const vipRatios = entry.vipRatios
    if (!vipRatios) return list
    list.push(
      {
        id: 'vip',
        header: `${t('VIP price')} / ${unit}`,
        className: cn(headClass, 'text-vip'),
        cellClassName: cn(cellClass, priceCellClass, 'text-vip font-semibold'),
        cell: (row) => formatPrice(row.price, vipRatios.vipRatio),
      },
      {
        id: 'saving',
        header: t('You save'),
        className: headClass,
        cellClassName: cellClass,
        cell: () => (
          <span className='bg-vip text-vip-foreground rounded-full px-1.5 py-px text-xs font-semibold whitespace-nowrap'>
            {t('Save {{percent}}%', { percent: vipRatios.savingPercent })}
          </span>
        ),
      }
    )
    return list
  }

  const offersVip = groups.some((entry) => entry.vipRatios !== null)

  return (
    <section aria-label={t('Price per image')} className='space-y-4'>
      {groups.map((entry) => (
        <div key={entry.group} className='space-y-2'>
          {/* A lone default group needs no label. */}
          {(groups.length > 1 || entry.group !== 'default') && (
            <GroupBadge group={entry.group} size='sm' />
          )}
          <StaticDataTable
            tableClassName='table-fixed text-sm'
            headerRowClassName='hover:bg-transparent'
            data={props.pricing.rows}
            getRowKey={(row) => row.option ?? ''}
            columns={columns(entry)}
          />
        </div>
      ))}
      {offersVip && <CardVipFootnote isVip={props.vip?.isVip === true} />}
    </section>
  )
}
