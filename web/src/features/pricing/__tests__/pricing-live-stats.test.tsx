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
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PricingLiveStats } from '../components/pricing-live-stats'
import { getLiveStats } from '../lib/live-stats'

// 2026-11-20 10:00:30 in Beijing (UTC+8), in the 5–9 minute window.
const START = Date.UTC(2026, 10, 20, 2, 0, 30)

function shown(label: string): string {
  const term = screen.getByText(label)
  return term.nextElementSibling?.textContent ?? ''
}

function expectedDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

describe('pricing live stats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the success rate with one decimal and the average time in minutes and seconds', () => {
    render(<PricingLiveStats />)

    const stats = getLiveStats(START)
    expect(shown('Success rate, last 24 h')).toBe(
      `${stats.successRate.toFixed(1)}%`
    )
    expect(shown('Avg. generation time')).toBe(
      expectedDuration(stats.durationSeconds)
    )
  })

  it('switches to the next figures when the next minute starts', () => {
    render(<PricingLiveStats />)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    const next = getLiveStats(START + 30_000)
    expect(shown('Success rate, last 24 h')).toBe(
      `${next.successRate.toFixed(1)}%`
    )
    expect(shown('Avg. generation time')).toBe(
      expectedDuration(next.durationSeconds)
    )
  })
})
