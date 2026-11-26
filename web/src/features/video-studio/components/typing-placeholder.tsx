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
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/** Delay before the next character: wide CJK glyphs type slower. */
const TYPE_MS_WIDE = 110
const TYPE_MS_NARROW = 45
const HOLD_MS = 2200
const DELETE_MS = 18
const NEXT_LINE_MS = 450
const WIDE_CHAR = /[⺀-鿿가-힯＀-￯]/
const SPARK_GLYPHS = ['*', '+', '.', '·', "'", '`', '^', '~']

type Phase = 'typing' | 'holding' | 'deleting'

interface TypingPlaceholderProps {
  /** Lines typed one after another, looping; the first is the instruction. */
  lines: string[]
}

/**
 * Placeholder that types its lines character by character, then erases them
 * and types the next one. Each typed character makes the caret hop and throws
 * a few ASCII sparks. Visitors who prefer reduced motion see the first line
 * as plain text. Decorative only: the textarea keeps its own placeholder for
 * assistive technology.
 */
export function TypingPlaceholder(props: TypingPlaceholderProps) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [lineIndex, setLineIndex] = useState(0)
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden
  )
  const caretRef = useRef<HTMLSpanElement>(null)
  const sparksRef = useRef<HTMLSpanElement>(null)
  const line = props.lines[lineIndex % props.lines.length] ?? ''
  const chars = useMemo(() => [...line], [line])

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (reducedMotion || hidden) return
    let delay: number
    let step: () => void
    if (phase === 'typing' && count < chars.length) {
      delay = WIDE_CHAR.test(chars[count]) ? TYPE_MS_WIDE : TYPE_MS_NARROW
      step = () => setCount(count + 1)
    } else if (phase === 'typing') {
      delay = 0
      step = () => setPhase('holding')
    } else if (phase === 'holding') {
      delay = HOLD_MS
      step = () => setPhase('deleting')
    } else if (count > 0) {
      delay = DELETE_MS
      step = () => setCount(count - 1)
    } else {
      delay = NEXT_LINE_MS
      step = () => {
        setLineIndex((index) => (index + 1) % props.lines.length)
        setPhase('typing')
      }
    }
    const timer = window.setTimeout(step, delay)
    return () => window.clearTimeout(timer)
  }, [reducedMotion, hidden, phase, count, chars, props.lines.length])

  // Every typed character: the caret hops and throws sparks.
  useEffect(() => {
    if (reducedMotion || phase !== 'typing' || count === 0) return
    const caret = caretRef.current
    const sparks = sparksRef.current
    if (!caret || !sparks || typeof caret.animate !== 'function') return
    caret.animate(
      [
        { transform: 'translateY(0) scaleY(1)' },
        { transform: 'translateY(-2px) scaleY(1.3)' },
        { transform: 'translateY(0) scaleY(1)' },
      ],
      { duration: 180, easing: 'ease-out' }
    )
    for (let i = 0; i < 3; i++) {
      const spark = document.createElement('span')
      spark.textContent =
        SPARK_GLYPHS[Math.floor(Math.random() * SPARK_GLYPHS.length)]
      spark.className =
        'absolute left-0 top-0 text-micro font-mono leading-none'
      // Sideways and down, so the top edge of the box does not clip them.
      const angle = ((Math.random() * 150 - 60) * Math.PI) / 180
      const distance = 8 + Math.random() * 12
      const x = Math.cos(angle) * distance
      const y = Math.sin(angle) * distance
      sparks.append(spark)
      const animation = spark.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0.6)`,
            opacity: 0,
          },
        ],
        { duration: 500 + Math.random() * 300, easing: 'ease-out' }
      )
      animation.onfinish = () => spark.remove()
    }
  }, [reducedMotion, phase, count])

  if (reducedMotion) {
    return <span data-testid='prompt-typing'>{props.lines[0]}</span>
  }

  return (
    <span data-testid='prompt-typing'>
      {chars.slice(0, count).join('')}
      <span
        ref={caretRef}
        className={cn(
          'bg-primary relative ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.15em] rounded-full',
          phase === 'holding' && 'animate-pulse'
        )}
      >
        <span
          ref={sparksRef}
          className='text-primary pointer-events-none absolute top-1/2 left-1/2'
        />
      </span>
    </span>
  )
}
