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

import { getStatusConfig } from '../lib/billing'
import type { TopupStatus } from '../types'

describe('getStatusConfig', () => {
  it.each([
    ['refunded', 'Refunded', 'neutral'],
    ['disputed', 'Disputed', 'danger'],
  ] as const)(
    'shows a reversed Stripe top-up with status %s as %s instead of pending',
    (status, label, variant) => {
      expect(getStatusConfig(status)).toEqual({ label, variant })
    }
  )

  it('shows a failed top-up as Failed instead of pending', () => {
    expect(getStatusConfig('failed')).toEqual({
      label: 'Failed',
      variant: 'danger',
    })
  })

  it('falls back to pending for a status the console does not know', () => {
    expect(getStatusConfig('unknown' as TopupStatus).label).toBe('Pending')
  })
})
