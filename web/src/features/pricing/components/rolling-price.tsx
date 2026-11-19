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

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Each digit starts rolling this much later than the one to its left. */
const DIGIT_STAGGER_MS = 35

interface RollingPriceProps {
  /** The formatted price to show. */
  value: string
  className?: string
}

/**
 * A formatted price whose digits roll like an odometer when it changes, so
 * switching between standard and VIP prices visibly drops or climbs. A digit
 * rolls from the one in the same decimal place before, left to right; a
 * digit the price gains rolls up from 0. The first render shows the price at
 * once, and viewers who prefer reduced motion see every change at once.
 *
 * The rolling characters are drawn by CSS (`price-roll-*` in index.css), so
 * the element's text stays the price itself.
 */
export function RollingPrice(props: RollingPriceProps) {
  // Digits that appear after the first paint roll in from 0; the ones on
  // the first paint are simply there.
  const [rollsIn, setRollsIn] = useState(false)
  useEffect(() => setRollsIn(true), [])

  const chars = [...props.value]
  const pointIndex = chars.includes('.') ? chars.indexOf('.') : chars.length
  const shown: ReactNode[] = []
  let digitCount = 0
  for (const [index, char] of chars.entries()) {
    // Keyed by decimal place, so $9.9 → $10.5 rolls ones into ones.
    const key = `place${index - pointIndex}`
    if (char < '0' || char > '9') {
      shown.push(
        <span key={key} data-char={char} className='price-roll-char' />
      )
      continue
    }
    const delay = digitCount * DIGIT_STAGGER_MS
    digitCount += 1
    shown.push(
      <span
        key={key}
        data-digit={char}
        className='inline-block h-[1lh] overflow-hidden'
      >
        <span
          style={
            {
              '--price-digit-offset': `${-Number(char) * 10}%`,
              transitionDelay: `${delay}ms`,
            } as CSSProperties
          }
          className={cn(
            'price-roll-strip block translate-y-(--price-digit-offset) transition-[translate] duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
            rollsIn && 'starting:translate-y-0'
          )}
        />
      </span>
    )
  }

  return (
    <span className={props.className}>
      <span className='sr-only'>{props.value}</span>
      <span aria-hidden='true' className='inline-flex items-start'>
        {shown}
      </span>
    </span>
  )
}
