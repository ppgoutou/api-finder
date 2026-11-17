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
import { useEffect, useRef, useState } from 'react'

const ROLL_DURATION_MS = 700

interface PriceParts {
  prefix: string
  amount: number
  fractionDigits: number
  suffix: string
}

/** Splits a formatted price such as "¥0.37" around its number. */
function parsePrice(text: string): PriceParts | null {
  const match = /^(\D*?)(\d[\d,]*(?:\.(\d+))?)(.*)$/.exec(text)
  if (!match) return null
  const amount = Number(match[2].replaceAll(',', ''))
  if (!Number.isFinite(amount)) return null
  return {
    prefix: match[1],
    amount,
    fractionDigits: match[3]?.length ?? 0,
    suffix: match[4],
  }
}

interface RollingPriceProps {
  /** The formatted price to show. */
  value: string
  className?: string
}

/**
 * A formatted price that rolls to its new value when it changes, so switching
 * between standard and VIP prices visibly counts down or up. The first render
 * and viewers who prefer reduced motion get the value at once.
 */
export function RollingPrice(props: RollingPriceProps) {
  // The frame text, tagged with the value it rolls toward so a stale frame
  // never outlives a later value.
  const [rolling, setRolling] = useState<{ target: string; text: string }>()
  const shownRef = useRef(props.value)

  useEffect(() => {
    const from = parsePrice(shownRef.current)
    const to = parsePrice(props.value)
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (
      !from ||
      !to ||
      from.prefix !== to.prefix ||
      from.suffix !== to.suffix ||
      from.amount === to.amount ||
      reduceMotion
    ) {
      shownRef.current = props.value
      return
    }
    const fractionDigits = Math.max(from.fractionDigits, to.fractionDigits)
    const startedAt = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - startedAt) / ROLL_DURATION_MS)
      if (progress >= 1) {
        shownRef.current = props.value
        setRolling(undefined)
        return
      }
      const eased = 1 - Math.pow(1 - progress, 3)
      const amount = from.amount + (to.amount - from.amount) * eased
      const text = `${to.prefix}${amount.toFixed(fractionDigits)}${to.suffix}`
      shownRef.current = text
      setRolling({ target: props.value, text })
      frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [props.value])

  if (rolling?.target !== props.value) {
    return <span className={props.className}>{props.value}</span>
  }
  return (
    <span className={props.className}>
      <span aria-hidden='true'>{rolling.text}</span>
      <span className='sr-only'>{props.value}</span>
    </span>
  )
}
