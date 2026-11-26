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

import { cn } from '@/lib/utils'

import { canPlayHomeMotion } from '../lib/home-motion'

/** Characters typed per second. */
export const TYPED_PROMPT_SPEED = 60

interface TypedPromptProps {
  text: string
  className?: string
}

/**
 * A prompt that types itself out the first time it scrolls into view. The
 * untyped rest keeps its space, so the card does not grow while typing, and
 * screen readers get the whole prompt at once. Without motion it shows in
 * full.
 */
export function TypedPrompt(props: TypedPromptProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [started, setStarted] = useState(false)
  const [typed, setTyped] = useState(() =>
    canPlayHomeMotion() ? 0 : Number.POSITIVE_INFINITY
  )
  const length = props.text.length
  const done = typed >= length

  useEffect(() => {
    const element = ref.current
    if (started || done || !element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setStarted(true)
        observer.disconnect()
      },
      { threshold: 0.6 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [started, done])

  useEffect(() => {
    if (!started || done) return
    const startedAt = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const count = Math.floor(((now - startedAt) / 1000) * TYPED_PROMPT_SPEED)
      setTyped(count)
      if (count < length) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [started, done, length])

  const shown = props.text.slice(0, typed)
  const rest = props.text.slice(typed)

  return (
    <p ref={ref} className={cn(props.className)}>
      <span className='sr-only'>{props.text}</span>
      <span aria-hidden>
        {shown}
        {!done && <span className='cinema-caret' />}
        {rest && <span className='invisible'>{rest}</span>}
      </span>
    </p>
  )
}
