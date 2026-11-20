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
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCountUp } from '../use-count-up'

function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce }) as unknown as MediaQueryList)
  )
}

describe('useCountUp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows the final value at once when the viewer asks for reduced motion', () => {
    mockMotion(true)

    const { result } = renderHook(() => useCountUp(97.6))

    expect(result.current).toBe(97.6)
  })

  it('counts up from zero and lands exactly on the final value', () => {
    mockMotion(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })

    const { result } = renderHook(() => useCountUp(15, 1000))
    expect(result.current).toBe(0)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(15)

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(15)
  })

  it('jumps to a new value once the first count has finished', () => {
    mockMotion(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })

    const { result, rerender } = renderHook(
      (end: number) => useCountUp(end, 100),
      {
        initialProps: 15,
      }
    )
    act(() => {
      vi.advanceTimersByTime(200)
    })

    rerender(16)

    expect(result.current).toBe(16)
  })
})
