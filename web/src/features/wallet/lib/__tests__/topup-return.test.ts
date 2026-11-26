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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sanitizeAuthRedirect } from '@/features/auth/lib/auth-redirect'

import {
  clearTopupStart,
  readTopupStart,
  rememberTopupStart,
} from '../topup-return'

afterEach(() => {
  window.sessionStorage.clear()
  vi.useRealTimers()
})

describe('top-up start', () => {
  it('remembers the balance before paying for two hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    rememberTopupStart(500)

    expect(readTopupStart(1_000_000 + 60_000)).toEqual({
      quota: 500,
      at: 1_000_000,
    })
    expect(readTopupStart(1_000_000 + 2 * 60 * 60 * 1000)).toBeNull()
  })

  it('forgets the start once cleared or when the stored value is broken', () => {
    rememberTopupStart(500)
    clearTopupStart()
    expect(readTopupStart(Date.now())).toBeNull()

    window.sessionStorage.setItem('wallet:topup-start', '{"quota":"x"}')
    expect(readTopupStart(Date.now())).toBeNull()
  })
})

describe('sign-up redirect to the studio', () => {
  const origin = 'https://api-finder.com'

  it('follows the studio path on this site', () => {
    expect(sanitizeAuthRedirect('/video-studio', origin)).toBe('/video-studio')
  })

  it.each([
    'https://evil.example/video-studio',
    '//evil.example/video-studio',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('does not follow %s', (target) => {
    expect(sanitizeAuthRedirect(target, origin)).toBeNull()
  })
})
