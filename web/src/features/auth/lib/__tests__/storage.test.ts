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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  AFFILIATE_CODE_TTL_MS,
  getAffiliateCode,
  saveAffiliateCode,
} from '../storage'

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

it('returns the latest saved invitation code within 30 days', () => {
  saveAffiliateCode('FIRST001')
  saveAffiliateCode('V72X9N6C')
  vi.advanceTimersByTime(AFFILIATE_CODE_TTL_MS - 1000)

  expect(getAffiliateCode()).toBe('V72X9N6C')
})

it('forgets the invitation code once 30 days have passed', () => {
  saveAffiliateCode('V72X9N6C')
  vi.advanceTimersByTime(AFFILIATE_CODE_TTL_MS + 1000)

  expect(getAffiliateCode()).toBe('')
  expect(window.localStorage.getItem('aff')).toBeNull()
})

it('keeps a plain code written by older builds', () => {
  window.localStorage.setItem('aff', 'aB3d')

  expect(getAffiliateCode()).toBe('aB3d')
})
