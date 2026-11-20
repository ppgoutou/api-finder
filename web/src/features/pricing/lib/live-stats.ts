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
import { randomInRange, seededRandom } from './seed'

// ----------------------------------------------------------------------------
// Display figures for the model plaza hero
// ----------------------------------------------------------------------------
//
// The success rate and average generation time under the hero title are
// generated, not measured. Each Beijing day starts from a seeded value and
// walks forward one step per minute, so every visitor sees the same figure at
// the same moment, a refresh never jumps, and nothing is fetched.

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const BEIJING_OFFSET_MS = 8 * 3_600_000

export const SUCCESS_RATE_MIN = 92
export const SUCCESS_RATE_MAX = 98
/** Largest change of the success rate from one minute to the next. */
export const SUCCESS_RATE_STEP = 0.01
/** Largest change of the average time from one minute to the next. */
export const DURATION_STEP = 0.05

/** Beijing 03:00–09:00 shows 2–5 minutes, the rest of the day 5–9 minutes. */
export function durationRangeSeconds(minuteOfDay: number): [number, number] {
  if (minuteOfDay >= 180 && minuteOfDay < 540) return [120, 300]
  return [300, 540]
}

export type LiveStats = {
  /** Percent, one decimal place, between 92.0 and 98.0. */
  successRate: number
  /** Whole seconds. */
  durationSeconds: number
}

/** The figures shown at `nowMs`; the same for every caller within a minute. */
export function getLiveStats(nowMs: number): LiveStats {
  const beijingMs = nowMs + BEIJING_OFFSET_MS
  const day = Math.floor(beijingMs / DAY_MS)
  const minuteOfDay = Math.floor((beijingMs - day * DAY_MS) / MINUTE_MS)
  const rand = seededRandom(day * 7919 + 17)
  const step = (max: number) => 1 + (rand() * 2 - 1) * max

  let rate = randomInRange(rand, SUCCESS_RATE_MIN, SUCCESS_RATE_MAX)
  const [startMin, startMax] = durationRangeSeconds(0)
  let seconds = randomInRange(rand, startMin, startMax)
  for (let minute = 1; minute <= minuteOfDay; minute++) {
    rate = Math.min(
      SUCCESS_RATE_MAX,
      Math.max(SUCCESS_RATE_MIN, rate * step(SUCCESS_RATE_STEP))
    )
    const [min, max] = durationRangeSeconds(minute)
    seconds = Math.min(max, Math.max(min, seconds * step(DURATION_STEP)))
  }

  return {
    successRate: Math.round(rate * 10) / 10,
    durationSeconds: Math.round(seconds),
  }
}

/** Milliseconds until the figures next change. */
export function msUntilNextMinute(nowMs: number): number {
  return MINUTE_MS - (nowMs % MINUTE_MS)
}
