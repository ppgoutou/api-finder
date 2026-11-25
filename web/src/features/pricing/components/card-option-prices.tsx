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
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { RollingPrice } from './rolling-price'

// VIP prices take the VIP violet, matching the VIP badge elsewhere.
const VIP_ACCENT_CLASS = 'border-vip bg-vip text-vip-foreground'
export const VIP_PRICE_TEXT_CLASS = 'text-vip'

interface CardOptionPricesProps {
  /** Accessible name of the list of options. */
  label: string
  /** What one price buys, such as "/s from". */
  unit: string
  /** One row per option; a single row without a label is the only price. */
  rows: { key: string; label?: string; price: string }[]
  /** The row shown as the headline and accented in the list. */
  lowestIndex: number
  showVip: boolean
  /** Accent of the cheapest option while standard prices are shown. */
  accentClass: string
  /** The saving shown beside a VIP headline. */
  saving: ReactNode
}

/** A card's headline price and, below it, the price of every option. */
export function CardOptionPrices(props: CardOptionPricesProps) {
  const lowest = props.rows[props.lowestIndex]
  return (
    <>
      <p className='col-span-full flex min-w-0 flex-wrap items-end gap-x-2'>
        <RollingPrice
          value={lowest.price}
          className={cn(
            'font-price text-price tabular-nums',
            props.showVip && VIP_PRICE_TEXT_CLASS
          )}
        />
        <span className='text-muted-foreground pb-0.5 text-xs'>
          {props.unit}
          {lowest.label && ` · ${lowest.label}`}
        </span>
        {props.saving}
      </p>
      {lowest.label && (
        <dl
          aria-label={props.label}
          className='col-span-full flex flex-wrap gap-1.5'
        >
          {props.rows.map((row, index) => (
            <div
              key={row.key}
              className={cn(
                'border-border bg-card flex min-w-0 items-baseline gap-1 rounded-full border px-2.5 py-0.5',
                index === props.lowestIndex &&
                  (props.showVip ? VIP_ACCENT_CLASS : props.accentClass)
              )}
            >
              <dt className='shrink-0 text-xs font-medium'>{row.label}</dt>
              <dd className='font-price truncate text-xs font-bold tabular-nums'>
                <RollingPrice value={row.price} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}
