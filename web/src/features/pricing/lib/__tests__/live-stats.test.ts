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
import { describe, expect, it } from 'vitest'

import {
  durationRangeSeconds,
  getLiveStats,
  msUntilNextMinute,
} from '../live-stats'

const MINUTE = 60_000
// 2026-11-20 00:00 in Beijing (UTC+8).
const BEIJING_MIDNIGHT = Date.UTC(2026, 10, 19, 16, 0, 0)

function beijingMinute(minuteOfDay: number, seconds = 0): number {
  return BEIJING_MIDNIGHT + minuteOfDay * MINUTE + seconds * 1000
}

const dayOfStats = Array.from({ length: 1440 }, (_, minute) =>
  getLiveStats(beijingMinute(minute))
)

describe('pricing hero live stats', () => {
  it('keeps the success rate between 92.0 and 98.0 with one decimal all day', () => {
    for (const stats of dayOfStats) {
      expect(stats.successRate).toBeGreaterThanOrEqual(92)
      expect(stats.successRate).toBeLessThanOrEqual(98)
      expect(Math.round(stats.successRate * 10)).toBeCloseTo(
        stats.successRate * 10,
        6
      )
    }
  })

  it('moves the success rate at most 1% between minutes', () => {
    for (let minute = 1; minute < dayOfStats.length; minute++) {
      const previous = dayOfStats[minute - 1].successRate
      const change = Math.abs(dayOfStats[minute].successRate - previous)
      // 0.1 allows for rounding to one decimal place.
      expect(change).toBeLessThanOrEqual(previous * 0.01 + 0.1)
    }
  })

  it('shows 2–5 minutes from 03:00 to 09:00 Beijing time and 5–9 minutes otherwise', () => {
    dayOfStats.forEach((stats, minute) => {
      const night = minute >= 180 && minute < 540
      expect(stats.durationSeconds).toBeGreaterThanOrEqual(night ? 120 : 300)
      expect(stats.durationSeconds).toBeLessThanOrEqual(night ? 300 : 540)
    })
  })

  it('moves the average time at most 5% between minutes inside one time window', () => {
    for (let minute = 1; minute < dayOfStats.length; minute++) {
      if (minute === 180 || minute === 540) continue
      const previous = dayOfStats[minute - 1].durationSeconds
      const change = Math.abs(dayOfStats[minute].durationSeconds - previous)
      // 1 second allows for rounding to whole seconds.
      expect(change).toBeLessThanOrEqual(previous * 0.05 + 1)
    }
  })

  it('returns the same figures for every moment within one minute', () => {
    expect(getLiveStats(beijingMinute(600, 1))).toEqual(
      getLiveStats(beijingMinute(600, 59))
    )
  })

  it('starts a different walk on another day', () => {
    const today = getLiveStats(beijingMinute(600))
    const tomorrow = getLiveStats(beijingMinute(600) + 1440 * MINUTE)
    expect(tomorrow).not.toEqual(today)
  })

  it('names the window edges of the average time', () => {
    expect(durationRangeSeconds(179)).toEqual([300, 540])
    expect(durationRangeSeconds(180)).toEqual([120, 300])
    expect(durationRangeSeconds(539)).toEqual([120, 300])
    expect(durationRangeSeconds(540)).toEqual([300, 540])
  })

  it('waits until the next whole minute before changing', () => {
    expect(msUntilNextMinute(beijingMinute(10, 45))).toBe(15_000)
    expect(msUntilNextMinute(beijingMinute(10))).toBe(MINUTE)
  })
})
