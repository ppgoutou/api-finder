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
import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

/*
 * Christmas decorations, shown only while the holiday theme is on. They are
 * decoration: hidden from assistive technology and never take pointer events.
 * Their colours and motion live in styles/index.css (`holiday-*`).
 */

const FLAKE_COUNT = 48
const BULB_COUNT = 28

// Fixed pseudo-random spread, so flakes keep their places between renders.
function spread(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

const FLAKES: { id: string; style: CSSProperties }[] = Array.from(
  { length: FLAKE_COUNT },
  (_, i) => {
    const size = 2 + spread(i, 1) * 4
    const style: CSSProperties = {
      left: `${(spread(i, 2) * 100).toFixed(2)}%`,
      width: `${size.toFixed(1)}px`,
      height: `${size.toFixed(1)}px`,
      opacity: Number((0.35 + spread(i, 3) * 0.55).toFixed(2)),
      animationDuration: `${(8 + spread(i, 4) * 10).toFixed(1)}s`,
      animationDelay: `-${(spread(i, 5) * 18).toFixed(1)}s`,
    }
    return { id: `flake-${i}`, style }
  }
)

/** Light snow falling over its positioned parent. Phones get half as much. */
export function HolidaySnow(props: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        props.className
      )}
    >
      {FLAKES.map((flake, index) => (
        <span
          key={flake.id}
          className={cn(
            'holiday-snowflake',
            index % 2 === 1 && 'max-sm:hidden'
          )}
          style={flake.style}
        />
      ))}
    </div>
  )
}

const BULB_TONES = ['warm', 'red', 'amber', 'green'] as const
const BULBS = Array.from({ length: BULB_COUNT }, (_, i) => `bulb-${i}`)

/** A string of twinkling bulbs along the bottom of its positioned parent. */
export function HolidayLights(props: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 h-8 overflow-hidden',
        props.className
      )}
    >
      <svg
        className='holiday-wire absolute inset-x-0 top-0 h-6 w-full'
        viewBox='0 0 1280 24'
        preserveAspectRatio='none'
      >
        <path
          d='M0 4 Q 80 22 160 4 T 320 4 T 480 4 T 640 4 T 800 4 T 960 4 T 1120 4 T 1280 4'
          fill='none'
          strokeWidth='1.5'
        />
      </svg>
      <div className='absolute inset-x-0 top-1.5 flex justify-around px-5'>
        {BULBS.map((bulb, index) => (
          <span
            key={bulb}
            className={cn(
              'holiday-bulb',
              `holiday-bulb-${BULB_TONES[index % BULB_TONES.length]}`,
              index % 2 === 0 ? 'mt-2.5' : 'mt-0.5',
              index % 2 === 1 && 'max-sm:hidden'
            )}
            style={{ animationDelay: `${((index * 0.37) % 2.4).toFixed(2)}s` }}
          />
        ))}
      </div>
    </div>
  )
}

/** A Santa hat that sits on the top-right corner of a logo. */
export function HolidayHat(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox='0 0 26 22'
      className={cn(
        'pointer-events-none absolute -top-[45%] -right-[35%] w-[80%] rotate-[18deg]',
        props.className
      )}
    >
      <path
        className='holiday-hat-red'
        d='M3 18 C6 8 12 2 20 4 C17 7 16 11 17 16 Z'
      />
      <rect
        className='holiday-hat-fur'
        x='1'
        y='15'
        width='18'
        height='5'
        rx='2.5'
      />
      <circle className='holiday-hat-fur' cx='21' cy='4' r='3' />
    </svg>
  )
}
