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
import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A figure that counts up from zero to `end` the first time it shows, easing
 * out over `durationMs`. Later changes of `end` jump straight to the new value.
 * Viewers who ask for reduced motion, and environments without
 * `matchMedia`, see the final value at once.
 */
export function useCountUp(end: number, durationMs = 1100): number {
  const [value, setValue] = useState(end)
  const playedRef = useRef(false)

  useLayoutEffect(() => {
    const reduceMotion =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (playedRef.current || reduceMotion || end <= 0) {
      setValue(end)
      return
    }

    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      setValue(end * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) {
        frame = requestAnimationFrame(step)
        return
      }
      playedRef.current = true
    }
    setValue(0)
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [end, durationMs])

  return value
}
